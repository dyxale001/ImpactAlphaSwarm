"""Whale-watching data access: insider dealings (Finnhub) and institutional
ownership (yfinance), each backed by a Supabase read-through cache.

Purely informational — none of this feeds the Unified Confidence Score. Kept out
of ``api.py`` so the route handlers there stay thin (parse request, call here,
shape response).
"""

import asyncio
import datetime
import logging
import math
from typing import Optional

import httpx

from .supabase_client import supabase

logger = logging.getLogger("alpha-api")

FINNHUB_INSIDER_URL = "https://finnhub.io/api/v1/stock/insider-transactions"

# Insider data (SEC Form 4) lands within ~2 business days of a trade and is
# sporadic per ticker, so we serve from cache and refetch only when stale. Bump
# to hours=72 for a 3-day window.
INSIDER_CACHE_TTL = datetime.timedelta(hours=48)
# 13F institutional ownership updates only quarterly — cache it for far longer.
INSTITUTIONS_CACHE_TTL = datetime.timedelta(days=7)
# The fund-holdings aggregation (inverted institutional data across all tracked
# assets) is expensive to build, so cache the whole thing for a week.
FUNDS_CACHE_TTL = datetime.timedelta(days=7)


def cache_is_fresh(row: dict, ttl: datetime.timedelta = INSIDER_CACHE_TTL) -> bool:
    """Shared freshness check for both caches."""
    ts = row.get("fetched_at")
    if not ts:
        return False
    try:
        fetched = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return False
    return datetime.datetime.now(datetime.timezone.utc) - fetched < ttl


# ── Insider dealings (Finnhub, enriched with yfinance roles) ──────────────────

def _normalize_name_key(name: str) -> str:
    """Match key for an insider name: SURNAME + given name, upper-cased with
    punctuation/hyphens stripped. Finnhub and yfinance both use LAST-FIRST order
    but disagree on middle initials, so keying on the first two tokens matches most."""
    cleaned = name.upper().replace("-", " ").replace(".", " ").replace(",", " ")
    tokens = [tok for tok in cleaned.split() if tok]
    return " ".join(tokens[:2])


def _fetch_insider_roles(symbol: str) -> dict:
    """Return {normalized_name_key: job title} from the yfinance insider roster.
    Finnhub's transaction feed carries names only, so we enrich with roles here.
    Best-effort and blocking (call via run_in_executor); returns {} on any failure."""
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
            roles[_normalize_name_key(str(name))] = str(position)
    return roles


async def fetch_fresh_insider(symbol: str, api_key: str) -> tuple[list, Optional[str]]:
    """Fetch + normalize insider dealings from Finnhub, enriched with yfinance roles.

    Returns ``([], None)`` for uncovered symbols (e.g. JSE tickers, which Finnhub
    403s). Raises on genuine network / server errors so the caller can fall back
    to stale cache instead of caching a failure.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            FINNHUB_INSIDER_URL,
            params={"symbol": symbol, "token": api_key},
            timeout=10.0,
        )

    # Free-tier / uncovered symbols return 401/403/404 — "no coverage", not an error.
    if resp.status_code in (401, 403, 404):
        logger.info("Finnhub has no insider coverage for %s (HTTP %s)", symbol, resp.status_code)
        return [], None
    resp.raise_for_status()

    payload = resp.json() or {}
    transactions = []
    for row in payload.get("data") or []:
        change = row.get("change") or 0
        if change == 0:  # rows that net to zero (paired same-day entries)
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
    transactions = transactions[:25]

    # Enrich names with job titles from the yfinance insider roster (Finnhub's feed
    # has names only). Best-effort; run off the event loop since yfinance blocks.
    loop = asyncio.get_running_loop()
    roles = await loop.run_in_executor(None, _fetch_insider_roles, symbol)
    if roles:
        for txn in transactions:
            txn["role"] = roles.get(_normalize_name_key(txn["name"]))

    return transactions, "Finnhub"


def read_insider_cache(symbol: str) -> Optional[dict]:
    """Return the cached insider row for a ticker, or None if absent / on error."""
    try:
        res = (
            supabase.table("insider_transactions_cache")
            .select("ticker, transactions, source, fetched_at")
            .eq("ticker", symbol)
            .maybe_single()
            .execute()
        )
        return res.data
    except Exception as e:
        logger.info("Insider cache read failed for %s: %s", symbol, e)
        return None


def insider_cache_payload(symbol: str, row: dict) -> dict:
    """Shape a cached insider row into the API response."""
    return {
        "ticker": symbol,
        "transactions": row.get("transactions") or [],
        "source": row.get("source"),
        "cached": True,
        "fetched_at": row.get("fetched_at"),
    }


def write_insider_cache(symbol: str, transactions: list, source: Optional[str]) -> str:
    fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        supabase.table("insider_transactions_cache").upsert({
            "ticker": symbol,
            "transactions": transactions,
            "source": source,
            "fetched_at": fetched_at,
        }).execute()
    except Exception as e:
        logger.warning("Insider cache write failed for %s: %s", symbol, e)
    return fetched_at


# ── Institutional ownership (yfinance 13F) ────────────────────────────────────

def _clean_num(value):
    """Coerce a pandas/np scalar to a plain float, or None for NaN/missing."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def fetch_institutional(symbol: str) -> dict:
    """Institutional ownership from yfinance (major_holders + institutional_holders).
    Blocking — call via run_in_executor. Returns a payload dict; empty holders and
    null percentages on any failure or non-US ticker with no coverage."""
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

    # major_holders: DataFrame indexed by breakdown label, single "Value" column.
    try:
        if major is not None and not major.empty and "Value" in major.columns:
            def _breakdown(label):
                return _clean_num(major.loc[label, "Value"]) if label in major.index else None
            payload["institutions_pct"] = _breakdown("institutionsPercentHeld")
            payload["insiders_pct"] = _breakdown("insidersPercentHeld")
            count = _breakdown("institutionsCount")
            payload["institutions_count"] = int(count) if count is not None else None
    except Exception as e:
        logger.info("major_holders parse failed for %s: %s", symbol, e)

    # institutional_holders: top fund holders table.
    try:
        if holders_df is not None and not holders_df.empty:
            holders = []
            for _, row in holders_df.head(15).iterrows():
                date = row.get("Date Reported")
                shares = _clean_num(row.get("Shares"))
                holders.append({
                    "holder": str(row.get("Holder") or "Unknown"),
                    "pct_held": _clean_num(row.get("pctHeld")),
                    "shares": int(shares) if shares is not None else None,
                    "value": _clean_num(row.get("Value")),
                    "pct_change": _clean_num(row.get("pctChange")),
                    "date_reported": str(date)[:10] if date is not None else None,
                })
            payload["holders"] = holders
    except Exception as e:
        logger.info("institutional_holders parse failed for %s: %s", symbol, e)

    if payload["holders"] or payload["institutions_pct"] is not None:
        payload["source"] = "yfinance"
    return payload


