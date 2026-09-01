"""Sentiment scout: the daily social history behind the trend chart.

One row per ticker per trading day, built from posts the run was going to fetch
anyway. There is no crawl and no raw post table, which is the whole difference
between this and the attempt reverted in d110700: that one seeded each new ticker
by walking twelve pages back, and on the first night every ticker seeded at once.

A day is ACCUMULATED rather than overwritten. The scout runs on every user refresh
as well as nightly, and each run only sees the posts still inside its page window,
so the row keeps running sums and a high water mark instead of a finished average.
Because StockTwits message ids are monotonic, "count only the posts above the last
id we counted" is exact deduplication in a single integer, which is what lets the
posts themselves be thrown away.
"""

from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from typing import Any

from .ss_aggregation import SentimentAggregator
from .ss_config import SentimentConfig
from .ss_payloads import SocialPayloadBuilder
from .ss_scoring import MentionScorer
from .ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")

#: Rows past this age are dropped. Comfortably beyond any window we serve, so
#: widening the chart later does not need the pruner revisited first.
RETENTION_DAYS = 30


def utc_now() -> datetime.datetime:
	return datetime.datetime.now(datetime.timezone.utc)


def window_days(days: int, today: datetime.date | None = None) -> list[datetime.date]:
	"""The last ``days`` calendar days, oldest first, ending today.

	Calendar rather than trading days. Weekend posts count and get their own bars: for
	equities those bars will be short or empty, which the chart draws as a break in the
	line rather than a drop to zero, and for crypto they are real trading. Folding a
	weekend into Monday would make one bar mean three days, and dropping it would lose
	genuine crypto activity.

	Counting backwards a fixed number of steps rather than forwards from a cutoff is
	what keeps the window exactly ``days`` long. The reverted build took a rolling
	``now - N`` timestamp and counted inclusively from its date, which is how a seven
	day window came to render eight columns.
	"""
	end = today or utc_now().date()
	return [end - datetime.timedelta(days=offset) for offset in range(days - 1, -1, -1)]


class DailyAggregator(SentimentAggregator):
	"""Aggregator for a single day, with time decay switched off.

	Within one day a 09:00 post and a 21:00 post should count the same; the two day
	half life exists to compare days, not to grade inside one.

	This is also what makes the running sums valid. A post's weight must not change
	between samples, and the inherited recency weight would shrink it every hour.
	"""

	def recency_weight(self, created_at: str | None) -> float:
		return 1.0


