"""Sentiment scout: trusted-source news collection.

Two sources, deliberately used differently:

  * Finnhub is queried live on every run and supplies the bulk of the volume.
  * Marketaux is a tier-1-only top-up on a tight free-plan call budget, so it runs
    ONCE per night with deep pagination and its results are cached. User refreshes
    read that cache rather than spending calls.

Anything from a publisher outside the trust tiers is dropped before scoring.

How the two are combined depends on which run this is, so the three modes are
strategy objects rather than a flag: ``LiveOnlyStrategy`` for a standalone run,
``FetchAndCacheStrategy`` for the nightly batch, ``CacheFirstStrategy`` for a user
refresh.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from enum import Enum

from .schemas import parse_finnhub_article, parse_marketaux_article
from .ss_base import MentionSource
from .ss_config import SentimentConfig
from .ss_models import SocialMention, _api_symbol, _normalize_tickers
from .ss_sources import PublisherRegistry

try:
	import requests
except ImportError:
	requests = None

logger = logging.getLogger("sentiment-scout")

FINNHUB_NEWS_URL = "https://finnhub.io/api/v1/company-news"
MARKETAUX_NEWS_URL = "https://api.marketaux.com/v1/news/all"


class RateLimiter:
	"""Spaces calls out so a shared API budget is not burst through.

	The instance guarding Finnhub is deliberately process-wide (see
	``FINNHUB_LIMITER``): the nightly union gather and any live refresh top-ups
	must not be able to collectively exceed the free plan's ceiling, which a
	per-caller limiter would allow.
	"""

	def __init__(self, min_interval: float):
		self.min_interval = min_interval
		self._lock = threading.Lock()
		self._last_call = 0.0

	def wait(self) -> None:
		with self._lock:
			delay = self.min_interval - (time.monotonic() - self._last_call)
			if delay > 0:
				time.sleep(delay)
			self._last_call = time.monotonic()

FINNHUB_LIMITER = RateLimiter(SentimentConfig.from_env().finnhub_min_interval)


class NewsSource(MentionSource, ABC):
	"""A news provider, plus the Supabase cache that lets refreshes reuse a
	nightly pull instead of spending live calls."""

	@property
	@abstractmethod
	def cache_max_age_hours(self) -> int:
		"""How long a cached pull stays usable on a refresh."""

	def save_cache(self, results: dict[str, list[SocialMention]]) -> None:
		raise NotImplementedError

	def load_cache(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		raise NotImplementedError

	def _to_payload(self, results: dict[str, list[SocialMention]]) -> dict[str, list[dict]]:
		return {ticker: [m.to_cache() for m in mentions] for ticker, mentions in results.items()}


class FinnhubSource(NewsSource):
	"""Live company news from trusted financial publishers, one call per ticker."""

	name = "finnhub"

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		limiter: RateLimiter | None = None,
		limit: int = 30,
	):
		super().__init__(config, registry)
		self.limiter = limiter or FINNHUB_LIMITER
		self.limit = limit

	@property
	def cache_max_age_hours(self) -> int:
		return self.config.finnhub_cache_max_age_hours

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		try:
			return self._collect(tickers)
		except NameError:
			return self.empty(tickers)

	def _collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		results = self.empty(tickers)
		if requests is None:
			return results

		api_key = os.getenv("FINNHUB_API_KEY", "").strip()
		if not api_key:
			return results

		headers = {"Accept": "application/json"}
		today = datetime.now(timezone.utc).date()
		date_from = (today - timedelta(days=max(1, self.config.news_lookback_days))).isoformat()
		date_to = today.isoformat()

		for ticker in tickers:
			sym = ticker.upper()
			params = {"symbol": _api_symbol(sym), "from": date_from, "to": date_to, "token": api_key}

			try:
				self.limiter.wait()
				resp = requests.get(FINNHUB_NEWS_URL, params=params, headers=headers, timeout=10)
				if resp.status_code != 200:
					# Surface the failure instead of silently degrading to social-only.
					if resp.status_code == 429:
						logger.warning("Finnhub news fetch for %s rate limited (HTTP 429)", sym)
					else:
						logger.info("Finnhub news fetch for %s returned HTTP %s", sym, resp.status_code)
					continue
				payload = resp.json()
				if not isinstance(payload, list):
					continue

				results[sym] = self._parse(sym, payload)
			except Exception:
				continue

		return results

	def _parse(self, sym: str, payload: list) -> list[SocialMention]:
		collected: list[SocialMention] = []
		for raw in payload:
			# Validate at the ingestion boundary: malformed articles are rejected
			# (dropped), anomalous ones are kept but flagged.
			article = parse_finnhub_article(raw)
			if article is None:
				continue
			# Recover syndicated wire stories (e.g. Reuters via Yahoo) so they are
			# tiered by the originating wire, not the reposting aggregator.
			effective_source = self.registry.effective_source(
				article.headline, article.summary, article.url, article.source
			)
			tier = self.registry.tier_of(effective_source)
			if tier is None:  # not a trusted publisher
				continue

			text = f"{article.headline}. {article.summary}".strip(". ").strip()
			if not text:
				continue

			collected.append(
				SocialMention(
					ticker=sym,
					text=text,
					headline=article.headline,
					source=f"finnhub:{effective_source}",
					url=article.url,
					engagement=0,
					created_at=article.created_at.isoformat() if article.created_at else None,
					weight=self.registry.weight_of(tier),
				)
			)
		collected.sort(key=lambda mention: mention.created_at or "", reverse=True)
		collected.sort(key=lambda mention: self.registry.tier_of(mention.source) or 9)
		return collected[: self.limit]

	def save_cache(self, results: dict[str, list[SocialMention]]) -> None:
		try:
			from .supabase_client import save_finnhub_news_cache

			save_finnhub_news_cache(self._to_payload(results))
		except Exception as exc:
			logger.warning("Failed to write Finnhub cache: %s", exc)

	def load_cache_with_misses(
		self, tickers: list[str]
	) -> tuple[dict[str, list[SocialMention]], list[str]]:
		try:
			from .supabase_client import load_finnhub_news_cache

			cached = load_finnhub_news_cache(tickers, self.cache_max_age_hours)
		except Exception as exc:
			logger.warning("Failed to read Finnhub cache: %s", exc)
			return {}, list(tickers)

		hits = {
			ticker: [SocialMention.from_cache(ticker, item) for item in cached[ticker]]
			for ticker in tickers
			if ticker in cached
		}
		misses = [ticker for ticker in tickers if ticker not in cached]
		return hits, misses

	def load_cache(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		return self.load_cache_with_misses(tickers)[0]


class MarketauxSource(NewsSource):
	"""Tier-1-only supplemental news, fetched in one batched, paginated query."""

	name = "marketaux"

	@property
	def cache_max_age_hours(self) -> int:
		return self.config.marketaux_cache_max_age_hours

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		results = self.empty(tickers)
		if requests is None or not tickers:
			return results

		api_key = os.getenv("MARKETAUX_API_KEY", "").strip()
		if not api_key:
			return results

		# Map the API-form symbol back to the original DB ticker so results stay
		# keyed the way the rest of the pipeline expects.
		sym_to_ticker = {_api_symbol(ticker): ticker for ticker in tickers}
		today = datetime.now(timezone.utc).date()
		published_after = (
			today - timedelta(days=max(1, self.config.news_lookback_days))
		).isoformat() + "T00:00"
		params = {
			"symbols": ",".join(sym_to_ticker.keys()),
			# Server-side tier-1-only filter: the API cannot return anything else.
			"domains": ",".join(domain for domain, _ in self.registry.TIER1_DOMAINS),
			"filter_entities": "true",
			"language": "en",
			"published_after": published_after,
			"api_token": api_key,
		}

		for page in range(1, max(1, self.config.marketaux_max_pages) + 1):
			try:
				resp = requests.get(MARKETAUX_NEWS_URL, params={**params, "page": page}, timeout=15)
				if resp.status_code != 200:
					break
				payload = resp.json()
			except Exception:
				break

			data = payload.get("data", []) if isinstance(payload, dict) else []
			if not data:
				break

			self._absorb_page(data, sym_to_ticker, results)

			# Stop early to avoid spending calls we don't need: a short page means
			# the source is exhausted, or every ticker may already be full.
			meta = payload.get("meta", {}) if isinstance(payload, dict) else {}
			page_limit = meta.get("limit") or len(data)
			if len(data) < page_limit:
				break
			if all(
				len(mentions) >= self.config.marketaux_limit_per_ticker
				for mentions in results.values()
			):
				break

		return results

	def _absorb_page(
		self,
		data: list,
		sym_to_ticker: dict[str, str],
		results: dict[str, list[SocialMention]],
	) -> None:
		for raw in data:
			article = parse_marketaux_article(raw)
			if article is None:
				continue
			# Client-side verification of the server-side whitelist: drop anything
			# that is not a recognized tier-1 publisher.
			publisher = self.registry.tier1_publisher(article.source)
			if publisher is None:
				continue

			text = f"{article.title}. {article.description}".strip(". ").strip()
			if not text:
				continue

			created_at = article.created_at.isoformat() if article.created_at else None
			for entity_symbol in article.symbols:
				ticker = sym_to_ticker.get(entity_symbol.upper())
				if ticker is None:
					continue
				if len(results[ticker]) >= self.config.marketaux_limit_per_ticker:
					continue
				results[ticker].append(
					SocialMention(
						ticker=ticker,
						text=text,
						headline=article.title,
						source=f"marketaux:{publisher}",
						url=article.url,
						engagement=0,
						created_at=created_at,
						weight=self.registry.weight_of(1),
					)
				)

	def save_cache(self, results: dict[str, list[SocialMention]]) -> None:
		try:
			from .supabase_client import save_marketaux_news_cache

			save_marketaux_news_cache(self._to_payload(results))
		except Exception as exc:
			logger.warning("Failed to write Marketaux cache: %s", exc)

	def load_cache(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		try:
			from .supabase_client import load_marketaux_news_cache

			cached = load_marketaux_news_cache(tickers, self.cache_max_age_hours)
		except Exception as exc:
			logger.warning("Failed to read Marketaux cache: %s", exc)
			return self.empty(tickers)

		return {
			ticker: [SocialMention.from_cache(ticker, item) for item in cached.get(ticker, [])]
			for ticker in tickers
		}


class NewsMode(str, Enum):
	"""Which run this is. Subclasses ``str`` so the plain strings the orchestrator
	passes ("off"/"fetch"/"cache") keep working unchanged."""

	OFF = "off"
	FETCH = "fetch"
	CACHE = "cache"


class NewsStrategy(ABC):
	"""How the news sources are combined for one kind of run."""

	def __init__(self, finnhub: FinnhubSource, marketaux: MarketauxSource, config: SentimentConfig):
		self.finnhub = finnhub
		self.marketaux = marketaux
		self.config = config

	@abstractmethod
	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		"""Collect news for the tickers under this run's caching policy."""

	@staticmethod
	def dedup_key(headline: str) -> str:
		return re.sub(r"[^a-z0-9]+", " ", (headline or "").lower()).strip()[:80]

	def merge(
		self,
		tickers: list[str],
		finnhub_news: dict[str, list[SocialMention]],
		marketaux_news: dict[str, list[SocialMention]],
	) -> dict[str, list[SocialMention]]:
		"""Merge Marketaux articles into the Finnhub list per ticker, de-duplicated
		by headline"""
		merged: dict[str, list[SocialMention]] = {}
		for ticker in tickers:
			existing = finnhub_news.get(ticker, [])
			seen = {self.dedup_key(mention.headline or mention.text) for mention in existing}
			extra = [
				mention
				for mention in marketaux_news.get(ticker, [])
				if self.dedup_key(mention.headline or mention.text) not in seen
			]
			merged[ticker] = existing + extra
		return merged


