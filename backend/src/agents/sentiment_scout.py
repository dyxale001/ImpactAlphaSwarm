"""Sentiment Scout Worker Module

Purpose: Collect sentiment signals for each ticker from two sources and blend them
into a unified Raw Sentiment Score (0-100):

- News sentiment from trusted financial publishers (via Finnhub company-news).
- Social sentiment from StockTwits.

Both signals are scored with the same VADER + GCP NLP pipeline. News is weighted
higher than social (default 70/30) because trusted financial reporting is a more
reliable signal than retail chatter; when only one source has data the score falls
back to that source alone.

The worker is designed to run safely when API credentials or optional libraries are
not available. In that case, it returns neutral scores with no collected posts.
"""

from __future__ import annotations

import os
import re
import urllib.parse
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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
from ..utils.schemas import parse_finnhub_article, parse_stocktwits_message


# Number of most-prioritized posts per ticker (per source) that also get a GCP
# NLP signal. The rest are VADER-only to stay within the GCP monthly unit budget.
GCP_TOP_N = int(os.getenv("GCP_SENTIMENT_TOP_N", "5"))

# Blend weight for the news signal; the social signal gets the remainder. News is
# weighted higher because trusted financial reporting is a more reliable signal
# than retail social chatter. Clamped to [0, 1].
NEWS_WEIGHT = min(1.0, max(0.0, float(os.getenv("NEWS_SENTIMENT_WEIGHT", "0.7"))))
SOCIAL_WEIGHT = 1.0 - NEWS_WEIGHT

# Finnhub company-news lookback window and endpoint.
FINNHUB_NEWS_URL = "https://finnhub.io/api/v1/company-news"
NEWS_LOOKBACK_DAYS = int(os.getenv("NEWS_LOOKBACK_DAYS", "7"))

# Trusted publishers, split into reliability tiers. Each tier carries a weight so
# that, within the news signal, a tier-1 wire counts for more than a tier-2/3
# article. Sources are matched case-insensitively against Finnhub's ``source``
# field (substring match, so "yahoo" matches "Yahoo Finance"). A source not listed
# in any tier is not trusted and is dropped before scoring. Each tier's source
# list and weight is overridable via env (e.g. NEWS_TIER2_SOURCES, NEWS_TIER2_WEIGHT).
_DEFAULT_TIER_SOURCES: dict[int, tuple[str, ...]] = {
    # Tier 1: established financial wires / newspapers of record.
    1: (
        "reuters",
        "bloomberg",
        "cnbc",
        "wall street journal",
        "wsj",
        "financial times",
        "associated press",
        "ap news",
        "marketwatch",
        "barron",
        "the economist",
        "morningstar",
    ),
    # Tier 2: reputable but more aggregator / secondary outlets.
    2: (
        "yahoo",
        "forbes",
        "investor's business daily",
        "investors business daily",
        "business insider",
    ),
    # Tier 3: crowd-sourced / contributor analysis.
    3: (
        "seekingalpha",
        "seeking alpha",
        "the motley fool",
        "motley fool",
    ),
}

_DEFAULT_TIER_WEIGHTS: dict[int, float] = {1: 1.0, 2: 0.6, 3: 0.3}


def _tier_sources(tier: int) -> tuple[str, ...]:
    override = os.getenv(f"NEWS_TIER{tier}_SOURCES", "").strip()
    if not override:
        return _DEFAULT_TIER_SOURCES[tier]
    return tuple(s.strip().lower() for s in override.split(",") if s.strip())


def _tier_weight(tier: int) -> float:
    try:
        return float(os.getenv(f"NEWS_TIER{tier}_WEIGHT", str(_DEFAULT_TIER_WEIGHTS[tier])))
    except ValueError:
        return _DEFAULT_TIER_WEIGHTS[tier]


def _source_tier(source: str) -> int | None:
    """Return 1/2/3 for a recognized trusted publisher, else ``None``."""
    name = (source or "").lower()
    for tier in (1, 2, 3):
        if any(s in name for s in _tier_sources(tier)):
            return tier
    return None


