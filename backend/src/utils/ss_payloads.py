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
	"""One entry per article: publisher, tier, date, headline, summary, link."""

	HEADLINE_LIMIT = 160
	#: Finnhub summaries run to about 150 characters typically and 600 at most. 300 keeps
	#: the first sentence or two of the long ones, which is where the substance is, while
	#: holding a stored day row's growth to a few hundred bytes per article.
	SUMMARY_LIMIT = 300

	def _item(self, item: dict[str, Any], influence: float) -> dict[str, Any]:
		headline = (item.get("headline") or item["text"].split(". ", 1)[0]).strip()
		summary = self.summary_of(item)
		return {
			"source": item["source"].split(":", 1)[-1],
			"tier": item.get("tier"),
			"date": (item.get("created_at") or "")[:10],  # YYYY-MM-DD
			"headline": self.truncate(headline, self.HEADLINE_LIMIT),
			"summary": self.truncate(summary, self.SUMMARY_LIMIT) if summary else None,
			"url": item.get("url"),
			"sentiment": self.label(item["sentiment_raw"]),
			"sentiment_score": item["sentiment_contribution"],  # 0-100
			"influence": influence,  # % of the news score
		}

	@staticmethod
	def summary_of(item: dict[str, Any]) -> str | None:
		"""The provider's own summary of the article, or None when it has none.

		Recovered from ``text`` rather than carried as a field of its own. Both providers
		build ``text`` as the headline, a full stop, then the summary (Finnhub's
		``summary``, Marketaux's ``description``), and ``text`` already survives the
		cache, scoring and the day rows, so reading it back here covers every article
		without changing the mention model or the cache format. When ``text`` does not
		start with the headline there is no telling where the summary begins, so none is
		claimed rather than a guess.

		The summary comes back without its final full stop, because the providers strip
		trailing full stops when they build ``text``. It is not put back: many Finnhub
		summaries are cut off mid word by Finnhub itself, and a full stop added to one of
		those would be wrong.
		"""
		text = (item.get("text") or "").strip()
		headline = (item.get("headline") or "").strip()
		if not text or not headline or not text.startswith(headline):
			return None
		summary = text[len(headline):].lstrip(". ").strip()
		return summary or None


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
