"""Sentiment scout: shared data model and ticker helpers.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


def engagement_weight(likes: int, reshares: int, replies: int, cap: float) -> float:
	"""Log-dampened, capped weight in [1.0, cap] from a post's engagement. A post
	with no engagement weighs 1.0; a heavily engaged one weighs more but with
	sharply diminishing returns, so a single viral post cannot dominate.

	Lives here rather than on the collector because a post rebuilt from storage has
	to arrive at the same weight as one straight off the wire.
	"""
	raw = max(0, likes) + 2 * max(0, reshares) + max(0, replies)
	return min(cap, 1.0 + math.log1p(raw))


@dataclass(frozen=True)
class SocialMention:
	ticker: str
	text: str
	source: str
	url: str | None = None
	engagement: int = 0
	likes: int = 0
	reshares: int = 0
	replies: int = 0
	created_at: str | None = None
	declared_sentiment: str | None = None
	# Original article headline (news only), kept separate from the combined
	headline: str | None = None
	# Reliability weight for the source-tier-weighted average. 1.0 for social
	# posts; for news it is the publisher's tier weight (tier-1 highest).
	weight: float = 1.0
	# The platform's own id for the post (social only). StockTwits ids are monotonic,
	# which is what lets the daily history dedupe with a single stored integer instead
	# of a raw post table: see last_message_id in migrations/019. It therefore has to
	# survive scoring, so MentionScorer.score copies it onto the scored entry.
	message_id: int | None = None

	@property
	def username(self) -> str | None:
		"""The author, recovered from the ``stocktwits:<user>`` source tag."""
		prefix = "stocktwits:"
		if self.source.startswith(prefix):
			return self.source[len(prefix):] or None
		return None

	def to_cache(self) -> dict[str, Any]:
		"""Serialize a news mention to the cache JSON shape (Finnhub and Marketaux
		share the same fields)."""
		return {
			"text": self.text,
			"headline": self.headline,
			"source": self.source,
			"url": self.url,
			"created_at": self.created_at,
			"weight": self.weight,
		}

	@classmethod
	def from_cache(cls, ticker: str, data: dict[str, Any]) -> "SocialMention":
		"""Rebuild a news mention from a cached article."""
		return cls(
			ticker=ticker,
			text=data.get("text", ""),
			headline=data.get("headline"),
			source=data.get("source", ""),
			url=data.get("url"),
			engagement=0,
			created_at=data.get("created_at"),
			weight=float(data.get("weight", 1.0)),
		)


def _normalize_tickers(tickers: list[str]) -> list[str]:
	return sorted({ticker.upper().strip() for ticker in tickers if ticker and ticker.strip()})


def _api_symbol(ticker: str) -> str:
	return ticker.upper().replace("-", ".")
