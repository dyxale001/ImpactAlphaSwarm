"""Sentiment scout: the intraday top-up that keeps today's bar from being empty.

Today's row is written by whichever runs happen to fire today, and the only scheduled one
is at 22:00 UTC. So the bar for the day a reader is actually looking at is blank from
midnight until late evening. This fills it, twice a session, without touching anything a
run owns.

A tick is not a small backfill and is deliberately not built out of one. ``ss_backfill``
walks thirty pages back over seven days, scores each day separately and writes with
``seeded=True``, which REPLACES a day's running sums. All three are right for filling in a
ticker's history once and wrong for topping up a day in progress, and its ``pending()``
would find nothing to do anyway: every ticker it would consider was seeded the first night
it appeared. Scheduling that job more often does nothing at all, which is why this exists
instead of a second cron entry.

What a tick is, in one line: read how far we got, walk until we meet it, score only what is
past it, add that on.

The ordering in there is the whole cost argument. ``SocialHistory.record`` already filters
by the stored mark, so a tick that scored everything it walked would still store the right
number; it would just have paid GCP to score the same fifty posts it scored two hours ago
and then thrown the scores away. Filtering BEFORE the scorer is what makes a quiet ticker
free and an ordinary one cost a handful of units.

Nothing waits on this and nothing user facing moves: a tick writes ``social_sentiment_daily``
and nothing else. It never touches ai_recommendation, Groq, quant or discovery. A tick that
fails leaves today's bar exactly as empty as it already was.
"""

from __future__ import annotations

import dataclasses
import datetime
import logging
import time
from typing import Any

from .ss_backfill import SEEDS, SeedRegistry
from .ss_config import SentimentConfig
from .ss_daily import SocialHistory, utc_now
from .ss_social import StockTwitsSource
from .ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")


