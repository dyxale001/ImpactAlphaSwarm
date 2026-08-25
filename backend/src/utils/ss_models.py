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
	# The platform's own id for the post (social only). This is the dedupe key that
	# lets a later collection ask only for posts newer than the highest id already
	# held, instead of re-downloading the same stream every run.
	message_id: int | None = None

	def to_row(self, sentiment_score: float | None = None) -> dict[str, Any]:
		"""Serialize a social post to its stocktwits_message_cache row.
		"""
		return {
			"message_id": self.message_id,
			"ticker": self.ticker,
			"created_at": self.created_at,
			"body": self.text,
			"username": self.username,
			"url": self.url,
			"likes": self.likes,
			"reshares": self.reshares,
			"replies": self.replies,
			"declared_sentiment": self.declared_sentiment,
			"sentiment_score": sentiment_score,
		}

	@classmethod
	def from_row(cls, data: dict[str, Any], engagement_cap: float = 8.0) -> "SocialMention":
		"""Rebuild a social post from its stored row.

		The engagement weight is recomputed rather than stored: it is a pure
		function of the three counts, so persisting it would let the two drift if
		the cap were ever retuned.
		"""
		likes = int(data.get("likes") or 0)
		reshares = int(data.get("reshares") or 0)
		replies = int(data.get("replies") or 0)
		username = data.get("username") or ""
		return cls(
			ticker=str(data.get("ticker", "")).upper(),
			text=data.get("body") or "",
			source=f"stocktwits:{username}",
			url=data.get("url"),
			engagement=likes + reshares + replies,
			likes=likes,
			reshares=reshares,
			replies=replies,
			created_at=data.get("created_at"),
			declared_sentiment=data.get("declared_sentiment"),
			weight=engagement_weight(likes, reshares, replies, engagement_cap),
			message_id=data.get("message_id"),
		)

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