# --- Syndicated wire recovery ------------------------------------------------
# Aggregators (Yahoo, MarketWatch, …) routinely republish wire-service stories.
# Finnhub credits the aggregator in ``source``, which down-tiers a genuine
# tier-1 wire. We recover the originating wire from (a) the article URL's domain
# and (b) a leading dateline in the text ("WASHINGTON (Reuters) - …") and tier on
# that instead, so a Reuters story republished by an aggregator is credited as
# Reuters (tier 1) rather than the aggregator (tier 2/3). Conservative by design:
# only known tier-1 wires are recovered, and datelines are honored only near the
# start of the text so an article that merely *mentions* a wire isn't upgraded.
# Returned names substring-match the tier-1 source lists in ``_DEFAULT_TIER_SOURCES``.
_WIRE_DOMAINS: tuple[tuple[str, str], ...] = (
    ("reuters.com", "Reuters"),
    ("bloomberg.com", "Bloomberg"),
    ("wsj.com", "Wall Street Journal"),
    ("ft.com", "Financial Times"),
    ("apnews.com", "Associated Press"),
    ("cnbc.com", "CNBC"),
    ("barrons.com", "Barron's"),
    ("economist.com", "The Economist"),
    ("morningstar.com", "Morningstar"),
)

_DATELINE_RE = re.compile(r"\((reuters|bloomberg|ap|associated press|dow jones)\)", re.IGNORECASE)
_DATELINE_NAMES: dict[str, str] = {
    "reuters": "Reuters",
    "bloomberg": "Bloomberg",
    "ap": "Associated Press",
    "associated press": "Associated Press",
    "dow jones": "Dow Jones",
}

# Only trust a wire dateline that appears near the start of the article text.
_DATELINE_SCAN_CHARS = 200


def _effective_source(headline: str, summary: str, url: str | None, source: str) -> str:
    """Resolve the *originating* publisher for tiering.

    Returns the wire service when the article is a syndicated wire story
    (detected via URL domain or a leading dateline), otherwise the publisher
    Finnhub reported in ``source``."""
    if url:
        host = urllib.parse.urlparse(url).netloc.lower()
        for domain, name in _WIRE_DOMAINS:
            if host == domain or host.endswith("." + domain):
                return name

    lead = f"{headline} {summary}"[:_DATELINE_SCAN_CHARS]
    match = _DATELINE_RE.search(lead)
    if match:
        return _DATELINE_NAMES[match.group(1).lower()]

    return source




@dataclass(frozen=True)
class SocialMention:
	ticker: str
	text: str
	source: str
	url: str | None = None
	engagement: int = 0
	created_at: str | None = None
	# Reliability weight for the source-tier-weighted average. 1.0 for social
	# posts; for news it is the publisher's tier weight (tier-1 highest).
	weight: float = 1.0


def _normalize_tickers(tickers: list[str]) -> list[str]:
	return sorted({ticker.upper().strip() for ticker in tickers if ticker and ticker.strip()})


def _api_symbol(ticker: str) -> str:
	"""Map a yfinance/DB-style ticker to the form StockTwits and Finnhub expect.

	Share classes use a hyphen in yfinance (e.g. ``BRK-B``, ``BF-B``) but a dot on
	those APIs (``BRK.B``). Results stay keyed by the original DB ticker so the
	rest of the pipeline (quant, persistence) matches up."""
	return ticker.upper().replace("-", ".")


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


def _engagement_priority(mention: SocialMention) -> Any:
	"""GCP prioritization for social posts: most-engaged first."""
	return mention.engagement


def _recency_priority(mention: SocialMention) -> Any:
	"""GCP prioritization for news articles: spend the metered GCP budget on the
	most reliable sources first (higher tier weight), then most-recent. ISO-8601
	timestamps sort lexicographically in chronological order."""
	return (mention.weight, mention.created_at or "")


