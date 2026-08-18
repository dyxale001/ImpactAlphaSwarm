"""Sentiment scout: publisher trust tiers and source attribution.

``PublisherRegistry`` answers two questions about a news article, both purely from
its metadata:

  * Who actually published it? Aggregators republish other people's stories and
    get credited for them, so ``effective_source`` tries to recover the real wire.
  * How much should that publisher count? ``tier_of`` maps a publisher to a
    reliability tier, and the tier drives both its weight and its share of the
    news score.
"""

from __future__ import annotations

import os
import re
import urllib.parse
from typing import TYPE_CHECKING

if TYPE_CHECKING:
	from .ss_models import SocialMention


class PublisherRegistry:
	"""Publisher trust tiers, their weights and shares, and wire recovery."""
	DEFAULT_TIER_SOURCES: dict[int, tuple[str, ...]] = {
		# Tier 1: established financial wires / newspapers of record.
		1: (
			"reuters",
			"bloomberg",
			"cnbc",
			"wall street journal",
			"wsj",
			"financial times",
			"associated press",
			"ap news",
			"marketwatch",
			"barron",
			"the economist",
			"morningstar",
		),
		# Tier 2: reputable but more aggregator / secondary outlets.
		2: (
			"yahoo",
			"forbes",
			"investor's business daily",
			"investors business daily",
			"business insider",
		),
		# Tier 3: crowd-sourced / contributor analysis.
		3: (
			"seekingalpha",
			"seeking alpha",
			"the motley fool",
			"motley fool",
		),
	}

	DEFAULT_TIER_WEIGHTS: dict[int, float] = {1: 1.0, 2: 0.6, 3: 0.3}
	DEFAULT_TIER_SHARES: dict[int, float] = {1: 0.6, 2: 0.3, 3: 0.1}

	TIER1_DOMAINS: tuple[tuple[str, str], ...] = (
		("reuters.com", "Reuters"),
		("bloomberg.com", "Bloomberg"),
		("wsj.com", "Wall Street Journal"),
		("ft.com", "Financial Times"),
		("apnews.com", "Associated Press"),
		("cnbc.com", "CNBC"),
		("marketwatch.com", "MarketWatch"),
		("barrons.com", "Barron's"),
		("economist.com", "The Economist"),
		("morningstar.com", "Morningstar"),
	)

	DATELINE_RE = re.compile(r"\((reuters|bloomberg|ap|associated press|dow jones)\)", re.IGNORECASE)
	DATELINE_NAMES: dict[str, str] = {
		"reuters": "Reuters",
		"bloomberg": "Bloomberg",
		"ap": "Associated Press",
		"associated press": "Associated Press",
		"dow jones": "Dow Jones",
	}
	DATELINE_SCAN_CHARS = 200

	TIERS = (1, 2, 3)

	def __init__(self) -> None:
		self._sources: dict[int, tuple[str, ...]] = {}
		self._weights: dict[int, float] = {}
		self._shares: dict[int, float] = {}

		for tier in self.TIERS:
			override = os.getenv(f"NEWS_TIER{tier}_SOURCES", "").strip()
			if override:
				self._sources[tier] = tuple(s.strip().lower() for s in override.split(",") if s.strip())
			else:
				self._sources[tier] = self.DEFAULT_TIER_SOURCES[tier]

			self._weights[tier] = self._env_float(
				f"NEWS_TIER{tier}_WEIGHT", self.DEFAULT_TIER_WEIGHTS[tier]
			)
			self._shares[tier] = self._env_float(
				f"NEWS_TIER{tier}_SHARE", self.DEFAULT_TIER_SHARES[tier]
			)

	@staticmethod
	def _env_float(name: str, default: float) -> float:
		try:
			return float(os.getenv(name, str(default)))
		except (TypeError, ValueError):
			return default

	# --- Tier lookups ---------------------------------------------------------

	def sources_for(self, tier: int) -> tuple[str, ...]:
		return self._sources[tier]

	def weight_of(self, tier: int) -> float:
		return self._weights[tier]

	def share_of(self, tier: int) -> float:
		return self._shares[tier]

	def tier_of(self, source: str) -> int | None:
		"""Return 1/2/3 for a recognized trusted publisher, else ``None``."""
		name = (source or "").lower()
		for tier in self.TIERS:
			if any(s in name for s in self._sources[tier]):
				return tier
		return None

	def tier_counts(self, news_mentions: list["SocialMention"]) -> dict[str, int]:
		"""Count news articles per reliability tier, keyed ``tier1``/``tier2``/``tier3``."""
		counts = {"tier1": 0, "tier2": 0, "tier3": 0}
		for mention in news_mentions:
			tier = self.tier_of(mention.source)
			if tier is not None:
				counts[f"tier{tier}"] += 1
		return counts

	# --- Syndicated wire recovery ---------------------------------------------
	def effective_source(self, headline: str, summary: str, url: str | None, source: str) -> str:
		if url:
			host = urllib.parse.urlparse(url).netloc.lower()
			for domain, name in self.TIER1_DOMAINS:
				if host == domain or host.endswith("." + domain):
					return name

		lead = f"{headline} {summary}"[: self.DATELINE_SCAN_CHARS]
		match = self.DATELINE_RE.search(lead)
		if match:
			return self.DATELINE_NAMES[match.group(1).lower()]

		return source

	def tier1_publisher(self, source: str) -> str | None:
		name = (source or "").lower()
		for domain, display in self.TIER1_DOMAINS:
			if domain in name:
				return display
		if self.tier_of(source) == 1:
			return source
		return None


_default_registry: PublisherRegistry | None = None


def default_registry() -> PublisherRegistry:
	"""Process-wide registry for callers that have no scout instance to hand."""
	global _default_registry
	if _default_registry is None:
		_default_registry = PublisherRegistry()
	return _default_registry


def _source_tier(source: str) -> int | None:
	"""Back-compat shim. ``asset_discovery`` imports this to tier its own news
	sources without building a scout; keep it working."""
	return default_registry().tier_of(source)
