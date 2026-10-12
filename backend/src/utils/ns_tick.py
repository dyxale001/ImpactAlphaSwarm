"""Sentiment scout: the intraday news top-up behind "What's driving the sentiment".

News used to be fetched by the 22:00 UTC nightly and nothing else. User refreshes read the
nightly's cache, so today's news row stayed empty through the whole US session and the
paragraph written from it had nothing of today's to explain until the evening. The nightly
also missed whatever was published between 22:00 and midnight UTC, and the 00:30 job
settles yesterday's paragraph before the next nightly could pick those articles up.

A news tick rides on the social tick's schedule (09:35 and 13:35 New York, weekdays) and
fetches yesterday and today from Finnhub for the same recently ranked tickers. It writes
news_sentiment_daily and nothing else: not the Finnhub cache the refreshes score from,
since a two day list would replace the seven day one, and not Marketaux, whose free plan
is a hundred calls a day that the nightly already spends.

The constraint that shapes it is Finnhub's limit: sixty calls a minute per key, counted
across every container. The process wide limiter cannot see another container, and whale
watching and user refreshes draw on the same key while a tick runs. So on the shared key a
tick paces itself to half the limit, retries a refusal once after a pause, and stops the
pass after a few refusals in a row rather than hammering a key that is already over. Given
a key of its own (FINNHUB_API_KEY2) nothing competes with it, and it paces at the
ordinary interval instead.

The day rows go through the same guarded merge the nightly uses, which keeps whichever
sample of a day holds more articles. A tick can therefore only ever fill a day in, never
thin one out.
"""

from __future__ import annotations

import dataclasses
import datetime
import logging
import os
import time
from typing import Any, Callable

from .ns_daily import NewsHistory
from .ss_aggregation import SentimentAggregator
from .ss_base import RateLimiter
from .ss_config import SentimentConfig
from .ss_models import SocialMention
from .ss_news import FINNHUB_LIMITER, FinnhubSource
from .ss_scoring import GcpNlpModel, MentionPriority, MentionScorer, SentimentModel, VaderModel
from .ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")


class ChainedLimiter:
	"""Waits on several limiters in turn, so a call clears every one of them.

	The shared key's tick has two masters: the process wide Finnhub limiter, which keeps it
	from colliding with a refresh on the same container, and its own slower pace, which
	leaves room for every other container on the key.
	"""

	def __init__(self, limiters: list[RateLimiter]):
		self.limiters = limiters

	def wait(self) -> None:
		for limiter in self.limiters:
			limiter.wait()


class FreshFirstPriority(MentionPriority):
	"""Spends the metered GCP slots on articles that have never been scored.

	An article already on a stored day row keeps its stored score whatever happens, so a
	GCP slot spent on it buys nothing. Fresh articles sort first, then the usual reliable
	and recent order.
	"""

	def __init__(self, known_urls: set[str]):
		self.known_urls = known_urls

	def key(self, mention: SocialMention) -> Any:
		return (mention.url not in self.known_urls, mention.weight, mention.created_at or "")


class SkipKnownModel(SentimentModel):
	"""A GCP model that never bills for an article whose score is already stored.

	Returns None for those, which is the "no opinion" every caller already handles; the
	stored score replaces the result afterwards anyway.
	"""

	def __init__(self, base: SentimentModel, skip_texts: set[str]):
		self.base = base
		self.skip_texts = skip_texts

	def score(self, text: str) -> float | None:
		if text in self.skip_texts:
			return None
		return self.base.score(text)

	def score_many(self, texts: list[str]) -> dict[str, float | None]:
		fresh = [text for text in texts if text not in self.skip_texts]
		scores: dict[str, float | None] = {text: None for text in texts if text in self.skip_texts}
		if fresh:
			scores.update(self.base.score_many(fresh))
		return scores


