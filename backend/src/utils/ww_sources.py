"""Whale watching: where the data comes from.

Two providers with very different call styles. Finnhub's insider feed is fetched
over httpx and is natively async; yfinance is a blocking library and has to run
off the event loop. ``BlockingSource`` absorbs that difference so the watcher can
await every source the same way, instead of each caller remembering which ones
need ``run_in_executor``.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import math
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
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


class InsiderWindow:
    """The span of insider dealings the tab shows: traded in the last ``days`` days.

    Dated by the trade, falling back to the filing when Finnhub has no trade date. Used
    when parsing a fetch and again when serving the cache, so a dealing ages out of the
    tab on the day it leaves the window rather than at the next refetch.
    """

    def __init__(self, days: int, today: Optional[datetime.date] = None):
        self.days = max(1, int(days))
        self.today = today or datetime.datetime.now(datetime.timezone.utc).date()

    @property
    def start(self) -> datetime.date:
        return self.today - datetime.timedelta(days=self.days)

    @staticmethod
    def _day(value: Any) -> Optional[datetime.date]:
        try:
            return datetime.date.fromisoformat(str(value)[:10]) if value else None
        except ValueError:
            return None

    def contains(self, transaction_date: Any, filing_date: Any = None) -> bool:
        day = self._day(transaction_date) or self._day(filing_date)
        return day is not None and day >= self.start

    def keep(self, transactions: list[dict]) -> list[dict]:
        return [
            t for t in transactions
            if self.contains(t.get("transaction_date"), t.get("filing_date"))
        ]


@dataclass
class InsiderDealing:
    """One insider's dealing of one kind on one day, summed over the batches it was
    filed in. ``lots`` says how many batches; the price is their average."""

    name: str
    type: str
    code: Optional[str]
    transaction_date: Optional[str]
    filing_date: Optional[str]
    shares: float
    cost: float
    priced: bool
    single_price: Any
    lots: int = 1

    @property
    def key(self) -> tuple:
        return (self.name, self.transaction_date, self.code, self.type)

    @classmethod
    def from_row(cls, row: dict) -> "InsiderDealing":
        change = row.get("change") or 0
        shares = abs(change)
        price = row.get("transactionPrice")
        return cls(
            name=row.get("name") or "Unknown insider",
            type="buy" if change > 0 else "sell",
            code=row.get("transactionCode"),
            transaction_date=row.get("transactionDate"),
            filing_date=row.get("filingDate"),
            shares=shares,
            cost=shares * price if price else 0.0,
            priced=bool(price),
            single_price=price,
        )

    def merge(self, other: "InsiderDealing") -> "InsiderDealing":
        """This dealing with another batch of the same one added. A batch with no
        price leaves the total unpriced rather than understated."""
        self.shares += other.shares
        self.cost += other.cost
        self.priced = self.priced and other.priced
        self.lots += other.lots
        self.filing_date = max(self.filing_date or "", other.filing_date or "") or None
        return self

    #: The codes whose price is a market price. A grant's is zero and an exercise's is
    #: the strike: Musk's exercise of 304 million options at $23.34 read as a $7.1B
    #: purchase. Tax withholding and gifts are not a trade either, so only these are
    #: given a price and a dollar value, as the tab's "What the labels mean" says.
    MARKET_CODES = ("P", "S")

    @property
    def at_market(self) -> bool:
        return (self.code or "").strip().upper() in self.MARKET_CODES

    def as_dict(self) -> dict:
        price = value = None
        if self.at_market:
            if self.lots == 1:
                price = self.single_price
            elif self.priced and self.shares:
                price = round(self.cost / self.shares, 2)
            value = round(self.cost, 2) if self.priced and self.cost else None
        return {
            "name": self.name,
            "type": self.type,
            "shares": int(self.shares) if float(self.shares).is_integer() else self.shares,
            "price": price,
            "value": value,
            "transaction_date": self.transaction_date,
            "filing_date": self.filing_date,
            "transaction_code": self.code,
            "lots": self.lots,
            "role": None,
        }


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

    def _parse(self, payload: dict, window: Optional["InsiderWindow"] = None) -> list[dict]:
        """The dealings inside the window, one row per insider, day, code and direction.

        Derivative rows are dropped: they are the options side of an exercise, so one
        exercise used to show as a sale of options and a purchase of shares. An insider
        selling in batches files one row per batch, and those are summed into one, so a
        busy filer's list stays readable and every dealing in the window still counts.
        """
        window = window or InsiderWindow(self.config.insider_window_days)
        groups: dict[tuple, InsiderDealing] = {}
        for row in payload.get("data") or []:
            if row.get("isDerivative"):
                continue
            change = row.get("change") or 0
            if change == 0:
                continue
            if not window.contains(row.get("transactionDate"), row.get("filingDate")):
                continue
            dealing = InsiderDealing.from_row(row)
            existing = groups.get(dealing.key)
            groups[dealing.key] = existing.merge(dealing) if existing else dealing

        transactions = [d.as_dict() for d in groups.values()]
        transactions.sort(
            key=lambda t: (t.get("filing_date") or "", t.get("transaction_date") or ""),
            reverse=True,
        )
        cap = self.config.insider_max_transactions
        if len(transactions) > cap:
            logger.warning(
                "Insider dealings capped at %d of %d inside the %d day window",
                cap, len(transactions), window.days,
            )
        return transactions[:cap]

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
        # Infinity as well as NaN: either would make the response fail to encode as JSON.
        return f if math.isfinite(f) else None

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
