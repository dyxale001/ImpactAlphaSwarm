"""Sentiment Scout Worker Module

Purpose: Collect social mentions from StockTwits, score them with VADER,
and produce a unified Raw Sentiment Score (0-100).

The worker is designed to run safely when API credentials or optional libraries are
not available. In that case, it returns neutral scores with no collected posts.
"""

from __future__ import annotations

import os
import re
import warnings
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

warnings.filterwarnings("ignore")

try:
	from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except ImportError:
	SentimentIntensityAnalyzer = None

try:
	import cloudscraper
except ImportError:
	cloudscraper = None

try:
	import requests
except ImportError:
	requests = None

from .gcp_nlp import score_with_gcp


# Number of most-engaged posts per ticker that also get a GCP NLP signal.
# The rest are VADER-only to stay within the GCP monthly unit budget.
GCP_TOP_N = int(os.getenv("GCP_SENTIMENT_TOP_N", "5"))


@dataclass(frozen=True)
class SocialMention:
	ticker: str
	text: str
	source: str
	url: str | None = None
	engagement: int = 0
	created_at: str | None = None


def _normalize_tickers(tickers: list[str]) -> list[str]:
	return sorted({ticker.upper().strip() for ticker in tickers if ticker and ticker.strip()})


def _clean_text(text: str) -> str:
	text = re.sub(r"https?://\S+", " ", text)
	text = re.sub(r"\$[A-Za-z][A-Za-z0-9_.-]*", " ", text)
	text = re.sub(r"[^\w\s'.-]", " ", text)
	text = re.sub(r"\s+", " ", text).strip()
	return text


@lru_cache(maxsize=1)
def _get_vader_analyzer():
	if SentimentIntensityAnalyzer is None:
		return None
	return SentimentIntensityAnalyzer()


def _score_with_vader(text: str) -> float:
	analyzer = _get_vader_analyzer()
	if analyzer is None:
		return 0.0
	return float(analyzer.polarity_scores(text)["compound"])


def _combine_scores(vader_score: float, gcp_score: float | None) -> float:
	"""Dual-signal blend: average VADER and GCP NLP when both are available,
	otherwise fall back to VADER alone."""
	if gcp_score is None:
		return vader_score
	return 0.5 * vader_score + 0.5 * gcp_score


def _mention_sentiment(text: str, use_gcp: bool = False) -> float:
	cleaned = _clean_text(text)
	vader_score = _score_with_vader(cleaned)
	gcp_score = score_with_gcp(cleaned) if use_gcp else None
	return _combine_scores(vader_score, gcp_score)


def _score_mentions(mentions: list[SocialMention]) -> dict[str, Any]:
	if not mentions:
		return {
			"sentiment_score": 50,
			"bullish_posts": 0,
			"bearish_posts": 0,
			"top_posts": [],
			"mention_count": 0,
		}

	scored_mentions: list[dict[str, Any]] = []
	bullish_posts = 0
	bearish_posts = 0

	# Only the most-engaged posts get the (metered) GCP NLP signal; the rest
	# are scored with VADER alone to respect the GCP monthly unit budget.
	gcp_indices = {
		idx
		for idx, _ in sorted(
			enumerate(mentions), key=lambda pair: pair[1].engagement, reverse=True
		)[:GCP_TOP_N]
	}

	for index, mention in enumerate(mentions):
		signed_score = _mention_sentiment(mention.text, use_gcp=index in gcp_indices)
		if signed_score >= 0.05:
			bullish_posts += 1
		elif signed_score <= -0.05:
			bearish_posts += 1

		scored_mentions.append(
			{
				"text": mention.text,
				"source": mention.source,
				"url": mention.url,
				"engagement": mention.engagement,
				"sentiment_raw": round(signed_score, 4),
				"sentiment_contribution": round((signed_score + 1) * 50, 2),
			}
		)

	average_signed = sum(item["sentiment_raw"] for item in scored_mentions) / len(scored_mentions)
	sentiment_score = int(round(max(0.0, min(1.0, (average_signed + 1.0) / 2.0)) * 100))

	top_posts = sorted(scored_mentions, key=lambda item: abs(item["sentiment_raw"]), reverse=True)[:3]

	return {
		"sentiment_score": sentiment_score,
		"bullish_posts": bullish_posts,
		"bearish_posts": bearish_posts,
		"top_posts": top_posts,
		"mention_count": len(scored_mentions),
	}


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
		url = f"https://api.stocktwits.com/api/2/streams/symbol/{sym}.json"
		params = {"limit": limit}
		if client_id:
			params["client_id"] = client_id

		try:
			resp = session.get(url, params=params, headers=headers, timeout=10)
			if resp.status_code != 200:
				continue
			payload = resp.json()
			messages = payload.get("messages", [])[:limit] if isinstance(payload, dict) else []
			for msg in messages:
				body = msg.get("body", "") or ""
				symbols = [s.get("symbol", "").upper() for s in msg.get("symbols", []) if s.get("symbol")]
				if symbols and sym not in symbols and sym not in body.upper() and f"${sym}" not in body.upper():
					continue
				url_link = msg.get("url") or None
				user = (msg.get("user") or {}).get("username", "")
				likes = (msg.get("likes") or {}).get("total", 0) or 0
				retweets = (msg.get("retweets") or {}).get("total", 0) or 0
				engagement = int(likes) + int(retweets)
				results[sym].append(
					SocialMention(
						ticker=sym,
						text=body,
						source=f"stocktwits:{user}",
						url=url_link,
						engagement=engagement,
						created_at=msg.get("created_at"),
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


def analyze_ticker(ticker: str) -> dict[str, Any]:
	mentions = collect_mentions([ticker]).get(ticker.upper(), [])
	scored = _score_mentions(mentions)
	scored["ticker"] = ticker.upper()
	scored["sources"] = {
		"stocktwits",
	}
	return scored


def analyze_tickers(tickers: list[str]) -> dict[str, dict[str, Any]]:
	normalized_tickers = _normalize_tickers(tickers)
	mentions_by_ticker = collect_mentions(normalized_tickers)

	results: dict[str, dict[str, Any]] = {}
	for ticker in normalized_tickers:
		scored = _score_mentions(mentions_by_ticker.get(ticker, []))
		scored["ticker"] = ticker
		scored["sources"] = {
			"stocktwits": sum(1 for mention in mentions_by_ticker.get(ticker, []) if mention.source.startswith("stocktwits:")),
		}
		results[ticker] = scored

	return results