class SocialDayBuilder:
	"""Turns one ticker's scored posts into day rows. Pure, no I/O."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.aggregator = DailyAggregator(self.config, self.registry)
		self.payload = SocialPayloadBuilder(self.aggregator, self.registry)

	def build(
		self, ticker: str, scored: list[dict[str, Any]], marks: dict[str, int] | None = None
	) -> list[dict[str, Any]]:
		"""Day rows for one ticker, one per calendar day that has new posts.

		``marks`` maps a day to the highest message id already counted into it, so a
		refresh an hour later contributes only what is genuinely new and an immediate
		re-run contributes nothing at all.

		This filter and the high water mark in the accumulate RPC are not the same
		guard, and dropping either breaks a different case. This one decides WHICH posts
		of an overlapping page window are new, which is the ordinary case: a refresh
		re-fetches the same fifty posts and two of them have never been seen. The RPC's
		check decides WHETHER a whole sample is new, which is the concurrent case: two
		writers reading the same mark and building the same row, where the second must
		be rejected outright. A sample carrying posts 1, 2 and 3 against a stored mark
		of 2 passes the RPC's check on its own, because its newest id is above the mark,
		and would then add all three.

		A day with no new posts produces no row. Quiet days are absent rather than
		written as explicit nulls; the serving side pads the window, which keeps the
		number of days in one place instead of two.
		"""
		marks = marks or {}
		by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)

		for item in scored:
			day = self._day_of(item)
			if day is None:
				continue
			mark = marks.get(day)
			message_id = item.get("message_id")
			# ``is not None`` rather than a zero default: a day we hold nothing for has
			# no mark at all, and defaulting it to zero would silently drop a post whose
			# id is zero.
			if mark is not None and message_id is not None and message_id <= mark:
				continue
			by_day[day].append(item)

		return [self._row(ticker, day, items) for day, items in sorted(by_day.items()) if items]

	def _day_of(self, item: dict[str, Any]) -> str | None:
		"""The UTC calendar day a post belongs to, or None if it carries no readable
		timestamp. The same YYYY-MM-DD key the frontend formats, so a bar and the posts
		under it never need either side to convert.

		Every day counts, weekends included. The build this came from dropped Saturday
		and Sunday posts here, which was defensible for equities and wrong for crypto.
		"""
		created = item.get("created_at")
		if not created:
			return None
		try:
			return datetime.date.fromisoformat(str(created)[:10]).isoformat()
		except ValueError:
			return None

	def _row(self, ticker: str, day: str, items: list[dict[str, Any]]) -> dict[str, Any]:
		threshold = MentionScorer.BULLISH_THRESHOLD
		weight_sum = 0.0
		weighted_score_sum = 0.0
		bullish = 0
		bearish = 0
		last_message_id = 0

		for item in items:
			raw = float(item.get("sentiment_raw") or 0.0)
			weight = max(0.0, float(item.get("weight") or 1.0))
			weight_sum += weight
			weighted_score_sum += raw * weight
			if raw >= threshold:
				bullish += 1
			elif raw <= -threshold:
				bearish += 1
			message_id = item.get("message_id")
			if message_id is not None:
				last_message_id = max(last_message_id, int(message_id))

		# Rounded first, then scored from the rounded values. The row has to be self
		# consistent: anyone recomputing the score from the two stored columns must get
		# the stored score back, or a day split across two samples drifts by a point
		# against the same day collected in one go.
		weight_sum = round(weight_sum, 4)
		weighted_score_sum = round(weighted_score_sum, 4)

		return {
			"ticker": ticker.upper(),
			"as_of_night": day,
			"post_count": len(items),
			"bullish_posts": bullish,
			"bearish_posts": bearish,
			"weight_sum": weight_sum,
			"weighted_score_sum": weighted_score_sum,
			"social_sentiment_score": score_from_sums(weighted_score_sum, weight_sum),
			"last_message_id": last_message_id,
			"top_posts": self._top_posts(items),
		}

	def _top_posts(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
		"""The day's most influential posts, in the shape the frontend already renders.

		Built through ``SocialPayloadBuilder`` so a stored post is the same object a
		live one is, which is what lets SocialPostRow read both without a branch. The
		ranking key is the one ``MentionScorer.score`` already uses for its top posts,
		and it is kept on the row so two samples of the same day can be compared.
		"""
		payload = self.payload.build(items)
		ranked = sorted(
			zip(payload, items),
			key=lambda pair: abs(float(pair[1].get("sentiment_raw") or 0.0))
			* max(0.0, float(pair[1].get("weight") or 1.0)),
			reverse=True,
		)[: self.config.social_day_top_posts]

		out = []
		for post, item in ranked:
			post = dict(post)
			post["rank"] = round(
				abs(float(item.get("sentiment_raw") or 0.0))
				* max(0.0, float(item.get("weight") or 1.0)),
				4,
			)
			out.append(post)
		return out


def score_from_sums(weighted_score_sum: float, weight_sum: float) -> int | None:
	"""The 0 to 100 score from a day's running sums.

	The same mapping ``MentionScorer.score`` applies to its own average, so a day's
	number and a run's number mean the same thing on the same scale.
	"""
	if weight_sum <= 0:
		return None
	average = weighted_score_sum / weight_sum
	return int(round(max(0.0, min(1.0, (average + 1.0) / 2.0)) * 100))


class SocialDailyRepository:
	"""Where the day rows live. One read and one write for a whole run."""

	TABLE = "social_sentiment_daily"
	#: The RPC that merges a whole run's rows under a row lock. See migrations/019.
	ACCUMULATE_RPC = "accumulate_social_days"
	SEED_MARK_RPC = "mark_social_seeded"
	#: Just enough to work out which posts a run has already counted. top_posts is
	#: deliberately absent: it is the only large column, it is replaced rather than
	#: merged, and reading it back for thirty tickers would turn a small read into a
	#: large one for nothing.
	MARK_COLUMNS = "ticker, as_of_night, last_message_id"
	READ_COLUMNS = (
		"ticker, as_of_night, social_sentiment_score, post_count, bullish_posts, "
		"bearish_posts, last_message_id, top_posts, summary"
	)
	CHUNK_SIZE = 100

	@staticmethod
	def _client():
		# Imported on call, never at module load. supabase_client raises at import when
		# its env vars are missing, and a missing database must degrade the history
		# rather than make the scout unimportable.
		from .supabase_client import supabase

		return supabase

	def read_marks(self, tickers: list[str], since: datetime.date) -> dict[tuple[str, str], int]:
		"""The highest message id already counted into each (ticker, day), in one read.

		Small enough to be worth the round trip: three narrow columns for thirty tickers
		over a week. Returning ``{}`` on failure is safe in the direction that matters,
		since the accumulate RPC still refuses a sample that is not newer than what is
		stored.
		"""
		if not tickers:
			return {}
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.MARK_COLUMNS)
				.in_("ticker", [t.upper() for t in tickers])
				.gte("as_of_night", since.isoformat())
				.execute()
			)
		except Exception as e:
			logger.info("Social daily mark read failed for %d tickers: %s", len(tickers), e)
			return {}
		return {
			(row["ticker"], str(row["as_of_night"])[:10]): int(row.get("last_message_id") or 0)
			for row in (res.data or [])
		}

	def accumulate(self, rows: list[dict[str, Any]]) -> int:
		"""Merge day rows into whatever is already stored. Never raises.

		The merge itself happens in Postgres, not here. A day is written by the nightly
		batch, by every user refresh and by the backfill, so two writers landing on the
		same (ticker, day) is ordinary rather than exotic, and reading a row into Python
		to add to it loses an increment whenever that happens. migrations/016 already
		established the house pattern for this with ``reserve_nlp_units``.

		Chunked for the same reason the recommendation insert is: one request carrying a
		whole run has been seen to trip "Server disconnected".
		"""
		if not rows:
			return 0
		written = 0
		for start in range(0, len(rows), self.CHUNK_SIZE):
			chunk = rows[start : start + self.CHUNK_SIZE]
			try:
				self._client().rpc(self.ACCUMULATE_RPC, {"p_rows": chunk}).execute()
				written += len(chunk)
			except Exception as e:
				logger.warning("Social daily accumulate failed (%d rows): %s", len(chunk), e)
		return written

	def mark_seeded(self, ticker: str, day: datetime.date) -> None:
		"""Record that this ticker's history has been walked, even though the walk found
		nothing. Without this a genuinely silent ticker is indistinguishable from one
		nobody has ever crawled, and it re-crawls on every page load forever."""
		try:
			self._client().rpc(
				self.SEED_MARK_RPC, {"p_ticker": ticker.upper(), "p_day": day.isoformat()}
			).execute()
		except Exception as e:
			logger.warning("Social seed mark failed for %s: %s", ticker, e)

	def seeded_tickers(self, tickers: list[str]) -> set[str]:
		"""Which of these have been walked before. The backfill's one question."""
		if not tickers:
			return set()
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select("ticker")
				.in_("ticker", [t.upper() for t in tickers])
				.not_.is_("seeded_at", "null")
				.execute()
			)
			return {row["ticker"] for row in (res.data or [])}
		except Exception as e:
			# Fail closed: an unreadable table must not be read as "nothing is seeded",
			# which would send the backfill crawling the whole universe again.
			logger.warning("Social seeded lookup failed for %d tickers: %s", len(tickers), e)
			return {t.upper() for t in tickers}

	def read_history(self, ticker: str, since: datetime.date) -> list[dict[str, Any]]:
		"""One ticker's stored days, oldest first."""
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.READ_COLUMNS)
				.eq("ticker", ticker.upper())
				.gte("as_of_night", since.isoformat())
				.order("as_of_night", desc=False)
				.execute()
			)
			return res.data or []
		except Exception as e:
			logger.info("Social daily history read failed for %s: %s", ticker, e)
			return []

	def prune(self, before: datetime.date) -> None:
		"""Drop rows past retention. Best effort."""
		try:
			self._client().table(self.TABLE).delete().lt(
				"as_of_night", before.isoformat()
			).execute()
		except Exception as e:
			logger.info("Social daily prune failed: %s", e)


