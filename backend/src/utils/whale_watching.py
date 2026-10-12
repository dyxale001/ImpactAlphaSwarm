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
from .ww_insider_trace import InsiderTraceService
from .ww_trace import InstitutionalTraceService
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
    "FilerFamilies",
    "FundDescriber",
    "FundHoldingsBuilder",
    "FundsCache",
    "InsiderCache",
    "InstitutionalTraceService",
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


class FilerFamilies:
    """Shows a firm that files its 13F under several names as one fund.

    Vanguard reports as Vanguard Capital Management LLC and Vanguard Portfolio
    Management LLC, which put it in Top Funds twice (second and sixth) and read as a
    duplicate. Applied when the list is served, so a payload built before this existed
    shows merged too. The names it reported under are kept on the entry, so the page can
    say so rather than hide it.
    """

    #: Display name -> lowercase fragment every one of its filers' names contains.
    FAMILIES: dict[str, str] = {"Vanguard": "vanguard"}

    def merge(self, funds: list[dict]) -> list[dict]:
        out = list(funds)
        for display, fragment in self.FAMILIES.items():
            members = [f for f in out if fragment in (f.get("fund") or "").lower()]
            if len(members) < 2:
                continue
            out = [f for f in out if f not in members]
            out.append(self._combine(display, members))
        out.sort(key=lambda f: f.get("total_value") or 0, reverse=True)
        return out

    def _combine(self, display: str, members: list[dict]) -> dict:
        by_ticker: dict[str, list[dict]] = {}
        for member in members:
            for p in member.get("positions") or []:
                by_ticker.setdefault(p.get("ticker"), []).append(p)
        positions = [self._position(group) for group in by_ticker.values()]
        positions.sort(key=lambda p: p.get("value") or 0, reverse=True)
        return {
            "fund": display,
            "filers": sorted(m.get("fund") for m in members),
            "total_value": sum(m.get("total_value") or 0 for m in members),
            "positions": positions,
        }

    @staticmethod
    def _sum(values: list) -> Optional[float]:
        known = [v for v in values if v is not None]
        return sum(known) if known else None

    def _position(self, group: list[dict]) -> dict:
        if len(group) == 1:
            return dict(group[0])
        return {
            "ticker": group[0].get("ticker"),
            "universe": group[0].get("universe"),
            "pct_held": self._sum([p.get("pct_held") for p in group]),
            "value": self._sum([p.get("value") for p in group]),
            "shares": self._sum([p.get("shares") for p in group]),
            "pct_change": self._combined_change(group),
        }

    @staticmethod
    def _combined_change(group: list[dict]) -> Optional[float]:
        """The change in the firm's whole holding, from each filer's shares now and the
        shares its own change implies it had before. Unknown unless every filer
        reports both; averaging the two percentages would weight a tiny filer equally."""
        now = before = 0.0
        for p in group:
            shares, change = p.get("shares"), p.get("pct_change")
            if shares is None or change is None or change <= -1:
                return None
            now += shares
            before += shares / (1 + change)
        return (now / before - 1) if before > 0 else None


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
                    # Kept so FilerFamilies can work out a merged firm's change.
                    "shares": holder.get("shares"),
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
        institutions_trace: Optional[InstitutionalTraceService] = None,
        insider_trace: Optional[InsiderTraceService] = None,
    ):
        self.config = config or WhaleConfig.from_env()
        self.describer = describer or FundDescriber()
        self.insider_cache = insider_cache or InsiderCache(self.config)
        self.institutions_cache = institutions_cache or InstitutionsCache(self.config)
        self.funds_cache = funds_cache or FundsCache(self.config, self.describer, FilerFamilies())
        self.assets = assets or AssetRepository()
        self.insider_source = insider_source or FinnhubInsiderSource(self.config)
        self.institutional_source = institutional_source or YFinanceInstitutionalSource(self.config)
        self.holdings = holdings or FundHoldingsBuilder(self.institutions_cache)
        self.institutions_trace = institutions_trace or InstitutionalTraceService(self.config)
        self.insider_trace_service = insider_trace or InsiderTraceService(self.config)

    async def insider(self, ticker: str) -> dict:
        """Insider dealings for a ticker. ``summary_enabled`` says whether the tab's AI
        note is switched on, so the panel can leave its box out rather than show a
        skeleton that then disappears."""
        data = await self._insider_data(ticker.upper())
        return {**data, "summary_enabled": self.insider_trace_service.enabled}

    async def _insider_data(self, symbol: str) -> dict:
        api_key = self.insider_source.api_key()
        if not api_key:
            # No key: serve whatever we cached before, else an honest empty state.
            row = self.insider_cache.read(symbol)
            if row:
                return self.insider_cache.shape(
                    symbol, self.insider_cache.value_of(row), True, row.get("fetched_at")
                )
            return {
                "ticker": symbol,
                "transactions": [],
                "source": None,
                "window_days": self.config.insider_window_days,
            }

        return await self.insider_cache.serve(
            symbol, lambda: self.insider_source.fetch(symbol, api_key=api_key)
        )

    async def institutional(self, ticker: str) -> dict:
        """Institutional ownership for a ticker, via yfinance. ``summary_enabled`` as
        for ``insider``."""
        symbol = ticker.upper()
        data = await self.institutions_cache.serve(
            symbol, lambda: self.institutional_source.fetch(symbol)
        )
        return {**data, "summary_enabled": self.institutions_trace.enabled}

    async def insider_trace(self, ticker: str) -> dict:
        """The Insider trading tab's AI summary, written from the same cached dealings the
        tab shows. Same contract as ``institutional_trace``."""
        return await self._trace(ticker, self.insider_trace_service, self.insider)

    async def institutional_trace(self, ticker: str) -> dict:
        """The Big investors tab's reasoning trace for a ticker.

        Written from the same cached payload the tab shows, so the two cannot disagree.
        ``enabled`` is False when the feature is off, so the panel can stay hidden
        rather than showing an error. The generation is a blocking model call, run off
        the event loop.
        """
        return await self._trace(ticker, self.institutions_trace, self.institutional)

    async def _trace(self, ticker: str, service, fetch) -> dict:
        """Serve one tab's summary from its cached payload. ``enabled`` is False when the
        feature is off, so the panel can stay hidden; generation runs off the loop."""
        symbol = ticker.upper()
        empty = {"ticker": symbol, "trace": None, "source": None, "model": None,
                 "generated_at": None, "as_of": None}
        if not service.enabled:
            return {**empty, "enabled": False}
        payload = await fetch(symbol)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, service.trace_for, symbol, payload)
        return {**empty, **(result or {}), "enabled": True}

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