class LiveOnlyStrategy(NewsStrategy):
	"""Standalone/manual run: Finnhub live only, no caching."""

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		return self.finnhub.collect(tickers)


class FetchAndCacheStrategy(NewsStrategy):
	"""Nightly batch: query both sources live (deep pagination for Marketaux) and
	write both caches for refreshes to reuse."""

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		finnhub_news = self.finnhub.collect(tickers)
		self.finnhub.save_cache(finnhub_news)
		marketaux_news = self.marketaux.collect(tickers)
		self.marketaux.save_cache(marketaux_news)
		return self.merge(tickers, finnhub_news, marketaux_news)


class CacheFirstStrategy(NewsStrategy):

	def collect(self, tickers: list[str]) -> dict[str, list[SocialMention]]:
		finnhub_news, misses = self.finnhub.load_cache_with_misses(tickers)
		if misses:
			cap = self.config.finnhub_live_topup_max
			topup = misses if cap <= 0 else misses[:cap]
			if len(misses) > len(topup):
				logger.info(
					"Finnhub cache: %d of %d missing tickers topped up live this refresh "
					"(rest deferred to the nightly run)",
					len(topup),
					len(misses),
				)
			if topup:
				live = self.finnhub.collect(topup)
				finnhub_news.update(live)
				# Persist the top-up so the next refresh is a cache hit, not another call.
				self.finnhub.save_cache(live)
		# Any ticker still absent (deferred miss) resolves to an empty list in the merge.
		marketaux_news = self.marketaux.load_cache(tickers)
		return self.merge(tickers, finnhub_news, marketaux_news)


