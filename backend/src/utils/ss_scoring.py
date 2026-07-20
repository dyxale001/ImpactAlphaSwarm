"""Sentiment scout: turning text into a signed sentiment score.

Two models run over the same cleaned text. VADER is free and scores everything;
the GCP NLP call is metered, so only the highest-priority mentions per source get
it and the rest stay VADER-only. Where a StockTwits author has tagged their own
post Bullish/Bearish, that declared label wins over both, because a self-tag reads
slang, sarcasm and emoji better than a lexicon does.
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Any

from ..agents.gcp_nlp import score_with_gcp
from .ss_aggregation import _aggregate_signed
from .ss_models import SocialMention
from .ss_sources import _source_tier

try:
	from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except ImportError:
	SentimentIntensityAnalyzer = None

# Number of most-prioritized posts per ticker (per source) that also get a GCP
# NLP signal. The rest are VADER-only to stay within the GCP monthly unit budget.
GCP_TOP_N = int(os.getenv("GCP_SENTIMENT_TOP_N", "5"))

# Signed sentiment [-1, 1] assigned to a post the author explicitly tagged
# Bullish/Bearish on StockTwits. Decisive but not maxed out (maps to 80 / 20 on
# the 0-100 contribution scale), since a self-tag is a strong but not absolute cue.
DECLARED_SENTIMENT_SIGNED = 0.6


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
	if gcp_score is None:
		return vader_score
	return 0.5 * vader_score + 0.5 * gcp_score


def _mention_sentiment(text: str, use_gcp: bool = False) -> float:
	cleaned = _clean_text(text)
	vader_score = _score_with_vader(cleaned)
	gcp_score = score_with_gcp(cleaned) if use_gcp else None
	return _combine_scores(vader_score, gcp_score)


def _engagement_priority(mention: SocialMention) -> Any:
	return mention.engagement


def _recency_priority(mention: SocialMention) -> Any:
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
		# Prefer the author's own Bullish/Bearish tag (StockTwits) — a declared
		# label reads slang/sarcasm/emoji better than a lexicon. VADER/GCP is the
		# fallback for untagged posts (and all news, which is never tagged).
		if mention.declared_sentiment == "Bullish":
			signed_score = DECLARED_SENTIMENT_SIGNED
		elif mention.declared_sentiment == "Bearish":
			signed_score = -DECLARED_SENTIMENT_SIGNED
		else:
			signed_score = _mention_sentiment(mention.text, use_gcp=index in gcp_indices)
		if signed_score >= 0.05:
			bullish_posts += 1
		elif signed_score <= -0.05:
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
				"tier": _source_tier(mention.source),
				"sentiment_raw": round(signed_score, 4),
				"sentiment_contribution": round((signed_score + 1) * 50, 2),
			}
		)

	# Tier-grouped blend: each reliability tier contributes its OWN average at a
	# fixed share (tier-1 highest), so a tier's influence is independent of its
	# article count and a few tier-1 wires aren't swamped by many tier-2/3 ones.
	# For social posts (no tier) this reduces to a plain average. See _aggregate_signed.
	average_signed = _aggregate_signed(scored_mentions)
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
