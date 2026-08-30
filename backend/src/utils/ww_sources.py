"""Whale watching: where the data comes from.

Two providers with very different call styles. Finnhub's insider feed is fetched
over httpx and is natively async; yfinance is a blocking library and has to run
off the event loop. ``BlockingSource`` absorbs that difference so the watcher can
await every source the same way, instead of each caller remembering which ones
need ``run_in_executor``.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
from abc import ABC, abstractmethod
from typing import Any, Optional

import httpx

from .ww_config import WhaleConfig

logger = logging.getLogger("alpha-api")

FINNHUB_INSIDER_URL = "https://finnhub.io/api/v1/stock/insider-transactions"


class WhaleSource(ABC):
    """A provider of whale data for one ticker."""

    name: str = "source"

    def __init__(self, config: Optional[WhaleConfig] = None):
        self.config = config or WhaleConfig.from_env()

    @abstractmethod
    async def fetch(self, symbol: str, **kwargs) -> Any:
        """Return this provider's data for the symbol."""


class BlockingSource(WhaleSource, ABC):
    """A source whose library blocks, run off the event loop."""

    async def fetch(self, symbol: str, **kwargs) -> Any:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.fetch_blocking, symbol)

    @abstractmethod
    def fetch_blocking(self, symbol: str) -> Any:
        """The blocking call. Never invoke directly from async code."""


class FinnhubInsiderSource(WhaleSource):
    """Insider dealings (SEC Form 4) from Finnhub, enriched with yfinance roles."""

    name = "finnhub"

    @staticmethod
    def normalize_name_key(name: str) -> str:
        cleaned = name.upper().replace("-", " ").replace(".", " ").replace(",", " ")
        tokens = [tok for tok in cleaned.split() if tok]
        return " ".join(tokens[:2])

    def fetch_roles(self, symbol: str) -> dict:
        try:
            import yfinance as yf
            df = yf.Ticker(symbol).insider_roster_holders
        except Exception as e:
            logger.info("Insider roster lookup failed for %s: %s", symbol, e)
            return {}
        if df is None or getattr(df, "empty", True):
            return {}
        if "Name" not in df.columns or "Position" not in df.columns:
            return {}
        roles: dict[str, str] = {}
        for _, row in df.iterrows():
            name = row.get("Name")
            position = row.get("Position")
            if name and position:
                roles[self.normalize_name_key(str(name))] = str(position)
        return roles

    async def fetch(self, symbol: str, api_key: str = "", **kwargs) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                FINNHUB_INSIDER_URL,
                params={"symbol": symbol, "token": api_key},
                timeout=self.config.http_timeout,
            )

        # Free-tier / uncovered symbols return 401/403/404 — "no coverage", not an error.
        if resp.status_code in (401, 403, 404):
            logger.info("Finnhub has no insider coverage for %s (HTTP %s)", symbol, resp.status_code)
            return {"transactions": [], "source": None}
        resp.raise_for_status()

        transactions = self._parse(resp.json() or {})

        loop = asyncio.get_running_loop()
        roles = await loop.run_in_executor(None, self.fetch_roles, symbol)
        if roles:
            for txn in transactions:
                txn["role"] = roles.get(self.normalize_name_key(txn["name"]))

        return {"transactions": transactions, "source": "Finnhub"}

    def _parse(self, payload: dict) -> list[dict]:
        transactions = []
        for row in payload.get("data") or []:
            change = row.get("change") or 0
            if change == 0: 
                continue
            shares = abs(change)
            price = row.get("transactionPrice")
            transactions.append({
                "name": row.get("name") or "Unknown insider",
                "type": "buy" if change > 0 else "sell",
                "shares": shares,
                "price": price,
                "value": round(shares * price, 2) if price else None,
                "transaction_date": row.get("transactionDate"),
                "filing_date": row.get("filingDate"),
                "transaction_code": row.get("transactionCode"),
                "role": None,
            })

        transactions.sort(key=lambda t: t.get("filing_date") or "", reverse=True)
        return transactions[: self.config.insider_max_transactions]

    @staticmethod
    def api_key() -> str:
        return os.getenv("FINNHUB_API_KEY", "").strip()


class YFinanceInstitutionalSource(BlockingSource):
    """Institutional ownership (13F) from yfinance."""

    name = "yfinance"

    @staticmethod
    def clean_num(value):
        if value is None:
            return None
        try:
            f = float(value)
        except (TypeError, ValueError):
            return None
        return None if math.isnan(f) else f

    def fetch_blocking(self, symbol: str) -> dict:
        payload = {
            "institutions_pct": None,
            "insiders_pct": None,
            "institutions_count": None,
            "holders": [],
            "source": None,
        }
        try:
            import yfinance as yf
            tk = yf.Ticker(symbol)
            major = tk.major_holders
            holders_df = tk.institutional_holders
        except Exception as e:
            logger.info("Institutional lookup failed for %s: %s", symbol, e)
            return payload

        self._apply_breakdown(payload, major, symbol)
        self._apply_holders(payload, holders_df, symbol)

        if payload["holders"] or payload["institutions_pct"] is not None:
            payload["source"] = "yfinance"
        return payload

    def _apply_breakdown(self, payload: dict, major, symbol: str) -> None:
        try:
            if major is not None and not major.empty and "Value" in major.columns:
                def _breakdown(label):
                    return self.clean_num(major.loc[label, "Value"]) if label in major.index else None
                payload["institutions_pct"] = _breakdown("institutionsPercentHeld")
                payload["insiders_pct"] = _breakdown("insidersPercentHeld")
                count = _breakdown("institutionsCount")
                payload["institutions_count"] = int(count) if count is not None else None
        except Exception as e:
            logger.info("major_holders parse failed for %s: %s", symbol, e)

    def _apply_holders(self, payload: dict, holders_df, symbol: str) -> None:
        try:
            if holders_df is not None and not holders_df.empty:
                holders = []
                for _, row in holders_df.head(self.config.institutional_max_holders).iterrows():
                    date = row.get("Date Reported")
                    shares = self.clean_num(row.get("Shares"))
                    holders.append({
                        "holder": str(row.get("Holder") or "Unknown"),
                        "pct_held": self.clean_num(row.get("pctHeld")),
                        "shares": int(shares) if shares is not None else None,
                        "value": self.clean_num(row.get("Value")),
                        "pct_change": self.clean_num(row.get("pctChange")),
                        "date_reported": str(date)[:10] if date is not None else None,
                    })
                payload["holders"] = holders
        except Exception as e:
            logger.info("institutional_holders parse failed for %s: %s", symbol, e)
