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

from .descriptions import (
    FUND_BLURB_FALLBACK,
    curated_fund_blurb,
    normalise_fund_key,
    read_fund_descriptions,
)
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

def with_descriptions(funds: list[dict]) -> list[dict]:
    """Attach a fresh ``description`` to each fund, applied at serve time so a
    newly generated blurb shows up without rebuilding the holdings cache.

    Resolution order per fund:
      1. the cached row in ``fund_descriptions`` (written by the nightly LLM
         backfill, or hand-edited with is_manual set)
      2. a curated blurb for one of the big names, covering the window before the
         first backfill has run
      3. the generic fallback

    One bulk read serves the whole list. Mutates and returns ``funds``.
    """
    cached = read_fund_descriptions()
    for f in funds:
        name = f.get("fund", "")
        f["description"] = (
            cached.get(normalise_fund_key(name))
            or curated_fund_blurb(name)
            or FUND_BLURB_FALLBACK
        )
    return funds


def read_all_institutions_cache(fresh_only: bool = False) -> dict[str, dict]:
    """Bulk-read the per-ticker institutional cache as {ticker: payload}.

    ``fresh_only`` restricts to rows inside INSTITUTIONS_CACHE_TTL. The nightly
    refresh wants that (it only refetches what has gone stale); serving wants
    everything, since a stale 13F snapshot still beats showing nothing.
    """
    out: dict[str, dict] = {}
    try:
        res = (
            supabase.table("institutional_holders_cache")
            .select("ticker, payload, fetched_at")
            .execute()
        )
    except Exception as e:
        logger.info("Bulk institutions cache read failed: %s", e)
        return out
    for row in res.data or []:
        if fresh_only and not cache_is_fresh(row, INSTITUTIONS_CACHE_TTL):
            continue
        out[row["ticker"]] = row.get("payload") or {}
    return out


def refresh_institutions_cache(assets: list[dict]) -> dict:
    """Refetch institutional ownership for every tracked asset whose cache row is
    missing or stale. Blocking and slow (one yfinance call per ticker), so this
    belongs in the nightly job, never in a request.

    Splitting this out is what lets ``build_fund_holdings`` be a pure in-memory
    aggregation: previously the /api/funds handler did these fetches inline, so
    the first request after the weekly TTL expired paid for the whole pool. That
    cost now grows every night the discovery agent adds tickers.
    """
    fresh = read_all_institutions_cache(fresh_only=True)
    refreshed, failed = 0, 0
    for asset in assets:
        ticker = (asset.get("ticker") or "").upper()
        if not ticker or ticker in fresh:
            continue
        try:
            write_institutions_cache(ticker, fetch_institutional(ticker))
            refreshed += 1
        except Exception as e:
            logger.info("Institutional refresh failed for %s: %s", ticker, e)
            failed += 1
    return {"refreshed": refreshed, "failed": failed, "already_fresh": len(fresh)}


def build_fund_holdings(assets: list[dict]) -> list[dict]:
    """Invert per-ticker institutional data into per-fund holdings across the given
    tracked assets ([{ticker, universe}, ...]).

    Scoped to the companies we cover, so a fund's positions here are only in our
    tracked assets, not its whole portfolio. Pure aggregation over whatever the
    institutional cache already holds: tickers with no cached row are skipped
    rather than fetched, so this is fast and safe to run inside a request.
    ``refresh_institutions_cache`` (nightly) is what fills the cache.

    Returns funds sorted by total value held, each with its positions (biggest
    first).
    """
    cache = read_all_institutions_cache()

    funds: dict[str, dict] = {}
    for asset in assets:
        ticker = (asset.get("ticker") or "").upper()
        if not ticker:
            continue
        payload = cache.get(ticker)
        if payload is None:
            continue  # not fetched yet; the nightly refresh will pick it up
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
    # Descriptions are attached by with_descriptions() at serve time, not baked
    # into the cached payload, so a blurb generated after this build still shows.
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


# ── Cross-company activity (the Whale Watching landing page) ──────────────────

# How many insider dealings the feed carries. Enough to scroll, small enough that
# the payload stays light.
ACTIVITY_FEED_LIMIT = 40
# A discovered company counts as "new" for this long after it first entered.
NEW_COMPANY_DAYS = 7

# SEC transaction codes for trades made on the open market: P is a purchase, S a
# sale. Only these reflect a decision to buy or sell at the going price.
#
# The headline tiles are restricted to them because the raw feed is dominated by
# mechanical events. Musk's largest TSLA rows are an option exercise (code M) of
# 304M shares and the tax withholding on it (code F), the same event twice, each
# worth about $7bn. Ranked by value alone they would present as the biggest
# insider buy and the biggest insider sell we have ever seen, and neither is a
# trade. The per-company panel already labels these natures; the tiles have no
# room for a caveat, so they exclude them instead.
OPEN_MARKET_CODES = {"P", "S"}


ACTIVE_ASSET_COLUMNS = "ticker, name, universe, origin, first_discovered_at, description"


