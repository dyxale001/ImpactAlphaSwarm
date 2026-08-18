"""Sentiment scout: turning text into a signed sentiment score.

Two models run over the same cleaned text. VADER is free and scores everything;
the GCP NLP call is metered, so only the highest-priority mentions per source get
it and the rest stay VADER-only. Which mentions count as highest-priority differs
by source, so that choice is a strategy object: news ranks by recency, social by
engagement.

Where a StockTwits author has tagged their own post Bullish/Bearish, that declared
label wins over both models, because a self-tag reads slang, sarcasm and emoji
better than a lexicon does.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from typing import Any

from ..agents.gcp_nlp import score_with_gcp
from .ss_aggregation import SentimentAggregator
from .ss_config import SentimentConfig
from .ss_models import SocialMention
from .ss_sources import PublisherRegistry

try:
	from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except ImportError:
	SentimentIntensityAnalyzer = None


class SentimentModel(ABC):
	"""A model that turns cleaned text into a signed score in [-1, 1]."""

	@abstractmethod
	def score(self, text: str) -> float | None:
		"""Return the signed score, or ``None`` when this model has no opinion."""


class VaderModel(SentimentModel):
	"""Free lexicon scorer. Runs over every mention."""

	def __init__(self) -> None:
		self._analyzer = None
		self._built = False

	def _get_analyzer(self):
		# Built once per instance, on first use, so importing the module stays cheap
		# and a missing vaderSentiment install degrades instead of raising.
		if not self._built:
			self._analyzer = None if SentimentIntensityAnalyzer is None else SentimentIntensityAnalyzer()
			self._built = True
		return self._analyzer

	def score(self, text: str) -> float | None:
		analyzer = self._get_analyzer()
		if analyzer is None:
			return 0.0
		return float(analyzer.polarity_scores(text)["compound"])


class GcpNlpModel(SentimentModel):
	"""Metered Google Cloud NLP scorer. Returns ``None`` when unavailable or when
	the monthly unit budget is exhausted; the budget guard and response cache live
	in ``agents.gcp_nlp``."""

	def score(self, text: str) -> float | None:
		return score_with_gcp(text)


class MentionPriority(ABC):
	"""Decides which mentions are worth spending a metered GCP call on."""

	@abstractmethod
	def key(self, mention: SocialMention) -> Any:
		"""Sort key; higher sorts first."""


class EngagementPriority(MentionPriority):
	"""Social posts: the most engaged-with take is the most worth scoring well."""

	def key(self, mention: SocialMention) -> Any:
		return mention.engagement


class RecencyPriority(MentionPriority):
	"""News: the most reliable, most recent article is the one to spend a call on."""

	def key(self, mention: SocialMention) -> Any:
		return (mention.weight, mention.created_at or "")


class MentionScorer:
	"""Scores a list of mentions and rolls them up into one sub-signal."""
	DECLARED_SENTIMENT_SIGNED = 0.6
	BULLISH_THRESHOLD = 0.05

	def __init__(
		self,
		config: SentimentConfig | None = None,
		registry: PublisherRegistry | None = None,
		aggregator: SentimentAggregator | None = None,
		vader: SentimentModel | None = None,
		gcp: SentimentModel | None = None,
	):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()
		self.aggregator = aggregator or SentimentAggregator(self.config, self.registry)
		self.vader = vader or VaderModel()
		self.gcp = gcp or GcpNlpModel()

	@staticmethod
	def clean_text(text: str) -> str:
		text = re.sub(r"https?://\S+", " ", text)
		text = re.sub(r"\$[A-Za-z][A-Za-z0-9_.-]*", " ", text)
		text = re.sub(r"[^\w\s'.-]", " ", text)
		text = re.sub(r"\s+", " ", text).strip()
		return text

	@staticmethod
	def combine_scores(vader_score: float, gcp_score: float | None) -> float:
		if gcp_score is None:
			return vader_score
		return 0.5 * vader_score + 0.5 * gcp_score

	def mention_sentiment(self, text: str, use_gcp: bool = False) -> float:
		cleaned = self.clean_text(text)
		vader_score = self.vader.score(cleaned)
		if vader_score is None:
			vader_score = 0.0
		gcp_score = self.gcp.score(cleaned) if use_gcp else None
		return self.combine_scores(vader_score, gcp_score)

	def _signed_score(self, mention: SocialMention, use_gcp: bool) -> float:
		if mention.declared_sentiment == "Bullish":
			return self.DECLARED_SENTIMENT_SIGNED
		if mention.declared_sentiment == "Bearish":
			return -self.DECLARED_SENTIMENT_SIGNED
		return self.mention_sentiment(mention.text, use_gcp=use_gcp)

	def _gcp_indices(self, mentions: list[SocialMention], priority: MentionPriority) -> set[int]:
		"""Indices of the top-N mentions that also get the metered GCP signal."""
		return {
			idx
			for idx, _ in sorted(
				enumerate(mentions), key=lambda pair: priority.key(pair[1]), reverse=True
			)[: self.config.gcp_top_n]
		}

	def score(self, mentions: list[SocialMention], priority: MentionPriority) -> dict[str, Any]:
		"""Score every mention and aggregate them into one sub-signal."""
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

		gcp_indices = self._gcp_indices(mentions, priority)

		for index, mention in enumerate(mentions):
			signed_score = self._signed_score(mention, use_gcp=index in gcp_indices)
			if signed_score >= self.BULLISH_THRESHOLD:
				bullish_posts += 1
			elif signed_score <= -self.BULLISH_THRESHOLD:
				bearish_posts += 1

			scored_mentions.append(
				{
					"text": mention.text,
					"headline": mention.headline,
					"source": mention.source,
					"url": mention.url,
					"engagement": mention.engagement,
					"likes": mention.likes,
					"reshares": mention.reshares,
					"replies": mention.replies,
					"weight": mention.weight,
					"created_at": mention.created_at,
					"tier": self.registry.tier_of(mention.source),
					"sentiment_raw": round(signed_score, 4),
					"sentiment_contribution": round((signed_score + 1) * 50, 2),
				}
			)
		average_signed = self.aggregator.aggregate_signed(scored_mentions)
		sentiment_score = int(round(max(0.0, min(1.0, (average_signed + 1.0) / 2.0)) * 100))

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
