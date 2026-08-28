"""Sentiment scout: turning text into a signed sentiment score.

Two models run over the same cleaned text. VADER is free and scores everything;
the GCP NLP call is metered, so only the highest-priority mentions per source get
it and the rest stay VADER-only.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from typing import Any

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

	def score_many(self, texts: list[str]) -> dict[str, float | None]:
		"""Score independent texts, keyed by text. One at a time by default, which
		is right for a local model; a model that waits on a network overrides this."""
		return {text: self.score(text) for text in dict.fromkeys(texts)}


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

	def __init__(self, max_workers: int = 10):
		self.max_workers = max(1, max_workers)

	def score(self, text: str) -> float | None:
		# Imported on call, not at module load: ``agents`` imports the scout, which
		# imports this module, so a top-level import here makes utils unimportable
		# unless agents happens to be loaded first.
		from ..agents.gcp_nlp import score_with_gcp

		return score_with_gcp(text)

	def score_many(self, texts: list[str]) -> dict[str, float | None]:
		"""Every call here is a blocking HTTPS round trip and none of them depend on
		another, so they go out together: the wait is one round trip, not one per
		text"""
		unique = [text for text in dict.fromkeys(texts) if text]
		if not unique:
			return {}
		if len(unique) == 1:
			return {unique[0]: self.score(unique[0])}
		with ThreadPoolExecutor(max_workers=min(len(unique), self.max_workers)) as pool:
			return dict(zip(unique, pool.map(self.score, unique)))


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
		self.gcp = gcp or GcpNlpModel(self.config.gcp_max_workers)

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

	def mention_sentiment(
		self,
		text: str,
		use_gcp: bool = False,
		gcp_scores: dict[str, float | None] | None = None,
	) -> float:
		cleaned = self.clean_text(text)
		vader_score = self.vader.score(cleaned)
		if vader_score is None:
			vader_score = 0.0
		gcp_score = None
		if use_gcp:
			# A prefetched map means the calls already went out together upstream.
			# A miss reads as None, which is the same fallback an unavailable API
			# gets: VADER alone.
			gcp_score = (
				gcp_scores.get(cleaned) if gcp_scores is not None else self.gcp.score(cleaned)
			)
		return self.combine_scores(vader_score, gcp_score)

	def signed_score(
		self,
		mention: SocialMention,
		use_gcp: bool = False,
		gcp_scores: dict[str, float | None] | None = None,
	) -> float:
		"""The signed score for one mention, in [-1, 1].

		Public because history scores posts one at a time on ingest, rather than a
		whole run's worth at once through ``score``.
		"""
		if mention.declared_sentiment == "Bullish":
			return self.DECLARED_SENTIMENT_SIGNED
		if mention.declared_sentiment == "Bearish":
			return -self.DECLARED_SENTIMENT_SIGNED
		return self.mention_sentiment(mention.text, use_gcp=use_gcp, gcp_scores=gcp_scores)

	def _gcp_indices(self, mentions: list[SocialMention], priority: MentionPriority) -> set[int]:
		"""Indices of the top-N mentions that also get the metered GCP signal."""
		return {
			idx
			for idx, _ in sorted(
				enumerate(mentions), key=lambda pair: priority.key(pair[1]), reverse=True
			)[: self.config.gcp_top_n]
		}

	def _prefetch_gcp(
		self, mentions: list[SocialMention], indices: set[int]
	) -> dict[str, float | None]:
		"""
		A mention whose author declared their own Bullish/Bearish tag never reaches
		a model, so spending a unit on it would buy nothing: those are left out.
		"""
		texts = [
			self.clean_text(mentions[idx].text)
			for idx in sorted(indices)
			if mentions[idx].declared_sentiment not in ("Bullish", "Bearish")
		]
		return self.gcp.score_many([text for text in texts if text])

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
		gcp_scores = self._prefetch_gcp(mentions, gcp_indices)

		for index, mention in enumerate(mentions):
			signed_score = self.signed_score(
				mention, use_gcp=index in gcp_indices, gcp_scores=gcp_scores
			)
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
