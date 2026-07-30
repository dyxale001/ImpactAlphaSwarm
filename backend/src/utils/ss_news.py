"""Sentiment scout: trusted-source news collection.

Two sources, deliberately used differently:

  * Finnhub is queried live on every run and supplies the bulk of the volume.
  * Marketaux is a tier-1-only top-up on a tight free-plan call budget, so it runs
    ONCE per night with deep pagination and its results are cached. User refreshes
    read that cache rather than spending calls.

Anything from a publisher outside the trust tiers is dropped before scoring.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from .schemas import parse_finnhub_article, parse_marketaux_article
from .ss_models import SocialMention, _api_symbol, _normalize_tickers
from .ss_sources import (
	_TIER1_DOMAINS,
	_effective_source,
	_source_tier,
	_tier1_publisher,
	_tier_weight,
)

try:
	import requests
except ImportError:
	requests = None

logger = logging.getLogger("sentiment-scout")

# Finnhub company-news lookback window and endpoint.
FINNHUB_NEWS_URL = "https://finnhub.io/api/v1/company-news"
NEWS_LOOKBACK_DAYS = int(os.getenv("NEWS_LOOKBACK_DAYS", "7"))

# Marketaux supplemental news endpoint. Used only as a tier-1-only top-up, gated
# behind ``MARKETAUX_API_KEY`` and called at most once per run (all tickers in a
# single batched request) to respect the free plan's tight monthly call budget.
MARKETAUX_NEWS_URL = "https://api.marketaux.com/v1/news/all"
# Cap on articles kept per ticker from a Marketaux run.
MARKETAUX_LIMIT_PER_TICKER = int(os.getenv("MARKETAUX_LIMIT_PER_TICKER", "10"))
# The free plan returns only ~3 articles per request, so we page through results to
# pull a useful tier-1 volume across the whole ticker union. Each page is one API
# call. Marketaux runs ONLY in the nightly batch (once/day), so we can page deep --
# 25 pages ~= 75 articles for ~25 of the ~100 daily calls. Override via env.
MARKETAUX_MAX_PAGES = int(os.getenv("MARKETAUX_MAX_PAGES", "25"))
# Cached Marketaux articles are considered usable on refresh for this many hours
# after the nightly fetch (covers a missed/late nightly run without serving stale
# week-old news).
MARKETAUX_CACHE_MAX_AGE_HOURS = int(os.getenv("MARKETAUX_CACHE_MAX_AGE_HOURS", "48"))

# Finnhub company-news is now cached by the nightly batch and read back on refresh
# (see migrations/010) so refreshes stop making a live call per ticker. Cache
# entries are usable on refresh for this many hours after the nightly fetch.
FINNHUB_CACHE_MAX_AGE_HOURS = int(os.getenv("FINNHUB_CACHE_MAX_AGE_HOURS", "48"))
# On refresh, a ticker missing from the cache (e.g. watchlisted intraday) is topped
# up with a single throttled live call. Cap how many such live calls one refresh
# may make so a cold cache can't turn one refresh into a long live burst; the rest
# are covered by the next nightly run. 0 disables the cap.
FINNHUB_LIVE_TOPUP_MAX = int(os.getenv("FINNHUB_LIVE_TOPUP_MAX", "15"))

# --- Shared Finnhub rate throttle --------------------------------------------
# The free plan allows 60 calls/min per key; going over returns HTTP 429 and the
# call is lost. Space every Finnhub call in this process to stay safely under that
# ceiling (default ~1.1s => ~54/min). Shared by all callers in ss_news so the
# nightly union gather and any live top-ups can't collectively burst past the cap.
_FINNHUB_MIN_INTERVAL = float(os.getenv("FINNHUB_MIN_INTERVAL_SECONDS", "1.1"))
_finnhub_throttle_lock = threading.Lock()
_finnhub_last_call = 0.0


def _finnhub_throttle() -> None:
    global _finnhub_last_call
    with _finnhub_throttle_lock:
        wait = _FINNHUB_MIN_INTERVAL - (time.monotonic() - _finnhub_last_call)
        if wait > 0:
            time.sleep(wait)
        _finnhub_last_call = time.monotonic()


def _collect_finnhub_news(tickers: list[str], limit: int = 30) -> dict[str, list[SocialMention]]:
	"""Collect recent company news from trusted financial publishers via Finnhub."""
	results: dict[str, list[SocialMention]] = {ticker: [] for ticker in tickers}
	if requests is None:
		return results

	api_key = os.getenv("FINNHUB_API_KEY", "").strip()
	if not api_key:
		return results

	headers = {"Accept": "application/json"}
	today = datetime.now(timezone.utc).date()
	date_from = (today - timedelta(days=max(1, NEWS_LOOKBACK_DAYS))).isoformat()
	date_to = today.isoformat()

	for ticker in tickers:
		sym = ticker.upper()
		params = {"symbol": _api_symbol(sym), "from": date_from, "to": date_to, "token": api_key}

		try:
			_finnhub_throttle()
			resp = requests.get(FINNHUB_NEWS_URL, params=params, headers=headers, timeout=10)
			if resp.status_code != 200:
				# Surface the failure instead of silently degrading to social-only.
				# 429 (free-tier rate limit) is the usual culprit and gets a louder
				# level since it means calls are being dropped, not that news is absent.
				if resp.status_code == 429:
					logger.warning("Finnhub news fetch for %s rate limited (HTTP 429)", sym)
				else:
					logger.info("Finnhub news fetch for %s returned HTTP %s", sym, resp.status_code)
				continue
			payload = resp.json()
			if not isinstance(payload, list):
				continue

			collected: list[SocialMention] = []
			for raw in payload:
				# Validate at the ingestion boundary: malformed articles are
				# rejected (dropped), anomalous ones are kept but flagged.
				article = parse_finnhub_article(raw)
				if article is None:
					continue
				# Recover syndicated wire stories (e.g. Reuters via Yahoo) so they
				# are tiered by the originating wire, not the reposting aggregator.
				effective_source = _effective_source(
					article.headline, article.summary, article.url, article.source
				)
				tier = _source_tier(effective_source)
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
						weight=_tier_weight(tier),
					)
				)

			# Rank before truncating. Finnhub has no tier parameter and does not
			# document its ordering, so the cap must not be applied in arrival
			# order: a run of tier-2/3 items at the head of the response would
			# push genuine tier-1 wires past the limit and drop them, even though
			# tier-1 carries the largest share of the news score. The whole window
			# is already downloaded by this point, so ranking it costs nothing.
			#
			# Two stable passes give tier ascending with recency preserved inside
			# each tier: tier-1 newest first, then tier-2, then tier-3.
			collected.sort(key=lambda mention: mention.created_at or "", reverse=True)
			collected.sort(key=lambda mention: _source_tier(mention.source) or 9)
			results[sym] = collected[:limit]
		except Exception:
			continue

	return results


def _news_dedup_key(headline: str) -> str:
	return re.sub(r"[^a-z0-9]+", " ", (headline or "").lower()).strip()[:80]


def _collect_marketaux_news(tickers: list[str]) -> dict[str, list[SocialMention]]:
	"""Collect tier-1-only company news from Marketaux in one batched query."""
	results: dict[str, list[SocialMention]] = {ticker: [] for ticker in tickers}
	if requests is None or not tickers:
		return results

	api_key = os.getenv("MARKETAUX_API_KEY", "").strip()
	if not api_key:
		return results

	# Map the API-form symbol back to the original DB ticker so results stay keyed
	# the way the rest of the pipeline expects.
	sym_to_ticker = {_api_symbol(ticker): ticker for ticker in tickers}
	today = datetime.now(timezone.utc).date()
	published_after = (today - timedelta(days=max(1, NEWS_LOOKBACK_DAYS))).isoformat() + "T00:00"
	params = {
		"symbols": ",".join(sym_to_ticker.keys()),
		# Server-side tier-1-only filter: the API cannot return anything else.
		"domains": ",".join(domain for domain, _ in _TIER1_DOMAINS),
		"filter_entities": "true",
		"language": "en",
		"published_after": published_after,
		"api_token": api_key,
	}

	for page in range(1, max(1, MARKETAUX_MAX_PAGES) + 1):
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

		for raw in data:
			article = parse_marketaux_article(raw)
			if article is None:
				continue
			# Client-side verification of the server-side whitelist: drop anything
			# that is not a recognized tier-1 publisher.
			publisher = _tier1_publisher(article.source)
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
				if len(results[ticker]) >= MARKETAUX_LIMIT_PER_TICKER:
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
						weight=_tier_weight(1),
					)
				)

		# Stop early to avoid spending calls we don't need: a short page means the
		# source is exhausted, or every ticker may already be full.
		meta = payload.get("meta", {}) if isinstance(payload, dict) else {}
		page_limit = meta.get("limit") or len(data)
		if len(data) < page_limit:
			break
		if all(len(mentions) >= MARKETAUX_LIMIT_PER_TICKER for mentions in results.values()):
			break

	return results


def _mention_to_cache(mention: SocialMention) -> dict[str, Any]:
	"""Serialize a news SocialMention to the cache JSON shape (Finnhub + Marketaux
	share the same fields)."""
	return {
		"text": mention.text,
		"headline": mention.headline,
		"source": mention.source,
		"url": mention.url,
		"created_at": mention.created_at,
		"weight": mention.weight,
	}


def _cache_to_mention(ticker: str, data: dict[str, Any]) -> SocialMention:
	"""Rebuild a news SocialMention from a cached article."""
	return SocialMention(
		ticker=ticker,
		text=data.get("text", ""),
		headline=data.get("headline"),
		source=data.get("source", ""),
		url=data.get("url"),
		engagement=0,
		created_at=data.get("created_at"),
		weight=float(data.get("weight", 1.0)),
	)


def _save_marketaux_cache(results: dict[str, list[SocialMention]]) -> None:
	"""Persist the nightly Marketaux pull so refreshes can reuse it. Best-effort:
	a cache write must never break the run."""
	try:
		from .supabase_client import save_marketaux_news_cache

		payload = {
			ticker: [_mention_to_cache(m) for m in mentions]
			for ticker, mentions in results.items()
		}
		save_marketaux_news_cache(payload)
	except Exception as exc:
		logger.warning("Failed to write Marketaux cache: %s", exc)


def _load_marketaux_cache(tickers: list[str]) -> dict[str, list[SocialMention]]:
	"""Load cached Marketaux articles per ticker. Best-effort: on any failure,
	return empty so news simply falls back to Finnhub-only."""
	try:
		from .supabase_client import load_marketaux_news_cache

		cached = load_marketaux_news_cache(tickers, MARKETAUX_CACHE_MAX_AGE_HOURS)
	except Exception as exc:
		logger.warning("Failed to read Marketaux cache: %s", exc)
		return {ticker: [] for ticker in tickers}

	return {
		ticker: [_cache_to_mention(ticker, item) for item in cached.get(ticker, [])]
		for ticker in tickers
	}


def _finnhub_live(tickers: list[str]) -> dict[str, list[SocialMention]]:
	"""Live Finnhub collection with the historical NameError guard."""
	try:
		return _collect_finnhub_news(tickers)
	except NameError:
		return {ticker: [] for ticker in tickers}


def _save_finnhub_cache(results: dict[str, list[SocialMention]]) -> None:
	"""Persist a Finnhub pull so refreshes can reuse it. Best-effort: a cache write
	must never break the run."""
	try:
		from .supabase_client import save_finnhub_news_cache

		payload = {
			ticker: [_mention_to_cache(m) for m in mentions]
			for ticker, mentions in results.items()
		}
		save_finnhub_news_cache(payload)
	except Exception as exc:
		logger.warning("Failed to write Finnhub cache: %s", exc)


def _load_finnhub_cache(
	tickers: list[str],
) -> tuple[dict[str, list[SocialMention]], list[str]]:
	"""Load cached Finnhub articles per ticker. Returns ``(hits, misses)`` where a
	hit is a ticker with a fresh cache row (even an empty one -- genuinely no news
	last night) and a miss is a ticker with no fresh row (never cached / stale), to
	be topped up live by the caller. Best-effort: on any failure every ticker is a
	miss so news degrades to a live fetch rather than vanishing."""
	try:
		from .supabase_client import load_finnhub_news_cache

		cached = load_finnhub_news_cache(tickers, FINNHUB_CACHE_MAX_AGE_HOURS)
	except Exception as exc:
		logger.warning("Failed to read Finnhub cache: %s", exc)
		return {}, list(tickers)

	hits = {
		ticker: [_cache_to_mention(ticker, item) for item in cached[ticker]]
		for ticker in tickers
		if ticker in cached
	}
	misses = [ticker for ticker in tickers if ticker not in cached]
	return hits, misses


def _merge_news(
	tickers: list[str],
	finnhub_news: dict[str, list[SocialMention]],
	marketaux_news: dict[str, list[SocialMention]],
) -> dict[str, list[SocialMention]]:
	"""Merge Marketaux articles into the Finnhub list per ticker, de-duplicated by
	headline (the Finnhub copy wins when both carry the same story)."""
	merged: dict[str, list[SocialMention]] = {}
	for ticker in tickers:
		existing = finnhub_news.get(ticker, [])
		seen = {_news_dedup_key(mention.headline or mention.text) for mention in existing}
		extra = [
			mention
			for mention in marketaux_news.get(ticker, [])
			if _news_dedup_key(mention.headline or mention.text) not in seen
		]
		merged[ticker] = existing + extra
	return merged


def collect_news(tickers: list[str], marketaux: str = "off") -> dict[str, list[SocialMention]]:
	"""Collect trusted-source news for the tickers.

	Both news sources are cached by the nightly batch and read back on refresh so a
	user refresh makes essentially no live API calls (which is what kept Finnhub's
	60/min free-tier budget from being exhausted). Controlled by ``marketaux``:

	- ``"off"``   (default): Finnhub live only, no caching (standalone/manual path).
	- ``"fetch"`` (nightly batch): query Finnhub and Marketaux live (deep pagination
	  for Marketaux) and write both to their per-ticker caches for refreshes to reuse.
	- ``"cache"`` (user refresh): read both from the cache -- no Finnhub call per
	  ticker -- topping up only cache-miss tickers (e.g. watchlisted intraday) with
	  a single throttled live Finnhub call each, bounded by FINNHUB_LIVE_TOPUP_MAX.

	Marketaux articles are merged into the Finnhub list, de-duplicated by headline
	(the Finnhub copy is kept when both carry the same story).
	"""
	normalized_tickers = _normalize_tickers(tickers)

	if marketaux == "off":
		return _finnhub_live(normalized_tickers)

	if marketaux == "fetch":
		finnhub_news = _finnhub_live(normalized_tickers)
		_save_finnhub_cache(finnhub_news)
		marketaux_news = _collect_marketaux_news(normalized_tickers)
		_save_marketaux_cache(marketaux_news)
		return _merge_news(normalized_tickers, finnhub_news, marketaux_news)

	# marketaux == "cache" (user refresh): read the caches, top up only misses.
	finnhub_news, misses = _load_finnhub_cache(normalized_tickers)
	if misses:
		topup = misses if FINNHUB_LIVE_TOPUP_MAX <= 0 else misses[:FINNHUB_LIVE_TOPUP_MAX]
		if len(misses) > len(topup):
			logger.info(
				"Finnhub cache: %d of %d missing tickers topped up live this refresh "
				"(rest deferred to the nightly run)",
				len(topup),
				len(misses),
			)
		if topup:
			live = _finnhub_live(topup)
			finnhub_news.update(live)
			# Persist the top-up so the next refresh is a cache hit, not another call.
			_save_finnhub_cache(live)
	# Any ticker still absent (deferred miss) resolves to an empty list in the merge.
	marketaux_news = _load_marketaux_cache(normalized_tickers)
	return _merge_news(normalized_tickers, finnhub_news, marketaux_news)
