"""Sentiment scout: building and serving 14 days of social sentiment.
"""

from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from typing import Any

from .ss_aggregation import SentimentAggregator
from .ss_config import SentimentConfig
from .ss_models import SocialMention
from .ss_scoring import MentionScorer, SentimentModel, VaderModel
from .ss_social_store import DailySentimentRepository, MessageRepository, parse_ts
from .ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")


class NullModel(SentimentModel):
	"""A model with no opinion, used to switch the metered GCP call off.
	Bulk-scoring a backfill through GCP NLP would burn a monthly budget that is
	sized for the top ``gcp_top_n`` posts per ticker per run, not for a crawl going
	back weeks. Passing this as the gcp model leaves ``MentionScorer`` otherwise
	untouched, so a stored post is scored by exactly the same code as a live one,
	minus the call we cannot afford.
	"""

	def score(self, text: str) -> float | None:
		return None


class BucketAggregator(SentimentAggregator):
	"""Aggregator for a single day's posts, with time-decay switched off.
	"""

	def recency_weight(self, created_at: str | None) -> float:
		return 1.0


class SocialHistoryCollector:
	"""Collects StockTwits posts into storage and rolls them up by day."""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		source=None,
		messages: MessageRepository | None = None,
		daily: DailySentimentRepository | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		if source is None:
			from .ss_social import StockTwitsSource

			source = StockTwitsSource(self.config, self.registry)
		self.source = source
		self.messages = messages or MessageRepository(self.config)
		self.daily = daily or DailySentimentRepository()

	# collection

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		"""Top storage up for each ticker, then serve the scoring window from it.
		"""
		results: dict[str, list[SocialMention]] = {}
		window_start = self._now() - datetime.timedelta(days=self.config.social_history_days)

		for ticker in tickers:
			sym = ticker.upper()
			try:
				fetched = self._top_up(sym, window_start)
				if fetched:
					self._store(sym, fetched)
			except Exception as e:
				# A collection failure must not cost us the posts already stored.
				logger.warning("Social history top-up failed for %s: %s", sym, e)
			results[sym] = self.messages.read_window(sym, window_start)

		return results

	def _top_up(self, sym: str, window_start: datetime.datetime) -> list[SocialMention]:
		"""Fetch whatever this ticker is missing, choosing seed or increment.

		The seed runs when we hold nothing for the ticker. It is
		tempting to also re-seed whenever the stored history is shallower than the
		window, but that is wrong: a quiet ticker simply does not HAVE fourteen days
		of posts, so the gap never closes and the backward crawl would repeat on
		every single run -- the exact waste this design exists to remove.

		The cost of the strict rule is that widening ``social_history_days`` will not
		retroactively deepen a ticker already stored. Deleting that ticker's rows
		forces a fresh seed.
		"""
		high_water = self.messages.high_water_mark(sym)

		if high_water is None:
			logger.info("Seeding social history for %s back to %s", sym, window_start.date())
			return self.source.collect_backfill(sym, window_start)

		return self.source.collect_since(sym, high_water)

	def _store(self, sym: str, mentions: list[SocialMention]) -> int:
		"""Score each post once and write it.
		"""
		scorer = self._bucket_scorer()
		rows = []
		seen: set[int] = set()
		for mention in mentions:
			if mention.message_id is None or mention.message_id in seen:
				continue
			seen.add(mention.message_id)
			rows.append(mention.to_row(sentiment_score=scorer.signed_score(mention)))
		written = self.messages.insert_new(rows)
		if written:
			logger.info("Stored %d new StockTwits posts for %s", written, sym)
		return written

	# rollups

	def rebuild_rollups(self, tickers: list[str]) -> None:
		"""Recompute the trailing window of daily buckets from stored posts.
		The whole window is rebuilt, not just today, because a seed crawl and any
		late-arriving posts both change days that have already been written.
		"""
		window_start = self._now() - datetime.timedelta(days=self.config.social_history_days)
		for ticker in tickers:
			sym = ticker.upper()
			try:
				rows = self.messages.read_rows(sym, window_start)
				self.daily.write_days(sym, self._buckets(sym, rows, window_start))
			except Exception as e:
				logger.warning("Social rollup rebuild failed for %s: %s", sym, e)

	def _buckets(
		self, sym: str, rows: list[dict[str, Any]], window_start: datetime.datetime
	) -> list[dict[str, Any]]:
		by_day: dict[datetime.date, list[dict[str, Any]]] = defaultdict(list)
		for row in rows:
			created = parse_ts(row.get("created_at"))
			if created is not None:
				by_day[created.date()].append(row)

		aggregator = BucketAggregator(self.config, self.registry)
		out: list[dict[str, Any]] = []

		for day in self._window_days(window_start):
			day_rows = by_day.get(day, [])
			# A day with no chatter is written with a null score, not a zero
		
			if not day_rows:
				out.append(
					{
						"ticker": sym,
						"as_of_night": day.isoformat(),
						"social_sentiment_score": None,
						"post_count": 0,
						"bullish_posts": 0,
						"bearish_posts": 0,
					}
				)
				continue

			scored = [self._scored_item(row) for row in day_rows]
			average = aggregator.aggregate_signed(scored)
			score = int(round(max(0.0, min(1.0, (average + 1.0) / 2.0)) * 100))
			threshold = MentionScorer.BULLISH_THRESHOLD

			out.append(
				{
					"ticker": sym,
					"as_of_night": day.isoformat(),
					"social_sentiment_score": score,
					"post_count": len(day_rows),
					"bullish_posts": sum(1 for s in scored if s["sentiment_raw"] >= threshold),
					"bearish_posts": sum(1 for s in scored if s["sentiment_raw"] <= -threshold),
				}
			)
		return out

	def _scored_item(self, row: dict[str, Any]) -> dict[str, Any]:
		mention = SocialMention.from_row(row, self.config.stocktwits_engagement_cap)
		raw = row.get("sentiment_score")
		return {
			"sentiment_raw": float(raw) if raw is not None else 0.0,
			"created_at": mention.created_at,
			"weight": mention.weight,
			"tier": None,
		}

	def _window_days(self, window_start: datetime.datetime) -> list[datetime.date]:
		"""Every calendar day in the window, so quiet days are written explicitly."""
		start = window_start.date()
		today = self._now().date()
		return [start + datetime.timedelta(days=i) for i in range((today - start).days + 1)]

	# serving and housekeeping

	def history(self, ticker: str, days: int | None = None) -> list[dict[str, Any]]:
		"""The stored daily series for one ticker, oldest first."""
		window = days or self.config.social_history_days
		rows = self.daily.read_history(ticker, window)
		return [
			{
				"date": row["as_of_night"],
				"score": row.get("social_sentiment_score"),
				"post_count": row.get("post_count") or 0,
				"bullish": row.get("bullish_posts") or 0,
				"bearish": row.get("bearish_posts") or 0,
			}
			for row in rows
		]

	def prune(self) -> None:
		"""Drop raw posts past the retention window.
		"""
		cutoff = self._now() - datetime.timedelta(days=self.config.social_retention_days)
		self.messages.prune(cutoff)

	# internals

	def _bucket_scorer(self) -> MentionScorer:
		"""A scorer that never spends a metered GCP call."""
		return MentionScorer(
			config=self.config,
			registry=self.registry,
			aggregator=BucketAggregator(self.config, self.registry),
			vader=VaderModel(),
			gcp=NullModel(),
		)

	@staticmethod
	def _now() -> datetime.datetime:
		return datetime.datetime.now(datetime.timezone.utc)