class NewsCollector:
	"""Picks the strategy for a run and collects trusted-source news with it."""

	STRATEGIES: dict[NewsMode, type[NewsStrategy]] = {
		NewsMode.OFF: LiveOnlyStrategy,
		NewsMode.FETCH: FetchAndCacheStrategy,
		NewsMode.CACHE: CacheFirstStrategy,
	}

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		finnhub: FinnhubSource | None = None,
		marketaux: MarketauxSource | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.finnhub = finnhub or FinnhubSource(self.config, self.registry)
		self.marketaux = marketaux or MarketauxSource(self.config, self.registry)

	def strategy_for(self, mode: NewsMode | str) -> NewsStrategy:
		try:
			resolved = NewsMode(mode)
		except ValueError:
			resolved = NewsMode.OFF
		return self.STRATEGIES[resolved](self.finnhub, self.marketaux, self.config)

	def collect(
		self, tickers: list[str], mode: NewsMode | str = NewsMode.OFF
	) -> dict[str, list[SocialMention]]:
		normalized_tickers = _normalize_tickers(tickers)
		return self.strategy_for(mode).collect(normalized_tickers)


def collect_news(tickers: list[str], marketaux: str = "off") -> dict[str, list[SocialMention]]:
	return NewsCollector().collect(tickers, marketaux)
