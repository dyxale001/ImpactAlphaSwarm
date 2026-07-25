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

This module is the orchestration layer only. The pieces live in ``src/utils``:

    ss_models       SocialMention, the shape every source normalizes into
    ss_sources      publisher trust tiers and source attribution
    ss_scoring      text -> signed sentiment (VADER + GCP), and _score_mentions
    ss_aggregation  recency decay, cross-tier blend, influence, news/social blend
    ss_news         Finnhub + Marketaux collection and the Marketaux cache
    ss_social       StockTwits collection
    ss_payloads     per-item transparency payloads for the frontend

Names are re-exported below so existing imports of this module keep working.
"""

from __future__ import annotations

import logging
import warnings
from typing import Any

warnings.filterwarnings("ignore")

from ..utils.ss_aggregation import (
	NEWS_RECENCY_HALFLIFE_DAYS,
	NEWS_WEIGHT,
	SOCIAL_WEIGHT,
	_aggregate_signed,
	_blend_sentiment,
	_influence_weights,
	_recency_weight,
	_recency_weighted_avg,
)
from ..utils.ss_models import SocialMention, _api_symbol, _normalize_tickers
from ..utils.ss_news import (
	FINNHUB_NEWS_URL,
	MARKETAUX_CACHE_MAX_AGE_HOURS,
	MARKETAUX_LIMIT_PER_TICKER,
	MARKETAUX_MAX_PAGES,
	MARKETAUX_NEWS_URL,
	NEWS_LOOKBACK_DAYS,
	_collect_finnhub_news,
	_collect_marketaux_news,
	_load_marketaux_cache,
	_news_dedup_key,
	_save_marketaux_cache,
	collect_news,
)
from ..utils.ss_payloads import (
	_news_articles_payload,
	_social_posts_payload,
	_tier_counts,
)
from ..utils.ss_scoring import (
	DECLARED_SENTIMENT_SIGNED,
	GCP_TOP_N,
	_clean_text,
	_combine_scores,
	_engagement_priority,
	_get_vader_analyzer,
	_mention_sentiment,
	_recency_priority,
	_score_mentions,
	_score_with_vader,
)
from ..utils.ss_social import _collect_stocktwits_mentions, collect_mentions
from ..utils.ss_sources import (
	_effective_source,
	_source_tier,
	_tier1_publisher,
	_tier_share,
	_tier_sources,
	_tier_weight,
)

logger = logging.getLogger("sentiment-scout")

__all__ = [
	"SocialMention",
	"analyze_ticker",
	"analyze_tickers",
	"collect_mentions",
	"collect_news",
]


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
		# Per-post transparency list (author, date, text, link, sentiment).
		"social_posts": _social_posts_payload(social.get("scored", [])),
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
			"marketaux": sum(1 for m in news_mentions if m.source.startswith("marketaux:")),
		},
	}


def analyze_ticker(ticker: str, marketaux: str = "off") -> dict[str, Any]:
	sym = ticker.upper()
	social_mentions = collect_mentions([sym]).get(sym, [])
	news_mentions = collect_news([sym], marketaux=marketaux).get(sym, [])
	return _combine_signals(sym, social_mentions, news_mentions)


def analyze_tickers(tickers: list[str], marketaux: str = "off") -> dict[str, dict[str, Any]]:
	normalized_tickers = _normalize_tickers(tickers)
	mentions_by_ticker = collect_mentions(normalized_tickers)
	news_by_ticker = collect_news(normalized_tickers, marketaux=marketaux)

	results: dict[str, dict[str, Any]] = {}
	for ticker in normalized_tickers:
		results[ticker] = _combine_signals(
			ticker,
			mentions_by_ticker.get(ticker, []),
			news_by_ticker.get(ticker, []),
		)

	return results
