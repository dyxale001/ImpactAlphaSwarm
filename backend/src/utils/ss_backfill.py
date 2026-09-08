"""Sentiment scout: the backwards walk that fills a ticker's history in.

This is the only module in the codebase that crawls StockTwits backwards past the
current day, and it is deliberately unreachable from ``SentimentScout`` and from the
analysis graph. Everything here runs on a scheduler job or behind a GET on the asset
page, so its cost lands where nobody is waiting.

That separation is the whole lesson of the two builds before this one. The first put
the crawl inside ``SocialCollector.collect``, conditional on a ticker having no stored
history, so a ticker the run had not seen before was expensive *in the run* and on
night one every ticker was new: thirty tickers at twelve pages against a one second
floor is six minutes of sleeping, roughly ten of that run's eighteen minutes. The
second removed the crawl entirely, which fixed the timing and left the chart blank for
a week.

So the crawl comes back, with two rules that make the first failure unreachable:

1. Nothing in the run may call this. A run walks a flat ``social_accumulate_days``
   for every ticker and cannot tell a new one from a familiar one.
2. The page ceiling here is its own setting, far above the run's. A page is about
   thirty posts, so the run's six pages is under two days for a busy ticker;
   migrations/015 shipped exactly that bug at twelve pages and filled two bars of
   seven on precisely the assets people open.
"""

from __future__ import annotations

import datetime
import logging
import threading
import time
from typing import Any

from .ss_config import SentimentConfig
from .ss_daily import SocialHistory, utc_now
from .ss_social import StockTwitsSource
from .ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")


class SeedRegistry:
	"""Which tickers are being walked right now, process wide.

	Opening an asset page fires a seed, and a page that is loading a chart is a page
	somebody may reload. Without this, five reloads are five concurrent crawls of the
	same symbol, each paying the same rate limiter.

	In process rather than in the database on purpose: it guards against a burst of
	requests hitting one container over a few seconds, which is what actually happens,
	and a lock in Postgres would need its own expiry story for a crash mid-walk.
	"""

	def __init__(self):
		self._lock = threading.Lock()
		self._active: set[str] = set()

	def claim(self, ticker: str) -> bool:
		"""True if the caller now owns this ticker's walk and must release it."""
		sym = ticker.upper()
		with self._lock:
			if sym in self._active:
				return False
			self._active.add(sym)
			return True

	def release(self, ticker: str) -> None:
		with self._lock:
			self._active.discard(ticker.upper())

	def active(self) -> set[str]:
		with self._lock:
			return set(self._active)


#: Process wide, so two requests served by different workers in the same container
#: still collapse to one walk.
SEEDS = SeedRegistry()