def read_institutions_cache(symbol: str) -> Optional[dict]:
    try:
        res = (
            supabase.table("institutional_holders_cache")
            .select("ticker, payload, fetched_at")
            .eq("ticker", symbol)
            .maybe_single()
            .execute()
        )
        return res.data
    except Exception as e:
        logger.info("Institutions cache read failed for %s: %s", symbol, e)
        return None


def write_institutions_cache(symbol: str, payload: dict) -> str:
    fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        supabase.table("institutional_holders_cache").upsert({
            "ticker": symbol,
            "payload": payload,
            "fetched_at": fetched_at,
        }).execute()
    except Exception as e:
        logger.warning("Institutions cache write failed for %s: %s", symbol, e)
    return fetched_at


# ── Fund holdings (institutional data inverted: fund → its positions) ──────────

def build_fund_holdings(assets: list[dict]) -> list[dict]:
    """Invert per-ticker institutional data into per-fund holdings across the given
    tracked assets ([{ticker, universe}, ...]).

    Scoped to the companies we cover — a fund's positions here are only in our
    tracked assets, not its whole portfolio. Reuses the per-ticker institutional
    cache in bulk and only fetches tickers that aren't already cached fresh.
    Returns funds sorted by total value held across the universe, each with its
    positions (biggest first). Blocking — call via run_in_executor.
    """
    # Bulk-read fresh per-ticker caches so we refetch as little as possible.
    fresh_cache: dict[str, dict] = {}
    try:
        res = (
            supabase.table("institutional_holders_cache")
            .select("ticker, payload, fetched_at")
            .execute()
        )
        for row in res.data or []:
            if cache_is_fresh(row, INSTITUTIONS_CACHE_TTL):
                fresh_cache[row["ticker"]] = row.get("payload") or {}
    except Exception as e:
        logger.info("Bulk institutions cache read failed: %s", e)

    funds: dict[str, dict] = {}
    for asset in assets:
        ticker = (asset.get("ticker") or "").upper()
        if not ticker:
            continue
        payload = fresh_cache.get(ticker)
        if payload is None:
            payload = fetch_institutional(ticker)
            write_institutions_cache(ticker, payload)
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


def read_funds_cache() -> Optional[dict]:
    try:
        res = (
            supabase.table("fund_holdings_cache")
            .select("id, payload, fetched_at")
            .eq("id", "ALL")
            .maybe_single()
            .execute()
        )
        return res.data
    except Exception as e:
        logger.info("Funds cache read failed: %s", e)
        return None


def write_funds_cache(funds: list) -> str:
    fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        supabase.table("fund_holdings_cache").upsert({
            "id": "ALL",
            "payload": funds,
            "fetched_at": fetched_at,
        }).execute()
    except Exception as e:
        logger.warning("Funds cache write failed: %s", e)
    return fetched_at
