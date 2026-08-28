"""Whale watching: the Supabase read-through caches and the asset repository.

Every whale endpoint follows the same shape: read the cached row, serve it if it
is inside its TTL, otherwise fetch fresh and write it back, and if that fetch
fails serve the stale copy rather than failing the request.
"""

from __future__ import annotations

import datetime
import logging
from abc import ABC, abstractmethod
from typing import Any, Awaitable, Callable, Optional

from .supabase_client import supabase
from .ww_config import WhaleConfig

logger = logging.getLogger("alpha-api")


class WhaleDataUnavailable(Exception):
    """Raised when a fetch failed and there is no cached copy to fall back to.

    """


class ReadThroughCache(ABC):
    """A Supabase-backed cache that can serve stale data when a fetch fails."""

    #: Table this cache reads and writes.
    TABLE: str = ""
    #: Primary key column.
    KEY_COLUMN: str = "ticker"
    #: Column holding the cached value.
    VALUE_COLUMN: str = "payload"
    #: Columns to select on a read.
    COLUMNS: str = "ticker, payload, fetched_at"
    #: Message used when there is nothing to serve at all.
    ERROR_DETAIL: str = "Unable to load data"
    #: Human label for log lines.
    LABEL: str = "cache"

    def __init__(self, config: Optional[WhaleConfig] = None):
        self.config = config or WhaleConfig.from_env()

    @property
    @abstractmethod
    def ttl(self) -> datetime.timedelta:
        """How long a cached row stays servable without a refetch."""

    @abstractmethod
    def shape(self, key: str, value: Any, cached: bool, fetched_at: Optional[str]) -> dict:
        """Build the API response for this cache's endpoint."""

    def is_fresh(self, row: dict) -> bool:
        """Whether a cached row is still inside its TTL."""
        ts = row.get("fetched_at")
        if not ts:
            return False
        try:
            fetched = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except ValueError:
            return False
        return datetime.datetime.now(datetime.timezone.utc) - fetched < self.ttl

    def value_of(self, row: dict) -> Any:
        return row.get(self.VALUE_COLUMN)

    def _row(self, key: str, value: Any) -> dict:
        """The upsert payload. Subclasses override to write extra columns."""
        return {self.KEY_COLUMN: key, self.VALUE_COLUMN: value}

    def read(self, key: str) -> Optional[dict]:
        """Return the cached row, or None if absent or on error."""
        try:
            res = (
                supabase.table(self.TABLE)
                .select(self.COLUMNS)
                .eq(self.KEY_COLUMN, key)
                .maybe_single()
                .execute()
            )
            return res.data
        except Exception as e:
            logger.info("%s cache read failed for %s: %s", self.LABEL, key, e)
            return None

    def write(self, key: str, value: Any) -> str:
        fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            row = self._row(key, value)
            row["fetched_at"] = fetched_at
            supabase.table(self.TABLE).upsert(row).execute()
        except Exception as e:
            logger.warning("%s cache write failed for %s: %s", self.LABEL, key, e)
        return fetched_at

    async def serve(self, key: str, fetch: Callable[[], Awaitable[Any]]) -> dict:
        """Read through the cache, fetching only when stale.

        A failed fetch falls back to the stale row rather than failing the
        request, because outdated whale data still beats an error page. Only a
        failure with nothing cached at all raises.
        """
        row = self.read(key)
        if row and self.is_fresh(row):
            return self.shape(key, self.value_of(row), True, row.get("fetched_at"))

        try:
            value = await fetch()
        except Exception as e:
            logger.warning("%s fetch failed for %s: %s", self.LABEL, key, e)
            if row:
                return self.shape(key, self.value_of(row), True, row.get("fetched_at"))
            raise WhaleDataUnavailable(self.ERROR_DETAIL) from e

        return self.shape(key, value, False, self.write(key, value))


