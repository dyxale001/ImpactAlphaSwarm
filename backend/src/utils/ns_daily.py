"""Sentiment scout: the daily news history behind the trend chart's news line.

One row per ticker per calendar day, built from articles the run has already fetched
and already scored. Nothing here calls an API, spends NLP budget, or adds a step the
run waits on: by the time this sees them the articles are in memory with their tier and
their sentiment attached, and this only groups them by date.

The counterpart to ss_daily, and deliberately simpler than it in two ways:

  * A day is STATED, not accumulated. StockTwits is paged, so a social run sees a
    moving window and has to add its sample to what is stored. News is read from a per
    ticker cache spanning the whole lookback, so a run sees a day's articles complete.
  * The whole window fills from one run. news_lookback_days of articles arrive together,
    so seven days of history exist after the first run rather than after seven nights.
    There is no crawl, no seed and no backfill job, which is the entire reason this
    feature does not repeat the history that migrations/019 had to be the third attempt
    at.

What it is NOT is the news sub-score, per day. That number applies recency decay across
the whole window, which is not a per day quantity; this switches decay off within a day
exactly as DailyAggregator does for social, so the two mean the same kind of thing as
each other and neither equals the blended figure on the card.
"""

from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from typing import Any

from .ss_config import SentimentConfig
from .ss_daily import DailyAggregator, RETENTION_DAYS, utc_now, window_days
from .ss_payloads import NewsPayloadBuilder
from .ss_scoring import MentionScorer
from .ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")


def score_from_signed(signed: float) -> int:
	"""Map an aggregated signed score in [-1, 1] onto the 0 to 100 scale.

	The same arithmetic ``MentionScorer.score`` and ``ss_daily.score_from_sums`` apply,
	repeated rather than imported from either because both reach it by a different route
	and neither exposes it as the shared step it actually is. A day's number and a run's
	number have to sit on one scale or the chart cannot be read against the card.
	"""
	return int(round(max(0.0, min(1.0, (signed + 1.0) / 2.0)) * 100))


