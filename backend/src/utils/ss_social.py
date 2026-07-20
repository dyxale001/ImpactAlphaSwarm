"""Sentiment scout: social chatter collection (StockTwits).

Two filters run before a post is allowed to vote. A quality gate drops bare
cashtags, watchlist dumps and promos, which carry no ticker-specific opinion; and
a per-author dedup collapses near-identical reposts, so one person spamming the
same take cannot stack the sentiment score.
"""

from __future__ import annotations

import os
import re

from .schemas import parse_stocktwits_message
from .ss_models import SocialMention, _api_symbol, _normalize_tickers

try:
	import cloudscraper
except ImportError:
	cloudscraper = None

try:
	import requests
except ImportError:
	requests = None


def _collect_stocktwits_mentions(tickers: list[str], limit: int = 30) -> dict[str, list[SocialMention]]:
	results = {ticker: [] for ticker in tickers}
	if requests is None and cloudscraper is None:
		return results

	client_id = os.getenv("STOCKTWITS_CLIENT_ID", None)
	headers = {
		"Accept": "application/json",
		"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	}

	session = None
	if cloudscraper is not None:
		try:
			session = cloudscraper.create_scraper(browser={"browser": "chrome", "platform": "linux", "desktop": True})
		except Exception:
			session = None

	if session is None:
		session = requests

	for ticker in tickers:
		sym = ticker.upper()
		api_sym = _api_symbol(sym)
		url = f"https://api.stocktwits.com/api/2/streams/symbol/{api_sym}.json"
		params = {"limit": limit}
		if client_id:
			params["client_id"] = client_id

		try:
			resp = session.get(url, params=params, headers=headers, timeout=10)
			if resp.status_code != 200:
				continue
			payload = resp.json()
			messages = payload.get("messages", [])[:limit] if isinstance(payload, dict) else []
			# Collapse near-duplicate posts from the same author (spammers repost
			# the same take) so one person can't stack the sentiment vote.
			seen_author_posts: set[tuple[str, str]] = set()
			for msg in messages:
				# Validate at the ingestion boundary: malformed messages are
				# rejected (dropped), anomalous ones are kept but flagged.
				validated = parse_stocktwits_message(msg)
				if validated is None:
					continue

				# Quality gate: drop bare cashtags, watchlist lists and promos —
				# posts with no usable, ticker-specific opinion.
				if not validated.passes_quality:
					continue

				body_upper = validated.body.upper()
				if validated.symbols and api_sym not in validated.symbols and api_sym not in body_upper and f"${api_sym}" not in body_upper:
					continue

				author = (validated.username or "").lower()
				dedup_key = (author, re.sub(r"\W+", "", validated.display_body.lower())[:100])
				if author and dedup_key in seen_author_posts:
					continue
				seen_author_posts.add(dedup_key)

				results[sym].append(
					SocialMention(
						ticker=sym,
						# Cleaned, professional text — used for both scoring and display.
						text=validated.display_body,
						source=f"stocktwits:{validated.username or ''}",
						url=validated.url,
						engagement=validated.likes + validated.reshares + validated.replies,
						likes=validated.likes,
						reshares=validated.reshares,
						replies=validated.replies,
						created_at=validated.created_at.isoformat() if validated.created_at else None,
						declared_sentiment=validated.declared_sentiment,
					)
				)
		except Exception:
			continue

	return results


def collect_mentions(tickers: list[str]) -> dict[str, list[SocialMention]]:
	normalized_tickers = _normalize_tickers(tickers)

	try:
		stocktwits_mentions = _collect_stocktwits_mentions(normalized_tickers)
	except NameError:
		stocktwits_mentions = {ticker: [] for ticker in normalized_tickers}

	combined: dict[str, list[SocialMention]] = {ticker: [] for ticker in normalized_tickers}
	for ticker in normalized_tickers:
		combined[ticker].extend(stocktwits_mentions.get(ticker, []))

	return combined