class NewsTicker:
	"""Fetches yesterday's and today's news for a batch of tickers and stores the day rows."""

	DEDICATED_KEY_ENV = "FINNHUB_API_KEY2"
	SHARED_KEY_ENV = "FINNHUB_API_KEY"

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		history: NewsHistory | None = None,
		source: FinnhubSource | None = None,
		vader: SentimentModel | None = None,
		gcp: SentimentModel | None = None,
		sleep: Callable[[float], None] | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.history = history or NewsHistory(self.config, self.registry)
		# Injected in tests. In production the source is built per tick, so a key added to
		# or removed from the environment takes effect without a restart.
		self._source = source
		self.vader = vader or VaderModel()
		self.gcp = gcp or GcpNlpModel(self.config.gcp_max_workers)
		self._sleep = sleep or time.sleep
		self._dedicated_limiter: RateLimiter | None = None
		self._shared_limiter: RateLimiter | None = None

	@property
	def enabled(self) -> bool:
		"""Both flags. With the history off a tick would fetch and score and then have
		nowhere to put any of it."""
		return self.config.news_tick_enabled and self.config.news_history_enabled

	# ── the key and its pace ─────────────────────────────────────────────────

	def _source_for_tick(self) -> tuple[FinnhubSource | None, str]:
		"""The Finnhub source this pass uses, and which key it is on."""
		if self._source is not None:
			return self._source, "injected"

		dedicated = os.getenv(self.DEDICATED_KEY_ENV, "").strip()
		if dedicated:
			if self._dedicated_limiter is None:
				self._dedicated_limiter = RateLimiter(self.config.finnhub_min_interval)
			return (
				FinnhubSource(
					self.config, self.registry, limiter=self._dedicated_limiter, api_key=dedicated
				),
				"dedicated",
			)

		shared = os.getenv(self.SHARED_KEY_ENV, "").strip()
		if not shared:
			return None, "none"
		if self._shared_limiter is None:
			self._shared_limiter = RateLimiter(
				max(self.config.news_tick_min_interval, self.config.finnhub_min_interval)
			)
		limiter = ChainedLimiter([FINNHUB_LIMITER, self._shared_limiter])
		return FinnhubSource(self.config, self.registry, limiter=limiter, api_key=shared), "shared"

	# ── the pass ─────────────────────────────────────────────────────────────

	def tick(self, tickers: list[str], quota: int | None = None) -> dict[str, Any]:
		"""Fetch, score and store each ticker's last two days of news. Never raises.

		Returns a summary the scheduler endpoint hands straight back. ``rate_limited`` is the
		number worth watching: anything above zero on most passes means the key is shared
		with more traffic than the pace allows for.
		"""
		summary: dict[str, Any] = {
			"enabled": self.enabled,
			"key": None,
			"considered": len(tickers),
			"fetched": 0,
			"calls": 0,
			"rate_limited": 0,
			"stopped": None,
			"articles": 0,
			"reused_scores": 0,
			"rows": 0,
			"seconds": 0.0,
		}
		if not self.enabled:
			return summary

		started = time.monotonic()
		try:
			self._tick(tickers, quota, summary, started)
		except Exception as e:
			logger.warning("News tick failed: %s", e)
			summary["stopped"] = "error"
		summary["seconds"] = round(time.monotonic() - started, 1)
		logger.info(
			"News tick on the %s key fetched %d of %d tickers in %d calls (%d refused), "
			"%d articles (%d reused scores) into %d day rows, in %.1fs",
			summary["key"],
			summary["fetched"],
			summary["considered"],
			summary["calls"],
			summary["rate_limited"],
			summary["articles"],
			summary["reused_scores"],
			summary["rows"],
			summary["seconds"],
		)
		return summary

	def _tick(
		self, tickers: list[str], quota: int | None, summary: dict[str, Any], started: float
	) -> None:
		source, key = self._source_for_tick()
		summary["key"] = key
		if source is None:
			logger.warning("News tick has no Finnhub key to use; nothing fetched")
			summary["stopped"] = "no_key"
			return

		limit = quota if quota is not None else self.config.news_tick_quota
		batch = sorted({t.upper() for t in tickers if t})[:limit]
		if not batch:
			return

		date_from, date_to = source.window(self.config.news_tick_lookback_days)
		stored = self.history.repository.read_article_scores(
			batch, datetime.date.fromisoformat(date_from)
		)

		deadline = started + self.config.news_tick_max_seconds
		refused_in_row = 0
		scored_by_ticker: dict[str, list[dict[str, Any]]] = {}

		for sym in batch:
			if time.monotonic() >= deadline:
				summary["stopped"] = "budget"
				logger.warning(
					"News tick hit its %.0fs budget after %d tickers",
					self.config.news_tick_max_seconds,
					summary["fetched"],
				)
				break

			status, mentions, refused_in_row = self._fetch(
				source, sym, date_from, date_to, refused_in_row, summary
			)
			if refused_in_row >= self.config.news_tick_max_rate_limited:
				summary["stopped"] = "rate_limited"
				logger.warning(
					"News tick stopping after %d refusals in a row; %d tickers fetched",
					refused_in_row,
					summary["fetched"],
				)
				break
			if status != 200:
				continue

			summary["fetched"] += 1
			scored, reused = self._score(mentions, stored.get(sym, {}))
			summary["articles"] += len(scored)
			summary["reused_scores"] += reused
			scored_by_ticker[sym] = scored

		if scored_by_ticker:
			summary["rows"] = self.history.record(scored_by_ticker)

	def _fetch(
		self,
		source: FinnhubSource,
		sym: str,
		date_from: str,
		date_to: str,
		refused_in_row: int,
		summary: dict[str, Any],
	) -> tuple[int | None, list[SocialMention], int]:
		"""One ticker, retried once after a pause if Finnhub refuses it.

		Returns the status, the articles, and the updated count of refusals in a row.
		"""
		for attempt in range(2):
			source.limiter.wait()
			status, mentions = source.fetch_one(sym, date_from, date_to)
			summary["calls"] += 1
			if status != 429:
				return status, mentions, 0
			summary["rate_limited"] += 1
			refused_in_row += 1
			if refused_in_row >= self.config.news_tick_max_rate_limited:
				break
			if attempt == 0:
				self._sleep(self.config.news_tick_backoff_seconds)
		return 429, [], refused_in_row

	# ── scoring ──────────────────────────────────────────────────────────────

	def _score(
		self, mentions: list[SocialMention], stored_by_url: dict[str, float]
	) -> tuple[list[dict[str, Any]], int]:
		"""Score the articles, reusing the stored score of any article already on a day row.

		Reuse is what keeps a past day stable as well as cheap: an article the nightly
		scored with GCP keeps that score, rather than drifting to VADER alone because this
		pass spent its slots elsewhere. Returns the scored items and how many were reused.
		"""
		if not mentions:
			return [], 0

		known_urls = {m.url for m in mentions if m.url and m.url in stored_by_url}
		skip_texts = {
			MentionScorer.clean_text(m.text) for m in mentions if m.url in known_urls
		}
		tick_config = dataclasses.replace(
			self.config, gcp_top_n=self.config.news_tick_gcp_top_n
		)
		scorer = MentionScorer(
			tick_config,
			self.registry,
			SentimentAggregator(tick_config, self.registry),
			vader=self.vader,
			gcp=SkipKnownModel(self.gcp, skip_texts),
		)
		scored = scorer.score(mentions, FreshFirstPriority(known_urls)).get("scored", [])

		reused = 0
		for item in scored:
			stored = stored_by_url.get(item.get("url") or "")
			if stored is None:
				continue
			# The stored figure is the 0 to 100 contribution; the raw score is its inverse.
			item["sentiment_contribution"] = round(stored, 2)
			item["sentiment_raw"] = round(max(-1.0, min(1.0, stored / 50.0 - 1.0)), 4)
			reused += 1
		return scored, reused