class SocialTicker:
	"""Tops up today's social row for a batch of tickers. One shallow walk each."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		history: SocialHistory | None = None,
		source: StockTwitsSource | None = None,
		scorer: Any | None = None,
		seeds: SeedRegistry | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.history = history or SocialHistory(self.config, self.registry)
		self.source = source or StockTwitsSource(self.config, self.registry)
		self._scorer = scorer
		# Shared with the backfill on purpose. A lazy seed fired by somebody opening the
		# asset page and a tick landing on the same ticker are two walks of one stream,
		# and the seed is the one that must win: it is filling seven empty days where the
		# tick is topping up one.
		self.seeds = seeds or SEEDS

		from .ss_scoring import EngagementPriority

		self.priority = EngagementPriority()

	@property
	def enabled(self) -> bool:
		"""Both flags, not just the tick's own.

		A tick writes through ``SocialHistory.record``, which is itself gated on
		``social_history_enabled``. With the history off a tick would walk every ticker,
		score every new post and then drop the lot on the floor, which is the most
		expensive way available to do nothing.
		"""
		return self.config.social_tick_enabled and self.config.social_history_enabled

	@property
	def scorer(self):
		"""The run's scorer, on the tick's own GCP ceiling.

		``MentionScorer`` reads ``gcp_top_n`` off the config it is handed, so pointing it
		at a copy of the config is all it takes to give ticks a smaller metered share than
		the nightly. Everything else about the scoring is identical, which is the part that
		matters: the same VADER model, the same declared-sentiment shortcut, the same
		combine step. A tick's posts and a run's posts end up on one scale.
		"""
		if self._scorer is None:
			from .ss_aggregation import SentimentAggregator
			from .ss_scoring import MentionScorer

			tick_config = dataclasses.replace(
				self.config, gcp_top_n=self.config.social_tick_gcp_top_n
			)
			aggregator = SentimentAggregator(tick_config, self.registry)
			self._scorer = MentionScorer(tick_config, self.registry, aggregator)
		return self._scorer

	def tick(self, tickers: list[str], quota: int | None = None) -> dict[str, Any]:
		"""Top up today's row for each ticker. Never raises.

		Returns a summary the scheduler endpoint hands straight back, so a pass that found
		nothing new says so rather than looking like a pass that did not run. ``new_posts``
		is the number worth watching: a session where it is always zero means the walk is
		not reaching past the mark, not that the market went quiet.
		"""
		summary: dict[str, Any] = {
			"enabled": self.enabled,
			"considered": len(tickers),
			"walked": 0,
			"new_posts": 0,
			"rows": 0,
			"skipped_active": 0,
			"skipped_budget": 0,
			"seconds": 0.0,
		}
		if not self.enabled:
			return summary

		started = time.monotonic()
		deadline = started + self.config.social_tick_max_seconds
		limit = quota if quota is not None else self.config.social_tick_quota
		batch = sorted({t.upper() for t in tickers if t})[:limit]
		if not batch:
			return summary

		# One read for the whole batch, exactly as a run does. Two days rather than one
		# because a walk bounded at the start of today still returns the tail of yesterday
		# on its last page, and those posts have their own mark.
		since = utc_now().date() - datetime.timedelta(days=1)
		try:
			marks = self.history.repository.read_marks(batch, since)
		except Exception as e:
			# An unreadable mark table is not fatal here, unlike in the backfill's pending
			# check. Worst case every walked post looks new, the scorer pays for a few more
			# than it needed to, and the accumulate RPC still refuses any sample that is not
			# above the stored mark. Wrong on cost, right on data.
			logger.info("Tick could not read marks for %d tickers: %s", len(batch), e)
			marks = {}

		self.source.deadline = deadline

		for ticker in batch:
			if time.monotonic() >= deadline:
				summary["skipped_budget"] = len(batch) - summary["walked"]
				logger.warning(
					"Tick hit its %.0fs budget after %d tickers; %d left for the next pass",
					self.config.social_tick_max_seconds,
					summary["walked"],
					summary["skipped_budget"],
				)
				break

			if not self.seeds.claim(ticker):
				summary["skipped_active"] += 1
				logger.info("Tick skipping %s; a walk is already in flight", ticker)
				continue

			try:
				new_posts, rows = self._tick_one(ticker, marks)
				summary["walked"] += 1
				summary["new_posts"] += new_posts
				summary["rows"] += rows
			finally:
				self.seeds.release(ticker)

		summary["seconds"] = round(time.monotonic() - started, 1)
		logger.info(
			"Tick walked %d of %d tickers, %d new posts into %d day rows, in %.1fs",
			summary["walked"],
			summary["considered"],
			summary["new_posts"],
			summary["rows"],
			summary["seconds"],
		)
		return summary

	def _tick_one(self, ticker: str, marks: dict[tuple[str, str], int]) -> tuple[int, int]:
		"""One ticker: walk, drop what is already counted, score the rest, add it on.

		Returns (new posts scored, day rows written). Never raises: one ticker's dead
		stream must not cost the rest of the batch its top-up.
		"""
		sym = ticker.upper()
		try:
			mentions = self._walk(sym)
			fresh = self._new_mentions(sym, mentions, marks)
			if not fresh:
				# Not an error and not worth a warning. Most tickers most of the time have
				# nothing new, which is exactly the case this whole ordering exists to make
				# free.
				logger.debug("Tick found nothing new for %s", sym)
				return 0, 0
			scored = self._score(fresh)
			rows = self.history.record({sym: scored}, seeded=False)
			return len(fresh), rows
		except Exception as e:
			logger.warning("Tick failed for %s: %s", sym, e)
			return 0, 0

	def _walk(self, sym: str) -> list:
		"""The shallow forward top-up walk, at the tick's own page ceiling."""
		before = self.source.request_count
		mentions = self.source._walk(
			sym,
			max_pages=self.config.social_tick_max_pages,
			until_dt=self._start_of_today(),
		)
		logger.debug(
			"Tick walked %s in %d requests, %d posts on the pages",
			sym,
			self.source.request_count - before,
			len(mentions),
		)
		return mentions

	def _new_mentions(
		self, sym: str, mentions: list, marks: dict[tuple[str, str], int]
	) -> list:
		"""Those of ``mentions`` past the stored high water mark for their own day.

		Per day rather than one mark for the ticker, because a walk bounded at midnight
		still comes back holding the tail of yesterday, and yesterday has its own mark that
		is far higher than this morning's. Comparing a 09:00 post against last night's mark
		would drop every post of the session.

		This duplicates the filter in ``SocialDayBuilder.build``, and that is the point
		rather than an oversight. That one decides what gets STORED and runs after scoring;
		this one decides what gets SCORED and has to run before it. Delete this and the data
		stays correct while the GCP bill stops depending on how much is actually new.
		"""
		fresh = []
		for mention in mentions:
			created = getattr(mention, "created_at", None)
			if not created:
				continue
			day = str(created)[:10]
			mark = marks.get((sym, day))
			message_id = getattr(mention, "message_id", None)
			# ``is not None`` rather than a zero default, matching SocialDayBuilder: a day
			# we hold nothing for has no mark at all, and defaulting it to zero would
			# silently drop a post whose id is zero.
			if mark is not None and message_id is not None and message_id <= mark:
				continue
			fresh.append(mention)
		return fresh

	def _score(self, mentions: list) -> list[dict[str, Any]]:
		"""Score the new posts as one list.

		No split by day here, unlike the backfill. That split exists because a seed hands
		the scorer a whole week at once, so scoring it in one call would buy the metered
		signal for the newest day and leave the rest on VADER. A tick's list is a few hours
		of one session, and on the rare pass that straddles midnight the older sliver is
		minutes old rather than days, so one call spends the ceiling on the loudest posts
		of the batch, which is what it is for.
		"""
		if not mentions:
			return []
		result = self.scorer.score(mentions, self.priority)
		return result.get("scored", []) if isinstance(result, dict) else []

	@staticmethod
	def _start_of_today() -> datetime.datetime:
		"""Midnight UTC today. The same day boundary the rows and the chart use."""
		now = utc_now()
		return now.replace(hour=0, minute=0, second=0, microsecond=0)