def _score_mentions(
	mentions: list[SocialMention],
	gcp_priority=_engagement_priority,
) -> dict[str, Any]:
	if not mentions:
		return {
			"sentiment_score": 50,
			"bullish_posts": 0,
			"bearish_posts": 0,
			"top_posts": [],
			"scored": [],
			"mention_count": 0,
		}

	scored_mentions: list[dict[str, Any]] = []
	bullish_posts = 0
	bearish_posts = 0

	# Only the highest-priority posts get the (metered) GCP NLP signal; the rest
	# are scored with VADER alone to respect the GCP monthly unit budget.
	gcp_indices = {
		idx
		for idx, _ in sorted(
			enumerate(mentions), key=lambda pair: gcp_priority(pair[1]), reverse=True
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
				"weight": mention.weight,
				"created_at": mention.created_at,
				"tier": _source_tier(mention.source),
				"sentiment_raw": round(signed_score, 4),
				"sentiment_contribution": round((signed_score + 1) * 50, 2),
			}
		)

	# Source-tier-weighted mean: a tier-1 article pulls the score more than a
	# tier-2/3 one. With all weights equal (e.g. social posts) this reduces to a
	# plain average.
	total_weight = sum(max(0.0, item["weight"]) for item in scored_mentions)
	if total_weight > 0:
		average_signed = sum(item["sentiment_raw"] * max(0.0, item["weight"]) for item in scored_mentions) / total_weight
	else:
		average_signed = sum(item["sentiment_raw"] for item in scored_mentions) / len(scored_mentions)
	sentiment_score = int(round(max(0.0, min(1.0, (average_signed + 1.0) / 2.0)) * 100))

	# Surface the most decisive posts, favoring stronger sentiment from more
	# reliable sources.
	top_posts = sorted(
		scored_mentions,
		key=lambda item: abs(item["sentiment_raw"]) * max(0.0, item["weight"]),
		reverse=True,
	)[:3]

	return {
		"sentiment_score": sentiment_score,
		"bullish_posts": bullish_posts,
		"bearish_posts": bearish_posts,
		"top_posts": top_posts,
		"scored": scored_mentions,
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
			for msg in messages:
				# Validate at the ingestion boundary: malformed messages are
				# rejected (dropped), anomalous ones are kept but flagged.
				validated = parse_stocktwits_message(msg)
				if validated is None:
					continue

				body_upper = validated.body.upper()
				if validated.symbols and api_sym not in validated.symbols and api_sym not in body_upper and f"${api_sym}" not in body_upper:
					continue

				results[sym].append(
					SocialMention(
						ticker=sym,
						text=validated.body,
						source=f"stocktwits:{validated.username or ''}",
						url=validated.url,
						engagement=validated.likes + validated.retweets,
						created_at=validated.created_at.isoformat() if validated.created_at else None,
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


def _collect_finnhub_news(tickers: list[str], limit: int = 30) -> dict[str, list[SocialMention]]:
	"""Collect recent company news from trusted financial publishers via Finnhub.

	Returns articles as ``SocialMention`` (the shared scoring unit): ``text`` is
	headline + summary, ``source`` is ``finnhub:<publisher>``. Non-trusted
	publishers are dropped so only reputable financial reporting feeds the score.
	Returns empty lists if ``requests`` or ``FINNHUB_API_KEY`` are unavailable.
	"""
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

				results[sym].append(
					SocialMention(
						ticker=sym,
						text=text,
						source=f"finnhub:{effective_source}",
						url=article.url,
						engagement=0,
						created_at=article.created_at.isoformat() if article.created_at else None,
						weight=_tier_weight(tier),
					)
				)
				if len(results[sym]) >= limit:
					break
		except Exception:
			continue

	return results


def collect_news(tickers: list[str]) -> dict[str, list[SocialMention]]:
	normalized_tickers = _normalize_tickers(tickers)
	try:
		return _collect_finnhub_news(normalized_tickers)
	except NameError:
		return {ticker: [] for ticker in normalized_tickers}


def _blend_sentiment(news: dict[str, Any], social: dict[str, Any]) -> int:
	"""Weighted blend of the news and social sub-scores (news weighted higher).

	Falls back to whichever source has data when the other is empty, and to a
	neutral 50 when neither source produced any items.
	"""
	news_count = news["mention_count"]
	social_count = social["mention_count"]

	if news_count == 0 and social_count == 0:
		return 50
	if news_count == 0:
		return social["sentiment_score"]
	if social_count == 0:
		return news["sentiment_score"]

	blended = NEWS_WEIGHT * news["sentiment_score"] + SOCIAL_WEIGHT * social["sentiment_score"]
	return int(round(blended))


def _tier_counts(news_mentions: list[SocialMention]) -> dict[str, int]:
	"""Count news articles per reliability tier, keyed ``tier1``/``tier2``/``tier3``."""
	counts = {"tier1": 0, "tier2": 0, "tier3": 0}
	for mention in news_mentions:
		tier = _source_tier(mention.source)
		if tier is not None:
			counts[f"tier{tier}"] += 1
	return counts


def _news_articles_payload(scored_news: list[dict[str, Any]]) -> list[dict[str, Any]]:
	"""Build a compact, per-article transparency list from the scored news items:
	publisher, reliability tier, publish date, headline, link, and the article's
	own sentiment. Ordered most-recent first so the user can see when each is from."""
	articles: list[dict[str, Any]] = []
	for item in sorted(scored_news, key=lambda it: it.get("created_at") or "", reverse=True):
		raw = item["sentiment_raw"]
		label = "Positive" if raw >= 0.05 else "Negative" if raw <= -0.05 else "Neutral"
		# News text is "headline. summary"; show the headline only, trimmed.
		headline = item["text"].split(". ", 1)[0].strip()
		if len(headline) > 160:
			headline = headline[:157].rstrip() + "…"
		articles.append(
			{
				# Strip the "finnhub:" prefix to show the publisher name.
				"source": item["source"].split(":", 1)[-1],
				"tier": item.get("tier"),
				"date": (item.get("created_at") or "")[:10],  # YYYY-MM-DD
				"headline": headline,
				"url": item.get("url"),
				"sentiment": label,
				"sentiment_score": item["sentiment_contribution"],  # 0-100
			}
		)
	return articles


def _combine_signals(ticker: str, social_mentions: list[SocialMention], news_mentions: list[SocialMention]) -> dict[str, Any]:
	"""Score the news and social signals separately and blend them into the
	unified sentiment payload for one ticker."""
	social = _score_mentions(social_mentions, gcp_priority=_engagement_priority)
	news = _score_mentions(news_mentions, gcp_priority=_recency_priority)

	return {
		"ticker": ticker,
		# Unified, news-weighted score consumed downstream.
		"sentiment_score": _blend_sentiment(news, social),
		"news_weight": round(NEWS_WEIGHT, 2),
		"social_weight": round(SOCIAL_WEIGHT, 2),
		# Social sub-signal (kept under the original keys for backward compat).
		"social_sentiment_score": social["sentiment_score"],
		"bullish_posts": social["bullish_posts"],
		"bearish_posts": social["bearish_posts"],
		"top_posts": social["top_posts"],
		"mention_count": social["mention_count"],
		# News sub-signal.
		"news_sentiment_score": news["sentiment_score"],
		"news_bullish": news["bullish_posts"],
		"news_bearish": news["bearish_posts"],
		"top_news": news["top_posts"],
		"news_count": news["mention_count"],
		# Article count per reliability tier (1 = highest), for transparency.
		"news_tier_counts": _tier_counts(news_mentions),
		# Per-article transparency list (publisher, tier, date, headline, link).
		"news_articles": _news_articles_payload(news.get("scored", [])),
		"sources": {
			"stocktwits": sum(1 for m in social_mentions if m.source.startswith("stocktwits:")),
			"finnhub": sum(1 for m in news_mentions if m.source.startswith("finnhub:")),
		},
	}


def analyze_ticker(ticker: str) -> dict[str, Any]:
	sym = ticker.upper()
	social_mentions = collect_mentions([sym]).get(sym, [])
	news_mentions = collect_news([sym]).get(sym, [])
	return _combine_signals(sym, social_mentions, news_mentions)


def analyze_tickers(tickers: list[str]) -> dict[str, dict[str, Any]]:
	normalized_tickers = _normalize_tickers(tickers)
	mentions_by_ticker = collect_mentions(normalized_tickers)
	news_by_ticker = collect_news(normalized_tickers)

	results: dict[str, dict[str, Any]] = {}
	for ticker in normalized_tickers:
		results[ticker] = _combine_signals(
			ticker,
			mentions_by_ticker.get(ticker, []),
			news_by_ticker.get(ticker, []),
		)

	return results