class SocialHistory:
	"""Records the day rows a run produced, and serves them back to the chart."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		builder: SocialDayBuilder | None = None,
		repository: SocialDailyRepository | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.builder = builder or SocialDayBuilder(self.config, self.registry)
		self.repository = repository or SocialDailyRepository()
		self._pruned = False

	@property
	def enabled(self) -> bool:
		return self.config.social_history_enabled

	def record(
		self, scored_by_ticker: dict[str, list[dict[str, Any]]], seeded: bool = False
	) -> int:
		"""Write one run's worth of day rows. Never raises.

		Two round trips for the whole run, not two per ticker. save_top_assets is already
		about three seconds per ticker and that is what eats the request budget, so this
		deliberately batches every ticker into one read and one RPC call.

		The read works out which posts of an overlapping page window are new; the RPC
		merges under a row lock so that two writers who read the same marks cannot both
		apply the same increment. Both are needed and neither covers the other's case.

		``seeded`` marks these rows as the product of a history walk rather than a run.
		That is how a ticker stops being re-crawled once it has been done, and it is also
		what puts the write into replace mode: a walk has read each day end to end, so it
		states the day's total rather than offering an increment. Only SocialBackfiller
		sets it. Nothing reachable from a run can.
		"""
		if not self.enabled or not scored_by_ticker:
			return 0
		try:
			return self._record(scored_by_ticker, seeded)
		except Exception as e:
			# History is a view on work already done and persisted. A failure here must
			# never cost the run its sentiment scores.
			logger.warning("Social daily record failed: %s", e)
			return 0

	def _record(
		self, scored_by_ticker: dict[str, list[dict[str, Any]]], seeded: bool = False
	) -> int:
		tickers = sorted(scored_by_ticker)
		window = window_days(self.config.social_display_days)
		since = window[0] if window else utc_now().date()
		# A seed reads each day end to end, so it has nothing to filter and filtering it
		# would be actively wrong. The mark answers "which of these posts have I already
		# counted?", which only means something to a reader walking FORWARDS from what it
		# last saw. A seed walks backwards from the head, so its ids descend into the
		# stored mark rather than climbing past it, and the filter would drop the whole
		# sample. It does not need the guard either: it replaces the day outright in the
		# accumulate RPC (migrations/020) instead of adding to it.
		#
		# It also saves the read. A seed is one ticker, so this is one fewer round trip on
		# the path a page load waits behind.
		marks = {} if seeded else self.repository.read_marks(tickers, since)

		rows: list[dict[str, Any]] = []
		for ticker in tickers:
			sym = ticker.upper()
			ticker_marks = {
				day: mark for (row_ticker, day), mark in marks.items() if row_ticker == sym
			}
			for row in self.builder.build(sym, scored_by_ticker[ticker], ticker_marks):
				if seeded:
					row["seeded"] = True
				rows.append(row)

		written = self.repository.accumulate(rows)
		if written:
			logger.info("Social history wrote %d day rows for %d tickers", written, len(tickers))

		# A walk that came back with nothing still has to record that it happened, or
		# the ticker looks unseeded forever and crawls again on the next page load.
		if seeded:
			today = utc_now().date()
			written_tickers = {str(row["ticker"]).upper() for row in rows}
			for ticker in tickers:
				if ticker.upper() not in written_tickers:
					self.repository.mark_seeded(ticker, today)

		self._prune_once()
		return written

	def _prune_once(self) -> None:
		"""One delete per process, not per run. The rows are tiny, so retention is
		housekeeping rather than something the hot path should pay for."""
		if self._pruned:
			return
		self._pruned = True
		self.repository.prune(utc_now().date() - datetime.timedelta(days=RETENTION_DAYS))

	def is_seeded(self, ticker: str) -> bool:
		"""Whether this ticker's history has ever been walked. Drives the lazy seed."""
		return ticker.upper() in self.repository.seeded_tickers([ticker])

	def history(self, ticker: str, days: int | None = None) -> list[dict[str, Any]]:
		"""The trend series for one ticker, oldest first, padded to the full window.

		Every day in the window is present, weekends included. A day with no row comes
		back with a null score rather than a zero, because the two mean opposite things:
		the chart draws a gap for silence and would draw a crash for a zero.
		"""
		window = window_days(days or self.config.social_display_days)
		if not window:
			return []
		rows = {
			str(row["as_of_night"])[:10]: row
			for row in self.repository.read_history(ticker, window[0])
		}
		return [self._point(day, rows.get(day.isoformat())) for day in window]

	@staticmethod
	def _point(day: datetime.date, row: dict[str, Any] | None) -> dict[str, Any]:
		if row is None:
			return {
				"date": day.isoformat(),
				"score": None,
				"post_count": 0,
				"bullish": 0,
				"bearish": 0,
				"top_posts": [],
				"summary": None,
			}
		return {
			"date": day.isoformat(),
			"score": row.get("social_sentiment_score"),
			"post_count": row.get("post_count") or 0,
			"bullish": row.get("bullish_posts") or 0,
			"bearish": row.get("bearish_posts") or 0,
			"top_posts": row.get("top_posts") or [],
			"summary": row.get("summary"),
		}
