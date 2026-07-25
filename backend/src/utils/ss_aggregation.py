"""Sentiment scout: rolling per-item sentiment up into one score.

Two independent dimensions decide how much a single article moves the number:

  * Reliability (tier) works ACROSS tiers. Each tier contributes its own average
    at a fixed share, so a tier's influence does not depend on how many articles
    it has, and a handful of tier-1 wires are not drowned by a flood of tier-3.
  * Recency works WITHIN a tier. Newer articles of the same tier count for more,
    on an exponential half-life.

Keeping recency inside the tier average and never across tiers is what lets an
older tier-1 wire still outweigh newer, more numerous tier-3 articles.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from .ss_sources import _tier_share

# Half-life (in days) for the recency time-decay applied WITHIN each tier's
# average: a newer article outweighs an older one of the SAME tier. This does NOT
# touch the cross-tier shares, so tier-1 keeps its share regardless of how old its
# articles are. Default 2 days (a today article ~= 2x a 2-day-old one, ~= 4x a
# 4-day-old one). Set very high to effectively disable decay.
NEWS_RECENCY_HALFLIFE_DAYS = float(os.getenv("NEWS_RECENCY_HALFLIFE_DAYS", "2"))

# Blend weight for the news signal; the social signal gets the remainder. News is
# weighted higher because trusted financial reporting is a more reliable signal
# than retail social chatter. Clamped to [0, 1].
NEWS_WEIGHT = min(1.0, max(0.0, float(os.getenv("NEWS_SENTIMENT_WEIGHT", "0.7"))))
SOCIAL_WEIGHT = 1.0 - NEWS_WEIGHT


def _recency_weight(created_at: str | None) -> float:
	"""Exponential time-decay weight for an article by age: a newer article counts
	more than an older one of the SAME tier. Half-life is NEWS_RECENCY_HALFLIFE_DAYS.
	Articles with a missing/unparseable timestamp (or dated now/future) get 1.0."""
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
	half_life = max(0.1, NEWS_RECENCY_HALFLIFE_DAYS)
	return 0.5 ** (age_days / half_life)


def _recency_weighted_avg(pairs: list[tuple[float, float]]) -> float:
	"""Recency-weighted mean of (sentiment, recency_weight) pairs. Falls back to a
	plain mean if the weights underflow to zero (all articles extremely old)."""
	total_weight = sum(weight for _, weight in pairs)
	if total_weight > 0:
		return sum(sentiment * weight for sentiment, weight in pairs) / total_weight
	return sum(sentiment for sentiment, _ in pairs) / len(pairs)


def _aggregate_signed(scored_mentions: list[dict[str, Any]]) -> float:
	"""Aggregate per-article signed sentiment into one signed score in [-1, 1].

	Two independent dimensions:
	  * Reliability (tier) -- the CROSS-tier structure: each tier contributes its
	    own average at a fixed share (tier-1 highest), renormalized over the tiers
	    present. A tier's influence is independent of its article COUNT, so a few
	    tier-1 wires carry their full share against a flood of tier-2/3 articles.
	  * Recency -- ordering WITHIN a tier: each tier's average is recency-weighted
	    (newer articles of the same tier count more, NEWS_RECENCY_HALFLIFE_DAYS).

	Because recency lives inside the tier average and never across tiers, older
	tier-1 wires still outweigh newer, more numerous tier-3 articles. Items with no
	tier (social posts) fall back to a recency-weighted average of all items."""
	by_tier: dict[int, list[tuple[float, float]]] = {1: [], 2: [], 3: []}
	untiered: list[tuple[float, float]] = []
	for item in scored_mentions:
		recency = _recency_weight(item.get("created_at"))
		tier = item.get("tier")
		if tier in (1, 2, 3):
			# Tiered (news): reliability is handled by the cross-tier shares, so the
			# per-item weight is recency only.
			by_tier[tier].append((item["sentiment_raw"], recency))
		else:
			# Untiered (social): fold the post's engagement weight into recency, so a
			# liked/reshared take pulls the average harder than an ignored one.
			engagement = max(0.0, item.get("weight", 1.0))
			untiered.append((item["sentiment_raw"], recency * engagement))

	numerator = 0.0
	denominator = 0.0
	for tier in (1, 2, 3):
		group = by_tier[tier]
		if group:
			share = _tier_share(tier)
			numerator += share * _recency_weighted_avg(group)
			denominator += share

	if denominator > 0:
		return numerator / denominator
	# No tiered items (e.g. social posts): recency-weighted average.
	if untiered:
		return _recency_weighted_avg(untiered)
	return 0.0


def _influence_weights(scored: list[dict[str, Any]]) -> dict[int, float]:
	by_tier: dict[int, list[tuple[int, float]]] = {1: [], 2: [], 3: []}
	untiered: list[tuple[int, float]] = []
	for item in scored:
		recency = _recency_weight(item.get("created_at"))
		tier = item.get("tier")
		if tier in (1, 2, 3):
			by_tier[tier].append((id(item), recency))
		else:
			# Match _aggregate_signed: social influence is recency x engagement.
			engagement = max(0.0, item.get("weight", 1.0))
			untiered.append((id(item), recency * engagement))

	weights: dict[int, float] = {}
	denominator = sum(_tier_share(t) for t in (1, 2, 3) if by_tier[t])
	if denominator > 0:
		for tier in (1, 2, 3):
			group = by_tier[tier]
			if not group:
				continue
			total_rw = sum(rw for _, rw in group)
			share = _tier_share(tier) / denominator
			for key, rw in group:
				frac = (rw / total_rw) if total_rw > 0 else (1.0 / len(group))
				weights[key] = share * frac
	elif untiered:
		total_rw = sum(rw for _, rw in untiered)
		for key, rw in untiered:
			weights[key] = (rw / total_rw) if total_rw > 0 else (1.0 / len(untiered))
	return weights


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
