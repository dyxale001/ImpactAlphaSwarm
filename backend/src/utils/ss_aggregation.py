"""Sentiment scout: rolling per-item sentiment up into one score.

Two independent dimensions decide how much a single article moves the number:

  * Reliability (tier) works ACROSS tiers. Each tier contributes its own average
    at a fixed share, so a tier's influence does not depend on how many articles
    it has, and a handful of tier-1 wires are not drowned by a flood of tier-3.
  * Recency works WITHIN a tier. Newer articles of the same tier count for more,
    on an exponential half-life.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .ss_config import SentimentConfig
from .ss_sources import PublisherRegistry


class SentimentAggregator:
	"""Turns a list of scored mentions into a single signed score, and works out
	how much each individual item contributed to it."""

	def __init__(self, config: SentimentConfig | None = None, registry: PublisherRegistry | None = None):
		self.config = config or SentimentConfig.from_env()
		self.registry = registry or PublisherRegistry()

	def recency_weight(self, created_at: str | None) -> float:
		"""Exponential time-decay weight for an article by age: a newer article counts
		more than an older one of the SAME tier. Half-life is
		``config.news_recency_halflife_days``. Articles with a missing/unparseable
		timestamp (or dated now/future) get 1.0."""
		if not created_at:
			return 1.0
		try:
			published = datetime.fromisoformat(created_at)
		except (TypeError, ValueError):
			return 1.0
		if published.tzinfo is None:
			published = published.replace(tzinfo=timezone.utc)
		age_days = (datetime.now(timezone.utc) - published).total_seconds() / 86400.0
		if age_days <= 0:
			return 1.0
		half_life = max(0.1, self.config.news_recency_halflife_days)
		return 0.5 ** (age_days / half_life)

	@staticmethod
	def weighted_average(pairs: list[tuple[float, float]]) -> float:
		"""Recency-weighted mean of (sentiment, recency_weight) pairs."""
		total_weight = sum(weight for _, weight in pairs)
		if total_weight > 0:
			return sum(sentiment * weight for sentiment, weight in pairs) / total_weight
		return sum(sentiment for sentiment, _ in pairs) / len(pairs)

	def _group_by_tier(
		self, scored: list[dict[str, Any]], key
	) -> tuple[dict[int, list[tuple[Any, float]]], list[tuple[Any, float]]]:
		"""Split scored items into per-tier buckets and an untiered bucket, pairing
		each with its weight. ``key`` picks what is stored alongside the weight, so
		``aggregate_signed`` can carry the sentiment and ``influence_weights`` the
		item identity, off one shared traversal."""
		by_tier: dict[int, list[tuple[Any, float]]] = {1: [], 2: [], 3: []}
		untiered: list[tuple[Any, float]] = []
		for item in scored:
			recency = self.recency_weight(item.get("created_at"))
			tier = item.get("tier")
			if tier in (1, 2, 3):
				# Tiered (news): reliability is handled by the cross-tier shares, so
				# the per-item weight is recency only.
				by_tier[tier].append((key(item), recency))
			else:
				# Untiered (social): fold the post's engagement weight into recency,
				# so a liked/reshared take pulls the average harder than an ignored one.
				engagement = max(0.0, item.get("weight", 1.0))
				untiered.append((key(item), recency * engagement))
		return by_tier, untiered

	def aggregate_signed(self, scored_mentions: list[dict[str, Any]]) -> float:
		"""Aggregate per-article signed sentiment into one signed score in [-1, 1].

		Two independent dimensions:
		  * Reliability (tier) -- the CROSS-tier structure: each tier contributes its
		    own average at a fixed share (tier-1 highest), renormalized over the tiers
		    present. A tier's influence is independent of its article COUNT, so a few
		    tier-1 wires carry their full share against a flood of tier-2/3 articles.
		  * Recency -- ordering WITHIN a tier: each tier's average is recency-weighted
		    (newer articles of the same tier count more).

		Because recency lives inside the tier average and never across tiers, older
		tier-1 wires still outweigh newer, more numerous tier-3 articles. Items with no
		tier (social posts) fall back to a recency-weighted average of all items."""
		by_tier, untiered = self._group_by_tier(scored_mentions, lambda item: item["sentiment_raw"])

		numerator = 0.0
		denominator = 0.0
		for tier in (1, 2, 3):
			group = by_tier[tier]
			if group:
				share = self.registry.share_of(tier)
				numerator += share * self.weighted_average(group)
				denominator += share

		if denominator > 0:
			return numerator / denominator
		# No tiered items (e.g. social posts): recency-weighted average.
		if untiered:
			return self.weighted_average(untiered)
		return 0.0

	def influence_weights(self, scored: list[dict[str, Any]]) -> dict[int, float]:
		"""Per-item share of the rolled-up score, keyed by ``id(item)``.

		Keying on object identity is load-bearing: the caller looks each scored dict
		back up by ``id()`` when building its payload. It survives here because a
		scored item is a plain dict with no natural key. Giving scored mentions their
		own class with an ``influence`` attribute would remove the indirection, but
		that is a wider change than this refactor took on.
		"""
		by_tier, untiered = self._group_by_tier(scored, id)

		weights: dict[int, float] = {}
		denominator = sum(self.registry.share_of(t) for t in (1, 2, 3) if by_tier[t])
		if denominator > 0:
			for tier in (1, 2, 3):
				group = by_tier[tier]
				if not group:
					continue
				total_rw = sum(rw for _, rw in group)
				share = self.registry.share_of(tier) / denominator
				for key, rw in group:
					frac = (rw / total_rw) if total_rw > 0 else (1.0 / len(group))
					weights[key] = share * frac
		elif untiered:
			total_rw = sum(rw for _, rw in untiered)
			for key, rw in untiered:
				weights[key] = (rw / total_rw) if total_rw > 0 else (1.0 / len(untiered))
		return weights

	def blend(self, news: dict[str, Any], social: dict[str, Any]) -> int:
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

		blended = (
			self.config.news_weight * news["sentiment_score"]
			+ self.config.social_weight * social["sentiment_score"]
		)
		return int(round(blended))
