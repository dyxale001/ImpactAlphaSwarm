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

``SentimentScout`` is the facade. It owns the collaborators that do the work, each
of which lives in ``src/utils`` and can be swapped at construction time:

    SentimentConfig      every tunable setting, read from the environment
    PublisherRegistry    publisher trust tiers and source attribution
    NewsCollector        Finnhub + Marketaux, behind a per-run caching strategy
    SocialCollector      StockTwits
    MentionScorer        text -> signed sentiment (VADER + GCP), rolled up
    SentimentAggregator  recency decay, cross-tier blend, influence, news/social blend
    PayloadBuilder       per-item transparency payloads for the frontend
"""

from __future__ import annotations

import logging
import warnings
from typing import Any

warnings.filterwarnings("ignore")

from ..utils.ss_aggregation import SentimentAggregator
from ..utils.ss_config import SentimentConfig
from ..utils.ss_models import SocialMention, _normalize_tickers
from ..utils.ss_news import NewsCollector, NewsMode, collect_news
from ..utils.ss_payloads import NewsPayloadBuilder, SocialPayloadBuilder
from ..utils.ss_scoring import EngagementPriority, MentionScorer, RecencyPriority
from ..utils.ss_social import SocialCollector, collect_mentions
from ..utils.ss_sources import PublisherRegistry

logger = logging.getLogger("sentiment-scout")

__all__ = [
	"NewsMode",
	"SentimentScout",
	"SocialMention",
	"analyze_ticker",
	"analyze_tickers",
	"collect_mentions",
	"collect_news",
]


class SentimentScout:
	"""Collects, scores and blends the sentiment signals for a set of tickers.

	Every collaborator is optional and defaults to the standard implementation, so
	``SentimentScout()`` is the production configuration and any single piece can be
	replaced without touching the rest.
	"""

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		news_collector: NewsCollector | None = None,
		social_collector: SocialCollector | None = None,
		scorer: MentionScorer | None = None,
		aggregator: SentimentAggregator | None = None,
		news_payload: NewsPayloadBuilder | None = None,
		social_payload: SocialPayloadBuilder | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.aggregator = aggregator or SentimentAggregator(self.config, self.registry)
		self.news_collector = news_collector or NewsCollector(self.config, self.registry)
		self.social_collector = social_collector or SocialCollector(self.config, self.registry)
		self.scorer = scorer or MentionScorer(self.config, self.registry, self.aggregator)
		self.news_payload = news_payload or NewsPayloadBuilder(self.aggregator, self.registry)
		self.social_payload = social_payload or SocialPayloadBuilder(self.aggregator, self.registry)

		self.news_priority = RecencyPriority()
		self.social_priority = EngagementPriority()

	def _combine_signals(
		self,
		ticker: str,
		social_mentions: list[SocialMention],
		news_mentions: list[SocialMention],
	) -> dict[str, Any]:
		"""Score the news and social signals separately and blend them into the
		unified sentiment payload for one ticker."""
		social = self.scorer.score(social_mentions, self.social_priority)
		news = self.scorer.score(news_mentions, self.news_priority)

		return {
			"ticker": ticker,
			# Unified, news-weighted score consumed downstream.
			"sentiment_score": self.aggregator.blend(news, social),
			"news_weight": round(self.config.news_weight, 2),
			"social_weight": round(self.config.social_weight, 2),
			# Social sub-signal (kept under the original keys for backward compat).
			"social_sentiment_score": social["sentiment_score"],
			"bullish_posts": social["bullish_posts"],
			"bearish_posts": social["bearish_posts"],
			"top_posts": social["top_posts"],
			"mention_count": social["mention_count"],
			# Per-post transparency list (author, date, text, link, sentiment).
			"social_posts": self.social_payload.build(social.get("scored", [])),
			# News sub-signal.
			"news_sentiment_score": news["sentiment_score"],
			"news_bullish": news["bullish_posts"],
			"news_bearish": news["bearish_posts"],
			"top_news": news["top_posts"],
			"news_count": news["mention_count"],
			# Article count per reliability tier (1 = highest), for transparency.
			"news_tier_counts": self.registry.tier_counts(news_mentions),
			# Per-article transparency list (publisher, tier, date, headline, link).
			"news_articles": self.news_payload.build(news.get("scored", [])),
			"sources": {
				"stocktwits": sum(1 for m in social_mentions if m.source.startswith("stocktwits:")),
				"finnhub": sum(1 for m in news_mentions if m.source.startswith("finnhub:")),
				"marketaux": sum(1 for m in news_mentions if m.source.startswith("marketaux:")),
			},
		}

	def analyze_ticker(self, ticker: str, marketaux: NewsMode | str = NewsMode.OFF) -> dict[str, Any]:
		sym = ticker.upper()
		social_mentions = self.social_collector.collect([sym]).get(sym, [])
		news_mentions = self.news_collector.collect([sym], marketaux).get(sym, [])
		return self._combine_signals(sym, social_mentions, news_mentions)

	def analyze_tickers(
		self, tickers: list[str], marketaux: NewsMode | str = NewsMode.OFF
	) -> dict[str, dict[str, Any]]:
		normalized_tickers = _normalize_tickers(tickers)
		mentions_by_ticker = self.social_collector.collect(normalized_tickers)
		news_by_ticker = self.news_collector.collect(normalized_tickers, marketaux)

		results: dict[str, dict[str, Any]] = {}
		for ticker in normalized_tickers:
			results[ticker] = self._combine_signals(
				ticker,
				mentions_by_ticker.get(ticker, []),
				news_by_ticker.get(ticker, []),
			)

		return results


def analyze_ticker(ticker: str, marketaux: str = "off") -> dict[str, Any]:
	"""Analyze one ticker with the default scout configuration."""
	return SentimentScout().analyze_ticker(ticker, marketaux)


def analyze_tickers(tickers: list[str], marketaux: str = "off") -> dict[str, dict[str, Any]]:
	"""Analyze a set of tickers with the default scout configuration.

	This is the orchestrator's entry point; ``marketaux`` selects the caching
	strategy ("off" standalone, "fetch" nightly batch, "cache" user refresh).
	"""
	return SentimentScout().analyze_tickers(tickers, marketaux)
