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
			resp = requests.get(FINNHUB_NEWS_URL, params=params, headers=headers, timeout=10)
			if resp.status_code != 200:
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
	"""Serialize a Marketaux SocialMention to the cache JSON shape."""
	return {
		"text": mention.text,
		"headline": mention.headline,
		"source": mention.source,
		"url": mention.url,
		"created_at": mention.created_at,
		"weight": mention.weight,
	}


def _cache_to_mention(ticker: str, data: dict[str, Any]) -> SocialMention:
	"""Rebuild a SocialMention from a cached Marketaux article."""
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


def collect_news(tickers: list[str], marketaux: str = "off") -> dict[str, list[SocialMention]]:
	"""Collect trusted-source news for the tickers.

	Finnhub is always queried live. The Marketaux tier-1 top-up is controlled by
	``marketaux``:

	- ``"off"``   (default): Finnhub only.
	- ``"fetch"`` (nightly batch): call the Marketaux API (deep pagination) and
	  write the results to the per-ticker cache for refreshes to reuse.
	- ``"cache"`` (user refresh): read the last nightly pull from the cache -- no
	  API call -- so tier-1 stays visible without spending the call budget.

	Marketaux articles are merged into the Finnhub list, de-duplicated by headline
	(the Finnhub copy is kept when both carry the same story).
	"""
	normalized_tickers = _normalize_tickers(tickers)
	try:
		finnhub_news = _collect_finnhub_news(normalized_tickers)
	except NameError:
		finnhub_news = {ticker: [] for ticker in normalized_tickers}

	if marketaux == "fetch":
		marketaux_news = _collect_marketaux_news(normalized_tickers)
		_save_marketaux_cache(marketaux_news)
	elif marketaux == "cache":
		marketaux_news = _load_marketaux_cache(normalized_tickers)
	else:
		return finnhub_news

	merged: dict[str, list[SocialMention]] = {}
	for ticker in normalized_tickers:
		existing = finnhub_news.get(ticker, [])
		seen = {_news_dedup_key(mention.headline or mention.text) for mention in existing}
		extra = [
			mention
			for mention in marketaux_news.get(ticker, [])
			if _news_dedup_key(mention.headline or mention.text) not in seen
		]
		merged[ticker] = existing + extra
	return merged
