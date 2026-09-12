"""Closing prices for the JSE-listed funds in the catalogue.

Only ETFs have these. A unit trust is not listed — you buy units from the
manager at a daily NAV — so there is no market price to draw, and the absence is
a fact about the vehicle rather than a gap in our data. Nothing here invents one.

**What this is allowed to be used for.** The chart shows what the JSE closed at,
dated. It is not a performance figure and no return is ever computed from it: the
design note's rule is that the manager's own published performance is the only
performance shown, because a return we calculated would sit beside figures that
came off a regulated document and look identical to them.

Prices are stored rather than fetched per request. `fund_prices` is keyed on
``(fund_id, price_date)``, so a refresh that overlaps a previous one simply
rewrites the same rows.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable, Optional

from ..utils.supabase_client import zar_prices

# Enough for a year's line at daily resolution, and short enough that a first
# fetch for a fund is not a minute of Yahoo.
DEFAULT_PERIOD = "1y"

# The JSE quotes many instruments in rand cents. The shared converter already
# knows which currencies those are; this reuses its cached currency lookup
# rather than assuming, because some JSE instruments do quote in rand.
_SUBUNIT_CURRENCIES = {"ZAC", "ZA CENT", "ZACP"}


def fetch_closes(symbol: str, period: str = DEFAULT_PERIOD) -> list[tuple[date, float]]:
    """Daily closes for a Yahoo symbol, in rand, oldest first.

    Returns an empty list rather than raising: a fund whose price feed is down
    should render without a chart, not fail the page it sits on.
    """
    try:
        import yfinance as yf

        history = yf.Ticker(symbol).history(period=period, interval="1d", auto_adjust=False)
    except Exception as e:  # noqa: BLE001
        print(f"Error fetching prices for {symbol}: {e}")
        return []

    if history is None or history.empty or "Close" not in history:
        return []

    divisor = 100.0 if (zar_prices.currency_of(symbol) or "").upper() in _SUBUNIT_CURRENCIES else 1.0

    closes: list[tuple[date, float]] = []
    for stamp, close in history["Close"].items():
        try:
            value = float(close)
        except (TypeError, ValueError):
            continue
        if value != value:  # NaN, which pandas uses for a non-trading day
            continue
        closes.append((stamp.date(), round(value / divisor, 4)))
    return closes


def rows_for(fund_id: str, closes: Iterable[tuple[date, float]]) -> list[dict[str, Any]]:
    """Turn closes into `fund_prices` rows."""
    return [
        {"fund_id": fund_id, "price_date": day.isoformat(), "close_zar": value}
        for day, value in closes
    ]


def refresh_fund(repo, fund: dict[str, Any], period: str = DEFAULT_PERIOD) -> int:
    """Fetch and store one fund's closes. Returns how many rows were written.

    A fund with no ``yahoo_symbol`` is skipped rather than guessed at — that is
    how a unit trust is recognised here, the same discriminator the validators
    use to tell the vehicles apart.
    """
    symbol: Optional[str] = (fund.get("yahoo_symbol") or "").strip() or None
    if not symbol:
        return 0
    rows = rows_for(fund["id"], fetch_closes(symbol, period))
    if not rows:
        return 0
    repo.upsert_prices(rows)
    return len(rows)
