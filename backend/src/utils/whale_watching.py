"""Whale-watching: insider dealings (Finnhub) and institutional ownership
(yfinance), each backed by a Supabase read-through cache.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .descriptions import (
    FUND_BLURB_FALLBACK,
    curated_fund_blurb,
    normalise_fund_key,
    read_fund_descriptions,
)
from .ww_config import WhaleConfig
from .ww_sources import FinnhubInsiderSource, YFinanceInstitutionalSource
from .ww_store import (
    AssetRepository,
    FundsCache,
    InsiderCache,
    InstitutionsCache,
    ReadThroughCache,
    WhaleDataUnavailable,
)

logger = logging.getLogger("alpha-api")

__all__ = [
    "AssetRepository",
    "FundDescriber",
    "FundHoldingsBuilder",
    "FundsCache",
    "InsiderCache",
    "InstitutionsCache",
    "ReadThroughCache",
    "WhaleConfig",
    "WhaleDataUnavailable",
    "WhaleWatcher",
    "INSIDER_CACHE_TTL",
    "INSTITUTIONS_CACHE_TTL",
    "FUNDS_CACHE_TTL",
]

_DEFAULTS = WhaleConfig()
INSIDER_CACHE_TTL = _DEFAULTS.insider_ttl
INSTITUTIONS_CACHE_TTL = _DEFAULTS.institutions_ttl
FUNDS_CACHE_TTL = _DEFAULTS.funds_ttl


class FundDescriber:
    """Attaches a fund's blurb at serve time.
    """

    def attach(self, funds: list[dict]) -> list[dict]:
        cached = read_fund_descriptions()
        for f in funds:
            name = f.get("fund", "")
            f["description"] = (
                cached.get(normalise_fund_key(name))
                or curated_fund_blurb(name)
                or FUND_BLURB_FALLBACK
            )
        return funds

    def backfill(self) -> dict:
        """Fetch company descriptions for anything missing one. Nightly only.

        Funds are not back-filled: ``attach`` resolves those from the curated list
        at serve time, so there is nothing to store and no call to make.
        """
        from . import descriptions as desc

        return desc.backfill_descriptions()


class FundHoldingsBuilder:
    """Inverts per-ticker institutional ownership into per-fund holdings."""

    def __init__(self, institutions_cache: Optional[InstitutionsCache] = None):
        self.institutions_cache = institutions_cache or InstitutionsCache()

    def read_all(self, fresh_only: bool = False) -> dict[str, dict]:
        return self.institutions_cache.read_all(fresh_only=fresh_only)

    def refresh(self, assets: list[dict]) -> dict:
        source = YFinanceInstitutionalSource(self.institutions_cache.config)
        fresh = self.read_all(fresh_only=True)
        refreshed, failed = 0, 0
        for asset in assets:
            ticker = (asset.get("ticker") or "").upper()
            if not ticker or ticker in fresh:
                continue
            try:
                self.institutions_cache.write(ticker, source.fetch_blocking(ticker))
                refreshed += 1
            except Exception as e:
                logger.info("Institutional refresh failed for %s: %s", ticker, e)
                failed += 1
        return {"refreshed": refreshed, "failed": failed, "already_fresh": len(fresh)}

    def build(self, assets: list[dict]) -> list[dict]:
        cache = self.read_all()

        funds: dict[str, dict] = {}
        for asset in assets:
            ticker = (asset.get("ticker") or "").upper()
            if not ticker:
                continue
            payload = cache.get(ticker)
            if payload is None:
                continue  # not fetched yet; the nightly warm will pick it up
            for holder in payload.get("holders") or []:
                name = holder.get("holder")
                if not name:
                    continue
                entry = funds.setdefault(
                    name, {"fund": name, "total_value": 0.0, "positions": []}
                )
                entry["total_value"] += holder.get("value") or 0
                entry["positions"].append({
                    "ticker": ticker,
                    "universe": asset.get("universe"),
                    "pct_held": holder.get("pct_held"),
                    "value": holder.get("value"),
                    "pct_change": holder.get("pct_change"),
                })

        result = list(funds.values())
        for entry in result:
            entry["positions"].sort(key=lambda p: p.get("value") or 0, reverse=True)
        result.sort(key=lambda f: f.get("total_value") or 0, reverse=True)
        return result


class WhaleWatcher:

    def __init__(
        self,
        config: Optional[WhaleConfig] = None,
        insider_cache: Optional[InsiderCache] = None,
        institutions_cache: Optional[InstitutionsCache] = None,
        funds_cache: Optional[FundsCache] = None,
        assets: Optional[AssetRepository] = None,
        insider_source: Optional[FinnhubInsiderSource] = None,
        institutional_source: Optional[YFinanceInstitutionalSource] = None,
        holdings: Optional[FundHoldingsBuilder] = None,
        describer: Optional[FundDescriber] = None,
    ):
        self.config = config or WhaleConfig.from_env()
        self.describer = describer or FundDescriber()
        self.insider_cache = insider_cache or InsiderCache(self.config)
        self.institutions_cache = institutions_cache or InstitutionsCache(self.config)
        self.funds_cache = funds_cache or FundsCache(self.config, self.describer)
        self.assets = assets or AssetRepository()
        self.insider_source = insider_source or FinnhubInsiderSource(self.config)
        self.institutional_source = institutional_source or YFinanceInstitutionalSource(self.config)
        self.holdings = holdings or FundHoldingsBuilder(self.institutions_cache)

    async def insider(self, ticker: str) -> dict:
        symbol = ticker.upper()

        api_key = self.insider_source.api_key()
        if not api_key:
            # No key: serve whatever we cached before, else an honest empty state.
            row = self.insider_cache.read(symbol)
            if row:
                return self.insider_cache.shape(
                    symbol, self.insider_cache.value_of(row), True, row.get("fetched_at")
                )
            return {"ticker": symbol, "transactions": [], "source": None}

        return await self.insider_cache.serve(
            symbol, lambda: self.insider_source.fetch(symbol, api_key=api_key)
        )

    async def institutional(self, ticker: str) -> dict:
        """Institutional ownership for a ticker, via yfinance."""
        symbol = ticker.upper()
        return await self.institutions_cache.serve(
            symbol, lambda: self.institutional_source.fetch(symbol)
        )

    async def funds(self) -> dict:
        return await self.funds_cache.serve_all(self._rebuild_funds)

    async def _rebuild_funds(self) -> list[dict]:
        loop = asyncio.get_running_loop()
        assets = await loop.run_in_executor(None, self.assets.read_active)
        return await loop.run_in_executor(None, self.holdings.build, assets)

    async def refresh_nightly(self) -> dict:
        """Nightly whale-watching maintenance, run after the discovery agent.

        Four stages, each isolated so one failing does not cost the others:
          1. warm the institutional cache for tickers that are missing or stale —
             the slow part (one yfinance call each), which is exactly why it lives
             here rather than inside the /api/funds request
          2. rebuild the fund-holdings aggregation over the warmed cache
          3. describe any company that still has no blurb

        Funds used to be a fourth stage. They are resolved from the curated list at
        serve time now, so there is nothing nightly to do for them.
        """
        loop = asyncio.get_running_loop()
        summary: dict = {}

        assets = await loop.run_in_executor(None, self.assets.read_active)
        summary["assets"] = len(assets)

        try:
            summary["institutions"] = await loop.run_in_executor(
                None, self.holdings.refresh, assets
            )
        except Exception as e:
            logger.warning("Institutional cache warm failed: %s", e)
            summary["institutions"] = {"error": str(e)}

        funds: list = []
        try:
            funds = await loop.run_in_executor(None, self.holdings.build, assets)
            self.funds_cache.write(FundsCache.ALL_KEY, funds)
            summary["funds"] = len(funds)
        except Exception as e:
            logger.warning("Fund holdings rebuild failed: %s", e)
            summary["funds"] = {"error": str(e)}

        try:
            summary["descriptions"] = await loop.run_in_executor(
                None, self.describer.backfill
            )
        except Exception as e:
            logger.warning("Description backfill failed: %s", e)
            summary["descriptions"] = {"error": str(e)}

        return summary