class SocialBackfiller:
	"""Walks a ticker's stream back far enough to fill the chart, once.

	Two entry points over one walk: :meth:`backfill` for the scheduled job and
	:meth:`seed_one` for the lazy seed behind the history endpoint.
	"""

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
		self.seeds = seeds or SEEDS

		from .ss_scoring import EngagementPriority

		self.priority = EngagementPriority()

	@property
	def enabled(self) -> bool:
		return self.config.social_history_enabled

	@property
	def scorer(self):
		"""The same scorer a run uses, built lazily.

		Seeded days and live days are scored the same way on purpose. The reverted
		build injected a null model here so a bulk walk never spent a metered GCP call,
		which left the seeded part of the window on VADER alone while today's bar got
		VADER and GCP averaged. On a trend line that seam reads as a sentiment move
		that never happened, which is the one thing a trend line must not do. The cost
		is a few thousand units, once, for tickers that have never been walked.
		"""
		if self._scorer is None:
			from .ss_aggregation import SentimentAggregator
			from .ss_scoring import MentionScorer

			aggregator = SentimentAggregator(self.config, self.registry)
			self._scorer = MentionScorer(self.config, self.registry, aggregator)
		return self._scorer

	def pending(self, tickers: list[str]) -> list[str]:
		"""Those of ``tickers`` that have never been walked, in a stable order."""
		wanted = sorted({t.upper() for t in tickers if t})
		if not wanted:
			return []
		already = self.history.repository.seeded_tickers(wanted)
		return [ticker for ticker in wanted if ticker not in already]

	def backfill(self, tickers: list[str], quota: int | None = None) -> dict[str, Any]:
		"""Walk up to ``quota`` unseeded tickers. Never raises.

		Returns a summary the scheduler endpoint hands straight back, so a night that
		did nothing says so rather than looking like a night that did not run.
		"""
		summary: dict[str, Any] = {
			"enabled": self.enabled,
			"considered": len(tickers),
			"pending": 0,
			"seeded": 0,
			"rows": 0,
			"skipped_budget": 0,
			"seconds": 0.0,
		}
		if not self.enabled:
			return summary

		started = time.monotonic()
		deadline = started + self.config.social_backfill_max_seconds
		limit = quota if quota is not None else self.config.social_backfill_quota

		try:
			outstanding = self.pending(tickers)
		except Exception as e:
			logger.warning("Backfill could not work out what is pending: %s", e)
			return summary

		summary["pending"] = len(outstanding)
		batch = outstanding[:limit]

		for ticker in batch:
			if time.monotonic() >= deadline:
				# Whatever is left is still unseeded, so the next pass picks it up. This
				# is why the pending query runs every time rather than a list being
				# carried between jobs.
				summary["skipped_budget"] = len(batch) - summary["seeded"]
				logger.warning(
					"Backfill hit its %.0fs budget after %d tickers; %d left for next time",
					self.config.social_backfill_max_seconds,
					summary["seeded"],
					summary["skipped_budget"],
				)
				break
			rows = self._walk_and_store(ticker, deadline)
			summary["seeded"] += 1
			summary["rows"] += rows

		summary["seconds"] = round(time.monotonic() - started, 1)
		logger.info(
			"Backfill seeded %d of %d pending tickers (%d day rows) in %.1fs",
			summary["seeded"],
			summary["pending"],
			summary["rows"],
			summary["seconds"],
		)
		return summary

	def seed_one(self, ticker: str) -> int:
		"""Walk one ticker, for the lazy seed behind the history endpoint. Never raises.

		Returns the number of day rows written, or 0 if another walk of this ticker was
		already in flight and this call did nothing.
		"""
		if not self.enabled or not ticker:
			return 0
		if not self.seeds.claim(ticker):
			logger.info("Seed for %s already in flight; this request does nothing", ticker)
			return 0
		try:
			deadline = time.monotonic() + self.config.social_backfill_max_seconds
			return self._walk_and_store(ticker, deadline)
		except Exception as e:
			logger.warning("Seed failed for %s: %s", ticker, e)
			return 0
		finally:
			self.seeds.release(ticker)

	def _walk_and_store(self, ticker: str, deadline: float) -> int:
		"""One ticker: walk back over the display window, score, store. Never raises."""
		sym = ticker.upper()
		try:
			mentions = self._walk(sym, deadline)
			scored = self._score(mentions)
			# ``seeded=True`` even when nothing came back. A silent ticker still has to
			# record that it was walked, or it looks unseeded on every page load and
			# crawls again forever.
			return self.history.record({sym: scored}, seeded=True)
		except Exception as e:
			logger.warning("Backfill walk failed for %s: %s", sym, e)
			return 0

	def _walk(self, sym: str, deadline: float) -> list:
		"""The backwards walk itself, at the backfill's own depth and page ceiling."""
		self.source.deadline = deadline
		window = utc_now() - datetime.timedelta(days=self.config.social_display_days)
		before = self.source.request_count
		mentions = self.source._walk(
			sym,
			max_pages=self.config.social_backfill_max_pages,
			until_dt=window,
		)
		logger.info(
			"Backfill walked %s over %d days in %d requests, %d posts",
			sym,
			self.config.social_display_days,
			self.source.request_count - before,
			len(mentions),
		)
		return mentions

	def _score(self, mentions: list) -> list[dict[str, Any]]:
		"""Score the walked posts exactly as a run scores its own, one day at a time.

		The split by day is what makes "exactly as a run scores its own" true rather
		than approximately true. ``MentionScorer`` spends its metered GCP calls on the
		top ``gcp_top_n`` posts of whatever list it is handed, so scoring a whole week
		in one call would buy ten GCP signals for the week and leave the older days on
		VADER alone. A run scores one day and buys ten for that day, so a backfill has
		to do the same or the far end of the chart is quietly scored by a different
		method than the near end.

		That costs display_days times gcp_top_n per ticker, once, for tickers that have
		never been walked.
		"""
		if not mentions:
			return []

		by_day: dict[str, list] = {}
		for mention in mentions:
			created = getattr(mention, "created_at", None)
			day = str(created)[:10] if created else ""
			by_day.setdefault(day, []).append(mention)

		scored: list[dict[str, Any]] = []
		for day in sorted(by_day):
			result = self.scorer.score(by_day[day], self.priority)
			if isinstance(result, dict):
				scored.extend(result.get("scored", []))
		return scored
