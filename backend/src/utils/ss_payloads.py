"""Sentiment scout: per-item transparency payloads for the frontend.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .ss_aggregation import SentimentAggregator
from .ss_sources import PublisherRegistry


class PayloadBuilder(ABC):
	"""Turns scored mentions into the per-item list the frontend renders."""

	NEUTRAL_BAND = 0.05

	def __init__(self, aggregator: SentimentAggregator | None = None, registry: PublisherRegistry | None = None):
		self.registry = registry or PublisherRegistry()
		self.aggregator = aggregator or SentimentAggregator(registry=self.registry)

	@abstractmethod
	def _item(self, item: dict[str, Any], influence: float) -> dict[str, Any]:
		"""Build one payload entry from a scored mention and its influence share."""

	def build(self, scored: list[dict[str, Any]]) -> list[dict[str, Any]]:
		weights = self.aggregator.influence_weights(scored)
		newest_first = sorted(scored, key=lambda it: it.get("created_at") or "", reverse=True)
		return [
			self._item(item, round(weights.get(id(item), 0.0) * 100, 1))
			for item in newest_first
		]

	@classmethod
	def label(cls, raw: float) -> str:
		if raw >= cls.NEUTRAL_BAND:
			return "Positive"
		if raw <= -cls.NEUTRAL_BAND:
			return "Negative"
		return "Neutral"

	@staticmethod
	def truncate(text: str, limit: int) -> str:
		if len(text) > limit:
			return text[: limit - 3].rstrip() + "…"
		return text


class NewsPayloadBuilder(PayloadBuilder):
	"""One entry per article: publisher, tier, date, headline, link."""

	HEADLINE_LIMIT = 160

	def _item(self, item: dict[str, Any], influence: float) -> dict[str, Any]:
		headline = (item.get("headline") or item["text"].split(". ", 1)[0]).strip()
		return {
			"source": item["source"].split(":", 1)[-1],
			"tier": item.get("tier"),
			"date": (item.get("created_at") or "")[:10],  # YYYY-MM-DD
			"headline": self.truncate(headline, self.HEADLINE_LIMIT),
			"url": item.get("url"),
			"sentiment": self.label(item["sentiment_raw"]),
			"sentiment_score": item["sentiment_contribution"],  # 0-100
			"influence": influence,  # % of the news score
		}


class SocialPayloadBuilder(PayloadBuilder):
	"""One entry per post: platform, author, date, text, engagement counts."""

	TEXT_LIMIT = 240

	def _item(self, item: dict[str, Any], influence: float) -> dict[str, Any]:
		# source is "stocktwits:<username>"; split into platform + author.
		platform, _, author = item["source"].partition(":")
		text = (item.get("text") or "").strip()
		return {
			"platform": platform or "stocktwits",
			"author": author or None,
			"date": (item.get("created_at") or "")[:10],  # YYYY-MM-DD
			"text": self.truncate(text, self.TEXT_LIMIT),
			"url": item.get("url"),
			# Engagement counts shown next to each post.
			"likes": item.get("likes") or 0,
			"reshares": item.get("reshares") or 0,
			"replies": item.get("replies") or 0,
			"sentiment": self.label(item["sentiment_raw"]),
			"sentiment_score": item["sentiment_contribution"],  # 0-100
			"influence": influence,  # % of the social score
		}