class InsiderCache(ReadThroughCache):
    """Insider dealings per ticker. Stores the transactions and their source."""

    TABLE = "insider_transactions_cache"
    KEY_COLUMN = "ticker"
    VALUE_COLUMN = "transactions"
    COLUMNS = "ticker, transactions, source, fetched_at"
    ERROR_DETAIL = "Unable to load insider transactions"
    LABEL = "Insider"

    @property
    def ttl(self) -> datetime.timedelta:
        return self.config.insider_ttl

    def value_of(self, row: dict) -> dict:
        return {"transactions": row.get("transactions") or [], "source": row.get("source")}

    def _row(self, key: str, value: dict) -> dict:
        return {
            "ticker": key,
            "transactions": value.get("transactions") or [],
            "source": value.get("source"),
        }

    def shape(self, key: str, value: Any, cached: bool, fetched_at: Optional[str]) -> dict:
        value = value or {}
        return {
            "ticker": key,
            "transactions": value.get("transactions") or [],
            "source": value.get("source"),
            "cached": cached,
            "fetched_at": fetched_at,
        }


class InstitutionsCache(ReadThroughCache):
    """13F institutional ownership per ticker."""

    TABLE = "institutional_holders_cache"
    KEY_COLUMN = "ticker"
    VALUE_COLUMN = "payload"
    COLUMNS = "ticker, payload, fetched_at"
    ERROR_DETAIL = "Unable to load institutional ownership"
    LABEL = "Institutions"

    @property
    def ttl(self) -> datetime.timedelta:
        return self.config.institutions_ttl

    def shape(self, key: str, value: Any, cached: bool, fetched_at: Optional[str]) -> dict:
        # The payload is spread into the response, not nested under a key.
        return {"ticker": key, **(value or {}), "cached": cached, "fetched_at": fetched_at}

    def read_all(self, fresh_only: bool = False) -> dict[str, dict]:
        out: dict[str, dict] = {}
        try:
            res = supabase.table(self.TABLE).select(self.COLUMNS).execute()
        except Exception as e:
            logger.info("Bulk institutions cache read failed: %s", e)
            return out
        for row in res.data or []:
            if fresh_only and not self.is_fresh(row):
                continue
            out[row["ticker"]] = row.get("payload") or {}
        return out


class FundsCache(ReadThroughCache):
    """The whole fund-holdings aggregation, stored under a single fixed key."""

    TABLE = "fund_holdings_cache"
    KEY_COLUMN = "id"
    VALUE_COLUMN = "payload"
    COLUMNS = "id, payload, fetched_at"
    ERROR_DETAIL = "Unable to load fund holdings"
    LABEL = "Funds"
    ALL_KEY = "ALL"

    def __init__(self, config: Optional[WhaleConfig] = None, describer=None):
        super().__init__(config)
        # Descriptions are attached at serve time rather than baked into the
        # cached payload, so a blurb generated after the last build still shows.
        self.describer = describer

    @property
    def ttl(self) -> datetime.timedelta:
        return self.config.funds_ttl

    def shape(self, key: str, value: Any, cached: bool, fetched_at: Optional[str]) -> dict:
        funds = value or []
        if self.describer is not None:
            funds = self.describer.attach(funds)
        return {"funds": funds, "cached": cached, "fetched_at": fetched_at}

    async def serve_all(self, fetch: Callable[[], Awaitable[Any]]) -> dict:
        return await self.serve(self.ALL_KEY, fetch)


class AssetRepository:
    """The assets whale watching should show: active, and not currently benched.

    The discovery agent soft-retires and quarantines rows rather than deleting
    them (migration 009), so an unfiltered read of ``assets`` keeps surfacing
    companies the agent has already dropped. Every whale-watching read goes
    through here so that cannot happen in one place and not another.
    """

    COLUMNS = "ticker, name, universe, origin, first_discovered_at, description"

    def read_active(self) -> list[dict]:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            res = (
                supabase.table("assets")
                .select(self.COLUMNS)
                .eq("is_active", True)
                .or_(f"quarantined_until.is.null,quarantined_until.lt.{now}")
                .order("ticker")
                .execute()
            )
            return res.data or []
        except Exception as e:
            logger.info("Active assets read failed: %s", e)
            return []
