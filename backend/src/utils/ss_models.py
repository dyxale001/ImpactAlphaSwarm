"""Sentiment scout: shared data model and ticker helpers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


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
