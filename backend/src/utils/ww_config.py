"""Whale watching: one object holding every tunable setting.

The TTLs and row caps used to be hard-coded module constants, so tuning any of
them meant a code change. Collecting them here lets a ``WhaleWatcher`` be built
with an explicit configuration, while ``from_env`` reproduces the historical
values exactly.
"""

from __future__ import annotations

import datetime
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
class WhaleConfig:
    """Immutable settings shared by every collaborator in the watcher."""

    # Insider data (SEC Form 4) lands within ~2 business days of a trade and is
    # sporadic per ticker, so we serve from cache and refetch only when stale.
    insider_ttl_hours: int = 48
    # 13F institutional ownership updates only quarterly, so cache it far longer.
    institutions_ttl_days: int = 7
    # The fund-holdings aggregation is expensive to build, so cache it for a week.
    funds_ttl_days: int = 7

    insider_max_transactions: int = 25
    institutional_max_holders: int = 15
    http_timeout: float = 10.0

    @property
    def insider_ttl(self) -> datetime.timedelta:
        return datetime.timedelta(hours=self.insider_ttl_hours)

    @property
    def institutions_ttl(self) -> datetime.timedelta:
        return datetime.timedelta(days=self.institutions_ttl_days)

    @property
    def funds_ttl(self) -> datetime.timedelta:
        return datetime.timedelta(days=self.funds_ttl_days)

    @classmethod
    def from_env(cls) -> "WhaleConfig":
        return cls(
            insider_ttl_hours=_env_int("WHALE_INSIDER_TTL_HOURS", 48),
            institutions_ttl_days=_env_int("WHALE_INSTITUTIONS_TTL_DAYS", 7),
            funds_ttl_days=_env_int("WHALE_FUNDS_TTL_DAYS", 7),
            insider_max_transactions=_env_int("WHALE_INSIDER_MAX_TRANSACTIONS", 25),
            institutional_max_holders=_env_int("WHALE_INSTITUTIONAL_MAX_HOLDERS", 15),
            http_timeout=_env_float("WHALE_HTTP_TIMEOUT", 10.0),
        )