class NewsDayBuilder:
	"""Turns one ticker's scored articles into day rows. Pure, no I/O."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		# Reused wholesale rather than reimplemented. DailyAggregator is
		# SentimentAggregator with recency decay switched off, and the tier logic that
		# makes a news score a news score lives in the base class, so feeding it one
		# day's articles gives the correct tier weighted figure for that day.
		self.aggregator = DailyAggregator(self.config, self.registry)
		self.payload = NewsPayloadBuilder(self.aggregator, self.registry)

	def build(self, ticker: str, scored: list[dict[str, Any]]) -> list[dict[str, Any]]:
		"""Day rows for one ticker, one per calendar day that has articles.

		No mark filter and no high water mark, unlike the social builder. Nothing about
		a news sample is partial: the run holds every article in the lookback, so each
		day it produces is that day in full and replaces whatever is stored. Which of
		two samples wins is decided in the merge, on how complete each one is.

		A day with no articles produces no row. Quiet days are absent rather than
		written as explicit nulls, and the serving side pads the window, so the number
		of days lives in one place instead of two.
		"""
		by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
		for item in scored:
			day = self._day_of(item)
			if day is not None:
				by_day[day].append(item)

		return [self._row(ticker, day, items) for day, items in sorted(by_day.items()) if items]

	def _day_of(self, item: dict[str, Any]) -> str | None:
		"""The UTC calendar day an article belongs to, or None without a readable date.

		The same YYYY-MM-DD key the social rows use and the frontend already formats, so
		a news point and a social point for one day join on the date alone.
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
		bullish = 0
		bearish = 0
		tiers = {1: 0, 2: 0, 3: 0}

		for item in items:
			raw = float(item.get("sentiment_raw") or 0.0)
			if raw >= threshold:
				bullish += 1
			elif raw <= -threshold:
				bearish += 1
			tier = item.get("tier")
			if tier in tiers:
				tiers[tier] += 1

		return {
			"ticker": ticker.upper(),
			"as_of_day": day,
			"news_sentiment_score": score_from_signed(self.aggregator.aggregate_signed(items)),
			"article_count": len(items),
			"bullish_articles": bullish,
			"bearish_articles": bearish,
			"tier1_count": tiers[1],
			"tier2_count": tiers[2],
			"tier3_count": tiers[3],
			"top_articles": self._top_articles(items),
		}

	def _top_articles(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
		"""The day's most influential articles, in the shape the frontend renders.

		Built through ``NewsPayloadBuilder`` so a stored article is the same object a
		live one is, which is what lets NewsArticleRow read either without a branch.
		The influence percentages it stamps on them are computed over this day alone,
		which is the correct denominator here: they explain the day's own score, not the
		week's.
		"""
		return self.payload.build(items)[: self.config.news_day_top_articles]


class NewsDailyRepository:
	"""Where the news day rows live. One write for a whole run."""

	TABLE = "news_sentiment_daily"
	#: The guarded merge from migrations/021. Keeps the more complete sample when two
	#: writers land on the same day.
	UPSERT_RPC = "upsert_news_days"
	READ_COLUMNS = (
		"ticker, as_of_day, news_sentiment_score, article_count, bullish_articles, "
		"bearish_articles, tier1_count, tier2_count, tier3_count, top_articles"
	)
	CHUNK_SIZE = 100

	@staticmethod
	def _client():
		# Imported on call, never at module load. supabase_client raises at import when
		# its env vars are missing, and a missing database must degrade the history
		# rather than make the scout unimportable.
		from .supabase_client import supabase

		return supabase

	def upsert(self, rows: list[dict[str, Any]]) -> int:
		"""Merge day rows into whatever is stored. Never raises.

		Chunked for the same reason the recommendation insert is: one request carrying a
		whole run's rows has been seen to trip "Server disconnected", and these rows
		carry article JSON.
		"""
		if not rows:
			return 0
		written = 0
		for start in range(0, len(rows), self.CHUNK_SIZE):
			chunk = rows[start : start + self.CHUNK_SIZE]
			try:
				self._client().rpc(self.UPSERT_RPC, {"p_rows": chunk}).execute()
				written += len(chunk)
			except Exception as e:
				logger.warning("News daily upsert failed (%d rows): %s", len(chunk), e)
		return written

	def read_history(self, ticker: str, since: datetime.date) -> list[dict[str, Any]]:
		"""One ticker's stored days, oldest first."""
		try:
			res = (
				self._client()
				.table(self.TABLE)
				.select(self.READ_COLUMNS)
				.eq("ticker", ticker.upper())
				.gte("as_of_day", since.isoformat())
				.order("as_of_day", desc=False)
				.execute()
			)
			return res.data or []
		except Exception as e:
			logger.info("News daily history read failed for %s: %s", ticker, e)
			return []

	def prune(self, before: datetime.date) -> None:
		"""Drop rows past retention. Best effort."""
		try:
			self._client().table(self.TABLE).delete().lt(
				"as_of_day", before.isoformat()
			).execute()
		except Exception as e:
			logger.info("News daily prune failed: %s", e)


class NewsHistory:
	"""Records the news day rows a run produced, and serves them back to the chart."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		builder: NewsDayBuilder | None = None,
		repository: NewsDailyRepository | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.builder = builder or NewsDayBuilder(self.config, self.registry)
		self.repository = repository or NewsDailyRepository()
		self._pruned = False

	@property
	def enabled(self) -> bool:
		return self.config.news_history_enabled

	def record(self, scored_by_ticker: dict[str, list[dict[str, Any]]]) -> int:
		"""Write one run's worth of news day rows. Never raises.

		One round trip for the whole run, not one per ticker, and no read at all: unlike
		social there is no stored mark to consult, because the merge decides which
		sample wins from the rows themselves.
		"""
		if not self.enabled or not scored_by_ticker:
			return 0
		try:
			return self._record(scored_by_ticker)
		except Exception as e:
			# History is a view on work already done and persisted. A failure here must
			# never cost the run its sentiment scores.
			logger.warning("News daily record failed: %s", e)
			return 0

	def _record(self, scored_by_ticker: dict[str, list[dict[str, Any]]]) -> int:
		rows: list[dict[str, Any]] = []
		for ticker in sorted(scored_by_ticker):
			rows.extend(self.builder.build(ticker.upper(), scored_by_ticker[ticker]))

		written = self.repository.upsert(rows)
		if written:
			logger.info(
				"News history wrote %d day rows for %d tickers", written, len(scored_by_ticker)
			)
		self._prune_once()
		return written

	def _prune_once(self) -> None:
		"""One delete per process, not per run. The rows are tiny, so retention is
		housekeeping rather than something the hot path should pay for."""
		if self._pruned:
			return
		self._pruned = True
		self.repository.prune(utc_now().date() - datetime.timedelta(days=RETENTION_DAYS))

	def history(self, ticker: str, days: int | None = None) -> dict[str, dict[str, Any]]:
		"""One ticker's stored news days, keyed by YYYY-MM-DD.

		A mapping rather than a padded list, because the caller is merging these onto the
		social points that already define the window. Padding here as well would put the
		window's length in two places, and the two would eventually disagree.
		"""
		window = window_days(days or self.config.social_display_days)
		if not window:
			return {}
		return {
			str(row["as_of_day"])[:10]: row
			for row in self.repository.read_history(ticker, window[0])
		}

	@staticmethod
	def point(row: dict[str, Any] | None) -> dict[str, Any]:
		"""The news half of one day on the chart.

		A day with no row carries a null score and zero counts. Null and zero mean
		opposite things here, exactly as they do for social: the chart breaks its line
		for a day with no coverage and would draw a crash for a zero.
		"""
		if row is None:
			return {
				"news_score": None,
				"news_count": 0,
				"news_bullish": 0,
				"news_bearish": 0,
				"news_tier_counts": {"1": 0, "2": 0, "3": 0},
				"top_articles": [],
			}
		return {
			"news_score": row.get("news_sentiment_score"),
			"news_count": row.get("article_count") or 0,
			"news_bullish": row.get("bullish_articles") or 0,
			"news_bearish": row.get("bearish_articles") or 0,
			"news_tier_counts": {
				"1": row.get("tier1_count") or 0,
				"2": row.get("tier2_count") or 0,
				"3": row.get("tier3_count") or 0,
			},
			"top_articles": row.get("top_articles") or [],
		}