def read_active_assets() -> list[dict]:
    """The assets whale watching should show: active, and not currently benched.

    The discovery agent soft-retires and quarantines rows rather than deleting
    them (migration 009), so an unfiltered read of ``assets`` keeps surfacing
    companies the agent has already dropped. Every whale-watching read goes
    through here so that cannot happen in one place and not another.
    """
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        res = (
            supabase.table("assets")
            .select(ACTIVE_ASSET_COLUMNS)
            .eq("is_active", True)
            .or_(f"quarantined_until.is.null,quarantined_until.lt.{now}")
            .order("ticker")
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.info("Active assets read failed: %s", e)
        return []


def _read_all_insider_cache() -> dict[str, list]:
    """Bulk-read every cached insider row as {ticker: transactions}."""
    try:
        res = (
            supabase.table("insider_transactions_cache")
            .select("ticker, transactions")
            .execute()
        )
    except Exception as e:
        logger.info("Bulk insider cache read failed: %s", e)
        return {}
    return {
        row["ticker"]: (row.get("transactions") or [])
        for row in (res.data or [])
        if row.get("ticker")
    }


def _median(sorted_values: list[float]) -> float:
    """Median of an already-sorted, non-empty list."""
    n = len(sorted_values)
    mid = n // 2
    if n % 2:
        return sorted_values[mid]
    return (sorted_values[mid - 1] + sorted_values[mid]) / 2


def _days_since(iso_value) -> Optional[int]:
    if not iso_value:
        return None
    try:
        when = datetime.datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=datetime.timezone.utc)
    return (datetime.datetime.now(datetime.timezone.utc) - when).days


def build_activity_overview(assets: list[dict]) -> dict:
    """Aggregate the per-ticker whale caches into one cross-company view.

    This is what the landing page needs and the old drill-down could not give:
    what is happening across every tracked company at once, without picking a
    ticker first. Pure aggregation over caches other endpoints already fill, so
    it makes no external calls and adds no cache of its own.

    ``assets`` is the active pool ([{ticker, name, universe, origin,
    first_discovered_at}, ...]); anything outside it is ignored, which is what
    keeps retired tickers out of the feed.
    """
    by_ticker = {
        (a.get("ticker") or "").upper(): a for a in assets if a.get("ticker")
    }
    insider_by_ticker = _read_all_insider_cache()
    institutions = read_all_institutions_cache()

    # ── Feed: every insider dealing across the pool, most recently filed first ──
    feed: list[dict] = []
    for ticker, transactions in insider_by_ticker.items():
        asset = by_ticker.get(ticker)
        if asset is None:
            continue
        for txn in transactions:
            feed.append({
                "ticker": ticker,
                "company": asset.get("name"),
                "universe": asset.get("universe"),
                "name": txn.get("name"),
                "role": txn.get("role"),
                "type": txn.get("type"),
                "shares": txn.get("shares"),
                "value": txn.get("value"),
                "transaction_date": txn.get("transaction_date"),
                "filing_date": txn.get("filing_date"),
                "transaction_code": txn.get("transaction_code"),
            })
    feed.sort(
        key=lambda t: (t.get("filing_date") or t.get("transaction_date") or ""),
        reverse=True,
    )

    # ── Highlights: the single largest open-market move in each direction ──────
    def _largest(kind: str) -> Optional[dict]:
        scored = [
            t
            for t in feed
            if t["type"] == kind
            and (t.get("value") or 0) > 0
            and (t.get("transaction_code") or "").strip().upper() in OPEN_MARKET_CODES
        ]
        return max(scored, key=lambda t: t["value"]) if scored else None

    # Institutional accumulation: how much a company's reporting funds changed
    # their stake at the last filing.
    #
    # Median, not mean: pct_change is per holder and the distribution is wildly
    # skewed. ENPH's ten holders report [8.24, 1.0, 1.0, 0.85, 0.17, 0.11, 0.03,
    # 0.01, -0.02, -0.27] — the mean is +111%, carried entirely by one fund that
    # went from a token position to a real one, while the median +14% is what the
    # typical holder actually did.
    accumulation: list[dict] = []
    for ticker, payload in institutions.items():
        asset = by_ticker.get(ticker)
        if asset is None:
            continue
        changes = sorted(
            h["pct_change"]
            for h in (payload.get("holders") or [])
            if h.get("pct_change") is not None
        )
        if not changes:
            continue
        accumulation.append({
            "ticker": ticker,
            "company": asset.get("name"),
            "universe": asset.get("universe"),
            "median_pct_change": _median(changes),
            "holders": len(changes),
        })
    accumulation.sort(key=lambda a: a["median_pct_change"], reverse=True)

    new_companies = [
        {
            "ticker": a.get("ticker"),
            "company": a.get("name"),
            "universe": a.get("universe"),
            "first_discovered_at": a.get("first_discovered_at"),
        }
        for a in assets
        if a.get("origin") == "discovered"
        and (_days_since(a.get("first_discovered_at")) or 999) <= NEW_COMPANY_DAYS
    ]

    return {
        "feed": feed[:ACTIVITY_FEED_LIMIT],
        "highlights": {
            "biggest_buy": _largest("buy"),
            "biggest_sell": _largest("sell"),
            "most_accumulated": accumulation[0] if accumulation else None,
            "most_reduced": accumulation[-1] if accumulation else None,
        },
        "counts": {
            "companies": len(by_ticker),
            "transactions": len(feed),
            "new_companies": len(new_companies),
            "companies_with_insider_data": sum(
                1 for t in insider_by_ticker if t in by_ticker
            ),
        },
        "new_companies": new_companies,
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
