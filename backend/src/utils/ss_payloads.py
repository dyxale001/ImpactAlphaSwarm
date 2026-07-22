"""Sentiment scout: per-item transparency payloads for the frontend.

These are what let a user see exactly which articles and posts produced a score.
Each item carries two deliberately distinct numbers:

  * ``sentiment_score`` -- that item's OWN text sentiment, 0-100, ignoring when it
    was published and who published it.
  * ``influence`` -- the share of the rolled-up score the item actually drives,
    after tier reliability and recency weighting.

Two articles can show the same sentiment while moving the headline score by very
different amounts, and splitting the two numbers is what makes that visible.
"""

from __future__ import annotations

from typing import Any

from .ss_aggregation import _influence_weights
from .ss_models import SocialMention
from .ss_sources import _source_tier


def _tier_counts(news_mentions: list[SocialMention]) -> dict[str, int]:
	"""Count news articles per reliability tier, keyed ``tier1``/``tier2``/``tier3``."""
	counts = {"tier1": 0, "tier2": 0, "tier3": 0}
	for mention in news_mentions:
		tier = _source_tier(mention.source)
		if tier is not None:
			counts[f"tier{tier}"] += 1
	return counts


def _news_articles_payload(scored_news: list[dict[str, Any]]) -> list[dict[str, Any]]:
	articles: list[dict[str, Any]] = []
	weights = _influence_weights(scored_news)
	for item in sorted(scored_news, key=lambda it: it.get("created_at") or "", reverse=True):
		raw = item["sentiment_raw"]
		label = "Positive" if raw >= 0.05 else "Negative" if raw <= -0.05 else "Neutral"
		# Prefer the real stored headline; fall back to the pre-". " slice of the
		# combined text only for older/cached items that predate the headline field.
		headline = (item.get("headline") or item["text"].split(". ", 1)[0]).strip()
		if len(headline) > 160:
			headline = headline[:157].rstrip() + "…"
		articles.append(
			{
				"source": item["source"].split(":", 1)[-1],
				"tier": item.get("tier"),
				"date": (item.get("created_at") or "")[:10],  # YYYY-MM-DD
				"headline": headline,
				"url": item.get("url"),
				"sentiment": label,
				"sentiment_score": item["sentiment_contribution"],  # 0-100
				"influence": round(weights.get(id(item), 0.0) * 100, 1),  # % of the news score
			}
		)
	return articles


def _social_posts_payload(scored_social: list[dict[str, Any]]) -> list[dict[str, Any]]:
	posts: list[dict[str, Any]] = []
	weights = _influence_weights(scored_social)
	for item in sorted(scored_social, key=lambda it: it.get("created_at") or "", reverse=True):
		raw = item["sentiment_raw"]
		label = "Positive" if raw >= 0.05 else "Negative" if raw <= -0.05 else "Neutral"
		# source is "stocktwits:<username>"; split into platform + author.
		platform, _, author = item["source"].partition(":")
		text = (item.get("text") or "").strip()
		if len(text) > 240:
			text = text[:237].rstrip() + "…"
		posts.append(
			{
				"platform": platform or "stocktwits",
				"author": author or None,
				"date": (item.get("created_at") or "")[:10],  # YYYY-MM-DD
				"text": text,
				"url": item.get("url"),
				# Engagement counts shown next to each post.
				"likes": item.get("likes") or 0,
				"reshares": item.get("reshares") or 0,
				"replies": item.get("replies") or 0,
				"sentiment": label,
				"sentiment_score": item["sentiment_contribution"],  # 0-100
				"influence": round(weights.get(id(item), 0.0) * 100, 1),  # % of the social score
			}
		)
	return posts
