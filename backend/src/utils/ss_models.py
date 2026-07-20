"""Sentiment scout: shared data model and ticker helpers.

``SocialMention`` is the single unit every sentiment source is normalized into,
whether it came from StockTwits, Finnhub or Marketaux. Keeping it here lets the
collectors, the scorer and the payload builders share one shape without importing
each other.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SocialMention:
	ticker: str
	text: str
	source: str
	url: str | None = None
	engagement: int = 0
	# Engagement counts for display (social posts only). ``engagement`` stays the
	# combined total used for GCP prioritization; these are just the numbers shown.
	likes: int = 0
	reshares: int = 0
	replies: int = 0
	created_at: str | None = None
	# Author-declared Bullish/Bearish tag (social posts only). Preferred over
	# VADER when set; None means fall back to the model.
	declared_sentiment: str | None = None
	# Original article headline (news only), kept separate from the combined
	# "headline. summary" ``text`` so display and dedup use the real headline
	# instead of re-splitting on ". " (which breaks on abbreviations like "Sen.").
	headline: str | None = None
	# Reliability weight for the source-tier-weighted average. 1.0 for social
	# posts; for news it is the publisher's tier weight (tier-1 highest).
	weight: float = 1.0


def _normalize_tickers(tickers: list[str]) -> list[str]:
	return sorted({ticker.upper().strip() for ticker in tickers if ticker and ticker.strip()})


def _api_symbol(ticker: str) -> str:
	return ticker.upper().replace("-", ".")
