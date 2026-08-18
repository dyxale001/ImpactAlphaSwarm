"""Sentiment scout: one object holding every tunable setting.

Every field name maps to the env var it used to be read from, and every default is
the value the old module constant carried.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_int(name: str, default: int) -> int:
	try:
		return int(os.getenv(name, str(default)))
	except (TypeError, ValueError):
		return default


def _env_float(name: str, default: float) -> float:
	try:
		return float(os.getenv(name, str(default)))
	except (TypeError, ValueError):
		return default


@dataclass(frozen=True)
class SentimentConfig:
	"""Immutable settings shared by every collaborator in the scout."""
	# --- News collection ----------------------------------------------------
	news_lookback_days: int = 7
	marketaux_limit_per_ticker: int = 10
	marketaux_max_pages: int = 25
	marketaux_cache_max_age_hours: int = 48
	finnhub_cache_max_age_hours: int = 48
	finnhub_live_topup_max: int = 15
	finnhub_min_interval: float = 1.1

	# --- Social collection ----------------------------------------------------
	stocktwits_max_pages: int = 2
	stocktwits_engagement_cap: float = 8.0

	# --- Scoring --------------------------------------------------------------
	gcp_top_n: int = 5

	# --- Aggregation ----------------------------------------------------------
	news_recency_halflife_days: float = 2.0
	news_weight: float = 0.7

	@property
	def social_weight(self) -> float:
		return 1.0 - self.news_weight

	@classmethod
	def from_env(cls) -> "SentimentConfig":
		"""Build the configuration from the environment, using the same variable
		names and defaults the module constants used."""
		return cls(
			news_lookback_days=_env_int("NEWS_LOOKBACK_DAYS", 7),
			marketaux_limit_per_ticker=_env_int("MARKETAUX_LIMIT_PER_TICKER", 10),
			marketaux_max_pages=_env_int("MARKETAUX_MAX_PAGES", 25),
			marketaux_cache_max_age_hours=_env_int("MARKETAUX_CACHE_MAX_AGE_HOURS", 48),
			finnhub_cache_max_age_hours=_env_int("FINNHUB_CACHE_MAX_AGE_HOURS", 48),
			finnhub_live_topup_max=_env_int("FINNHUB_LIVE_TOPUP_MAX", 15),
			finnhub_min_interval=_env_float("FINNHUB_MIN_INTERVAL_SECONDS", 1.1),
			stocktwits_max_pages=_env_int("STOCKTWITS_MAX_PAGES", 2),
			stocktwits_engagement_cap=_env_float("STOCKTWITS_ENGAGEMENT_CAP", 8.0),
			gcp_top_n=_env_int("GCP_SENTIMENT_TOP_N", 5),
			news_recency_halflife_days=_env_float("NEWS_RECENCY_HALFLIFE_DAYS", 2.0),

			news_weight=min(1.0, max(0.0, _env_float("NEWS_SENTIMENT_WEIGHT", 0.7))),
		)