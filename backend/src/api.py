import os
import asyncio
import datetime
import logging
import secrets
from typing import List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# REMOVED: from src.orchestration.langgraph_orchestrator import run_analysis
from src.utils.supabase_client import (
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, supabase,
    create_ai_run, acquire_ai_run, update_ai_run_status,
    fetch_price_at_run_in_zar, fetch_fx_rate_to_zar,
)
from src.utils import whale_watching as ww

# Configure the ROOT logger, once, at import.
#
# Nothing configured it before, so every module logger fell through to Python's
# handler of last resort, which emits WARNING and above and nothing else. That is
# why the collectors have been silent in Cloud Run: their progress lines are INFO
# and were being dropped before they ever reached stdout. `force=True` because
# the server may have installed its own root handlers first, and without it
# basicConfig would quietly do nothing.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    force=True,
)

logger = logging.getLogger("alpha-api")
app = FastAPI(title="AlphaSwarm API")

# Shared secret that Cloud Scheduler presents to trigger the nightly run. Unset
# in local dev; the endpoint 503s until it's configured on Cloud Run.
DAILY_RUN_SECRET = os.getenv("DAILY_RUN_SECRET")
# Only refresh users whose last run is within this many days.
DAILY_ACTIVE_DAYS = int(os.getenv("DAILY_ACTIVE_DAYS", "7"))
# How far back the backfill looks for tickers worth having a chart for: anything that
# reached someone's ranked feed this recently.
BACKFILL_RECENT_DAYS = int(os.getenv("SOCIAL_BACKFILL_RECENT_DAYS", "3"))
# How far back the intraday tick looks for tickers worth topping up. Tighter than the
# backfill's window: a tick is filling in the bar somebody is looking at right now, and a
# name that has not been ranked since the day before yesterday is not that name.
TICK_RECENT_DAYS = int(os.getenv("SOCIAL_TICK_RECENT_DAYS", "1"))

_social_history_instance = None
_social_backfiller_instance = None
_news_history_instance = None
_social_ticker_instance = None
_day_summaries_instance = None


def _social_history():
    """The social history reader, built once on first use.

    Imported lazily, as the discovery and batch entry points are, so a cold start does
    not pay for the sentiment stack before a request asks for it.
    """
    global _social_history_instance
    if _social_history_instance is None:
        from src.utils.ss_daily import SocialHistory

        _social_history_instance = SocialHistory()
    return _social_history_instance


def _news_history():
    """The news history reader, built once on first use. Lazy for the same reason."""
    global _news_history_instance
    if _news_history_instance is None:
        from src.utils.ns_daily import NewsHistory

        _news_history_instance = NewsHistory()
    return _news_history_instance


def _social_backfiller():
    """The backwards walker, built once on first use.

    Deliberately reachable only from here: a scheduler endpoint and a GET on the asset
    page. Nothing in the analysis run may hold one of these.
    """
    global _social_backfiller_instance
    if _social_backfiller_instance is None:
        from src.utils.ss_backfill import SocialBackfiller

        _social_backfiller_instance = SocialBackfiller(history=_social_history())
    return _social_backfiller_instance


def _social_ticker():
    """The intraday top-up, built once on first use.

    Shares the history reader with the backfill, and through it the seed registry, so a
    tick and a lazy seed landing on one ticker collapse into a single walk rather than two
    against the same rate limiter.
    """
    global _social_ticker_instance
    if _social_ticker_instance is None:
        from src.utils.ss_tick import SocialTicker

        _social_ticker_instance = SocialTicker(history=_social_history())
    return _social_ticker_instance


def _day_summaries():
    """The generated day summaries, built once on first use.

    Holds a Groq client, which is the main reason this is lazy rather than a module level
    object: a deployment with summaries switched off should never construct one.
    """
    global _day_summaries_instance
    if _day_summaries_instance is None:
        from src.utils.day_summary import DaySummaryService

        _day_summaries_instance = DaySummaryService(
            history=_social_history(), news_history=_news_history()
        )
    return _day_summaries_instance


_allowed = os.getenv("API_CORS_ORIGINS", "http://localhost:5173")
origins = [u.strip() for u in _allowed.split(",") if u.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Funds catalogue ----------------------------------------------------------
# South African unit trusts and JSE-listed ETFs, matched to the onboarding
# profile from published fact sheets. Off unless FUNDS_ENABLED is set: with the
# flag off nothing beyond the flag module is imported and /api/fund-catalogue
# 404s, so merging this changes no behaviour.
#
# Note the path. /api/funds already exists further down and returns 13F
# institutional holdings — somebody else's holdings, not something to invest in.
from src.funds.config import FUNDS_ENABLED  # noqa: E402

if FUNDS_ENABLED:
    from src.funds.routes import mount_fund_catalogue  # noqa: E402

    # Log what happened, not what was attempted. Note that this Starlette
    # version records an included router as one entry in `app.routes` rather
    # than copying each path in, so the four funds paths are not visible there
    # even when they are served — check the responses, not the route list.
    if mount_fund_catalogue(app):
        logger.info("Funds catalogue mounted at /api/fund-catalogue")
    else:
        logger.warning("FUNDS_ENABLED is set but the funds catalogue did not mount")

    # The maintenance surface, behind the same flag and the usual admin check.
    from src.funds.admin_routes import mount_fund_catalogue_admin  # noqa: E402

    if mount_fund_catalogue_admin(app):
        logger.info("Funds catalogue admin mounted at /api/admin/fund-catalogue")
    else:
        logger.warning("FUNDS_ENABLED is set but the funds admin did not mount")


# --- Orphaned-run guard -------------------------------------------------------
# An interactive analysis runs as a fire-and-forget background task after the API
# has already returned its run_id. If the container is replaced (deploy, scale-
# down, crash) before that task finishes, the ai_runs row is left at 'running'
# forever and the dashboard — which reads ai_runs.status straight from Supabase —
# polls it indefinitely. These helpers heal such orphans by failing any run that
# has been 'running' past the timeout.
STALE_RUN_MINUTES = 15


def _is_run_stale(created_at) -> bool:
    if not created_at:
        return False
    try:
        started = datetime.datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    return datetime.datetime.now(datetime.timezone.utc) - started > datetime.timedelta(minutes=STALE_RUN_MINUTES)


def _fail_stale_running_runs() -> int:
    """Mark every ai_run stuck in 'running' past the timeout as 'failed'. Returns
    how many were healed. Best-effort — a DB error is logged, never raised."""
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(minutes=STALE_RUN_MINUTES)
    ).isoformat()
    try:
        res = (
            supabase.table("ai_runs")
            .update({"status": "failed"})
            .eq("status", "running")
            .lt("created_at", cutoff)
            .execute()
        )
        healed = len(res.data or [])
        if healed:
            logger.warning("Startup sweep: marked %d stale 'running' run(s) as failed", healed)
        return healed
    except Exception as e:
        logger.warning("Stale-run sweep failed: %s", e)
        return 0


@app.on_event("startup")
async def _sweep_stale_runs_on_startup() -> None:
    _fail_stale_running_runs()


class StartAnalysisRequest(BaseModel):
    universes: List[str]
    watchlist: Optional[List[str]] = []
    risk_tolerance: Optional[str] = "Moderate"
    expertise_level: Optional[str] = "novice"


@app.get("/api/analysis/fx-rate/usd-zar")
async def usd_zar_fx_rate():
    rate = fetch_fx_rate_to_zar("USD")
    if rate is None:
        raise HTTPException(status_code=503, detail="Unable to load live USD/ZAR exchange rate")

    return {
        "base_currency": "USD",
        "quote_currency": "ZAR",
        "rate": rate,
        "source": "Yahoo Finance",
    }


# Whale watching — insider dealings + institutional ownership. Purely
# informational: never part of the analysis pipeline / Unified Confidence Score.
# All data access, caching and fallback logic lives in the WhaleWatcher facade;
# these handlers only translate a missing-data failure into a 502.

whales = ww.WhaleWatcher()


@app.get("/api/whales/{ticker}")
async def whale_activity(ticker: str):
    """Recent insider dealings for a ticker, via Finnhub (US-listed only).

    Read-through cache: serves the Supabase-cached rows while fresh (< TTL) and
    only refetches when stale. Returns an empty ``transactions`` list (not an
    error) when no API key is configured or the ticker has no coverage.
    """
    try:
        return await whales.insider(ticker)
    except ww.WhaleDataUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/institutions/{ticker}")
async def institutional_ownership(ticker: str):
    """Institutional ownership for a ticker, via yfinance. Read-through cache with
    a 7-day TTL (13F data only changes quarterly)."""
    try:
        return await whales.institutional(ticker)
    except ww.WhaleDataUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/funds")
async def top_funds():
    """Institutional data inverted to per-fund holdings across all tracked assets
    (for the Top Funds / Notable Investors views).

    Weekly read-through cache. A miss is still cheap because the rebuild is pure
    aggregation over the institutional cache, which the nightly job warms; this
    request never calls yfinance.

    Scoped to active assets, so tickers the discovery agent has retired or
    benched no longer contribute holdings.
    """
    try:
        return await whales.funds()
    except ww.WhaleDataUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/analysis/start")
async def start_analysis(
    req: StartAnalysisRequest,
    authorization: Optional[str] = Header(None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = authorization.split(" ", 1)[-1]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY
            },
            timeout=10.0
        )
    if resp.status_code != 200:
        logger.warning("Supabase token validation failed: %s", resp.text)
        raise HTTPException(status_code=401, detail="Invalid Supabase token")

    user_info = resp.json() or {}
    user_id = user_info.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unable to determine user id from token")

    # Claim the run atomically. If an analysis is already in flight for this user,
    # return THAT run instead of starting a second pipeline: the frontend polls
    # whatever run_id it receives, so this is transparent to it, and it stops the
    # duplicate work that was costing double API spend (two runs seen 26ms apart).
    run_id, acquired = acquire_ai_run(user_id)
    if not run_id:
        raise HTTPException(status_code=503, detail="Could not start an analysis run")
    if not acquired:
        logger.info("Analysis already running for user %s; returning run %s", user_id, run_id)
        return {"run_id": run_id, "already_running": True}

    async def _bg_job():
        try:
            # ---> METHOD 1 FIX: LAZY IMPORT <---
            # This ensures LangGraph/LangChain only loads when a user actually starts an analysis,
            # allowing Gunicorn/Uvicorn to boot up and bind to the port instantly.
            from src.orchestration.langgraph_orchestrator import run_analysis
            
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                run_analysis,
                user_id,
                req.risk_tolerance,
                req.universes,
                req.watchlist,
                run_id,
                req.expertise_level,
            )
            update_ai_run_status(run_id, "complete")
            logger.info("Analysis finished for run %s", run_id)
            return result
        except Exception as e:
            logger.exception("Background analysis failed for run %s: %s", run_id, e)
            update_ai_run_status(run_id, "failed")

    asyncio.create_task(_bg_job())

    return {"run_id": run_id}


@app.get("/api/analysis/status/{run_id}")
async def analysis_status(run_id: str):
    resp = supabase.table("ai_runs").select("id, status, created_at").eq("id", run_id).execute()
    data = resp.data or []
    if not data:
        raise HTTPException(status_code=404, detail="run not found")
    row = data[0]
    # Heal an orphaned run this poll happens to catch: a run still 'running' past
    # the timeout was abandoned, so report (and persist) it as failed.
    if row.get("status") == "running" and _is_run_stale(row.get("created_at")):
        update_ai_run_status(run_id, "failed")
        row["status"] = "failed"
    return row


@app.get("/api/analysis/result/{run_id}")
async def analysis_result(run_id: str):
    recs = supabase.table("ai_recommendation").select("*").eq("run_id", run_id).order("rank", desc=False).limit(5).execute()
    rec_rows = recs.data or []
    if not rec_rows:
        return {"top_5": [], "message": "no results yet"}
    
    assets = supabase.table("assets").select("*").execute()
    asset_map = {a["ticker"]: a for a in (assets.data or [])}
    
    top_5 = []
    for rec in rec_rows[:5]:
        asset = asset_map.get(rec.get("ticker"), {})
        # Prefer the snapshot price stored on the recommendation (price_at_run), fallback to current asset price
        price_at_run = rec.get("price_at_run") or asset.get("current_price")
        top_5.append({
            "ticker": rec.get("ticker"),
            "rank": rec.get("rank"),
            "confidence_score": rec.get("confidence_score"),
            "fundamentals_score": rec.get("fundamentals_score"),
            "sentiment_score": rec.get("sentiment_score"),
            "name": asset.get("name"),
            "current_price": price_at_run,
        })
    return {"top_5": top_5}



STALE_DAYS = 4  # matches the 4-day staleness window in the design notes

@app.get("/api/assets/{ticker}/refresh")
async def refresh_asset_cache(ticker: str):
    """Refresh the cached price for a single asset.

    Called when a user views an asset's details page. Respects a 4-day
    staleness window — yfinance is only called when the cache is actually old,
    so frequent page views don't hammer the external API.
    """
    ticker = ticker.upper()

    # 1. Look up current cache state
    result = supabase.table("assets").select("id, ticker, name, current_price, last_updated, universe") \
        .eq("ticker", ticker).maybe_single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail=f"Asset {ticker} not found in database")

    asset = result.data
    last_updated_raw = asset.get("last_updated")

    # 2. Check staleness
    is_stale = True
    age_days = None
    if last_updated_raw:
        try:
            lu = datetime.datetime.fromisoformat(last_updated_raw.replace("Z", "+00:00"))
            age_days = (datetime.datetime.now(datetime.timezone.utc) - lu).days
            is_stale = age_days >= STALE_DAYS
        except ValueError:
            pass  # treat as stale if timestamp is unparseable

    if not is_stale:
        return {
            "ticker": ticker,
            "current_price": asset.get("current_price"),
            "last_updated": last_updated_raw,
            "age_days": age_days,
            "refreshed": False,
            "message": f"Cache is fresh ({age_days}d old)",
        }

    # 3. Fetch fresh price via yfinance (ZAR-converted)
    try:
        fresh_price = fetch_price_at_run_in_zar(ticker)
    except Exception as exc:
        logger.warning("yfinance price fetch failed for %s: %s", ticker, exc)
        fresh_price = None

    if fresh_price is None:
        return {
            "ticker": ticker,
            "current_price": asset.get("current_price"),
            "last_updated": last_updated_raw,
            "refreshed": False,
            "message": "Could not fetch fresh price from market data",
        }

    # 4. Persist updated price
    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000000+00:00")
    supabase.table("assets").update({
        "current_price": round(fresh_price, 4),
        "last_updated": now,
    }).eq("ticker", ticker).execute()

    logger.info("Refreshed cache for %s: R%.2f (was %dd old)", ticker, fresh_price, age_days or 0)

    return {
        "ticker": ticker,
        "current_price": round(fresh_price, 4),
        "last_updated": now,
        "age_days": age_days,
        "refreshed": True,
        "message": f"Price refreshed from market data",
    }


# Yahoo exchange codes for venues that quote in US dollars. Read off live search
# responses rather than remembered: NASDAQ answers as both NMS and NGM, NYSE as
# NYQ, its ETF venue as PCX, and the US over-the-counter market as PNK, OQB and
# OQX. NCM and ASE are the remaining NASDAQ and NYSE American tiers.
#
# Everything else is a foreign listing, and the reason to exclude those is not
# tidiness. Adding one to a watchlist puts its ticker into the next analysis run,
# where the quantitative phase would price a rand-cent JSE quote as dollars and
# the sentiment phase would find no coverage for it. A JSE fund belongs in the
# funds catalogue, which reads published fact sheets instead of guessing.
#
# US over-the-counter venues are IN deliberately. They are how a name like
# Naspers is reachable at all, they are quoted in dollars, and a user searching
# for one and adding it is a deliberate act. That is different from the discovery
# agent, which excludes over-the-counter names when choosing what to analyse
# unprompted.
US_EXCHANGE_CODES = frozenset({"NMS", "NGM", "NCM", "NYQ", "ASE", "PCX", "BTS", "PNK", "OQB", "OQX"})

# Instruments we can price and analyse. Crypto, futures and indices are dropped.
SEARCHABLE_QUOTE_TYPES = frozenset({"EQUITY", "ETF"})

# How many results the search returns.
SEARCH_RESULT_LIMIT = 6


def _is_us_listed(quote: dict) -> bool:
    """Whether a Yahoo search hit is quoted on a US venue.

    Two checks rather than one. The exchange code is the real test; the absence
    of a suffix in the symbol is the backstop, because a venue code we have
    never seen would otherwise pass. Every foreign listing Yahoo returns carries
    one (``STX40.JO``, ``AAL.L``, ``SXR8.DE``), and no US symbol does — Yahoo
    writes share classes with a hyphen, as in ``BRK-B``.
    """
    if (quote.get("exchange") or "").upper() not in US_EXCHANGE_CODES:
        return False
    return "." not in (quote.get("symbol") or "")


def _filter_search_quotes(quotes: list[dict]) -> list[dict]:
    """Keep US-listed equities and ETFs, then take the first few.

    Filtering before the slice matters: applied afterwards it would first fill
    the six slots with foreign listings and then discard them, returning fewer
    results than exist.
    """
    keep = [
        row
        for row in quotes
        if (row.get("quoteType") or "").upper() in SEARCHABLE_QUOTE_TYPES and _is_us_listed(row)
    ]
    return keep[:SEARCH_RESULT_LIMIT]


@app.get("/api/assets/search")
async def search_assets(q: str = ""):
    """Fully live asset search via Yahoo Finance search API.

    Accepts any company name or ticker (e.g. 'Apple', 'NVDA', 'Eskom').
    Not limited to assets already in the database.
    Prices are fetched live from yfinance and converted to ZAR.
    """
    import yfinance as yf

    q = q.strip()
    if not q:
        return {"results": []}

    # 1 — Yahoo Finance search: returns matching tickers for any name/symbol
    quotes: list[dict] = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://query2.finance.yahoo.com/v1/finance/search",
                params={
                    "q":               q,
                    "quotesCount":     8,
                    "newsCount":       0,
                    "enableFuzzyQuery": False,
                },
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=6.0,
            )
        if resp.status_code == 200:
            quotes = resp.json().get("quotes", [])
    except Exception as exc:
        logger.warning("Yahoo Finance search failed for %s: %s", q, exc)

    quotes = _filter_search_quotes(quotes)

    if not quotes:
        return {"results": []}

    # 2 — Fetch live price + ZAR conversion for each result (parallel)
    loop = asyncio.get_running_loop()

    def _price_zar(ticker: str) -> float:
        try:
            fi = yf.Ticker(ticker).fast_info
            price = getattr(fi, "last_price", None)
            if not price:
                return 0.0
            currency = str(getattr(fi, "currency", "") or "").upper()
            multiplier = 1.0
            if currency and currency not in ("ZAR", ""):
                if currency in ("ZAC", "ZA CENT", "ZACP"):
                    multiplier = 0.01
                else:
                    try:
                        rate = yf.Ticker(f"{currency}ZAR=X").fast_info.last_price
                        if rate:
                            multiplier = float(rate)
                    except Exception:
                        pass
            return round(float(price) * multiplier, 2)
        except Exception:
            return 0.0

    prices = await asyncio.gather(*[
        loop.run_in_executor(None, _price_zar, row.get("symbol", ""))
        for row in quotes
    ])

    # 3 — Check assets table for universe/category (best-effort, not required)
    tickers = [row.get("symbol", "") for row in quotes]
    db_rows = supabase.table("assets").select("ticker, id, universe") \
        .in_("ticker", tickers).execute()
    db_map = {r["ticker"]: r for r in (db_rows.data or [])}

    results = []
    for row, price in zip(quotes, prices):
        ticker = row.get("symbol", "")
        if not ticker:
            continue
        db = db_map.get(ticker, {})
        results.append({
            "ticker":        ticker,
            "name":          row.get("longname") or row.get("shortname") or ticker,
            "current_price": price,
            "universe":      db.get("universe", ""),
            "exchange":      row.get("exchange", ""),
            "asset_id":      db.get("id"),
            "source":        "live",
        })

    return {"results": results}


@app.get("/api/assets/{ticker}/history")
async def get_price_history(ticker: str):
    """Return up to 14 days of daily closing prices in ZAR for sparkline display."""
    import yfinance as yf

    try:
        t = yf.Ticker(ticker.upper())
        hist = t.history(period="14d", interval="1d", auto_adjust=False)

        if hist.empty:
            return {"ticker": ticker.upper(), "closes": [], "dates": []}

        closes = hist["Close"].dropna().tolist()
        dates  = [str(d.date()) for d in hist.index]

        # Detect currency and convert to ZAR
        currency = ""
        try:
            currency = str(t.fast_info.currency or "").upper()
        except Exception:
            pass

        multiplier = 1.0
        if currency and currency not in ("ZAR", ""):
            if currency in ("ZAC", "ZA CENT", "ZACP"):
                multiplier = 0.01
            else:
                try:
                    fx = yf.Ticker(f"{currency}ZAR=X")
                    rate = fx.fast_info.last_price
                    if rate:
                        multiplier = float(rate)
                except Exception:
                    pass  # leave multiplier as 1.0

        zar_closes = [round(c * multiplier, 2) for c in closes]

        return {
            "ticker":  ticker.upper(),
            "closes":  zar_closes,
            "dates":   dates,
            "currency": "ZAR",
        }

    except Exception as exc:
        logger.warning("Price history fetch failed for %s: %s", ticker, exc)
        return {"ticker": ticker.upper(), "closes": [], "dates": []}


@app.get("/api/sentiment/last-updated")
async def get_sentiment_last_updated_endpoint():
    """When sentiment data was last written, for the assets header.

    Informational and unauthenticated, like the endpoints around it. "Last AI run" on
    that header used to be the only freshness figure on the page, and it stopped being a
    sufficient one the day the intraday tick shipped: a run can be many hours old while
    the sentiment behind its recommendations was topped up an hour ago, and the header
    had no way to say so. Global across every ticker, not scoped to the caller's own, for
    the reasons in ``get_sentiment_last_updated``'s docstring.
    """
    loop = asyncio.get_running_loop()
    from src.utils.supabase_client import get_sentiment_last_updated

    try:
        updated_at = await loop.run_in_executor(None, get_sentiment_last_updated)
    except Exception as exc:
        logger.warning("Sentiment last-updated fetch failed: %s", exc)
        updated_at = None
    return {"updated_at": updated_at}


@app.get("/api/assets/{ticker}/sentiment-history")
async def get_sentiment_history(ticker: str, days: int = 7):
    """The daily social sentiment series for a ticker.

    Informational and unauthenticated, mirroring the price history endpoint above.
    Reads rows the runs already wrote, so it never calls StockTwits on the way to a
    response and never waits on an AI run.

    Every day in the window comes back, weekends included. A day with no row carries a
    null score and a zero count, which the chart draws as a gap: a null and a zero mean
    opposite things here, and drawing silence as a crash to zero was the single most
    misleading thing the first version of this chart did.

    A ticker nobody has ever walked gets its history filled in AFTER this response has
    gone out, not before. The walk takes a few seconds and would be the only slow thing
    on the page if it were awaited; instead the chart shows its building state and has
    the full window on the next poll. The one thing that must never happen is this walk
    moving onto a path someone waits on, which is what the reverted build did by putting
    it inside the analysis run.
    """
    symbol = ticker.upper()
    window = max(1, min(days, 30))
    loop = asyncio.get_running_loop()

    try:
        points = await loop.run_in_executor(
            None, _social_history().history, symbol, window
        )
    except Exception as exc:
        logger.warning("Sentiment history fetch failed for %s: %s", symbol, exc)
        return {"ticker": symbol, "points": [], "seeding": False}

    # News is merged onto the days social already laid out, never allowed to define them.
    # One side owns the window or the two drift apart, and social owns it because it is
    # the series that pads its own quiet days.
    #
    # A failure here costs the news line and nothing else: the social points are already
    # in hand, and returning them without news is exactly what an older client gets
    # anyway. That is the whole reason this is a second try block rather than one.
    try:
        news_history = _news_history()
        if news_history.enabled:
            news_rows = await loop.run_in_executor(
                None, news_history.history, symbol, window
            )
            points = [
                {**point, **news_history.point(news_rows.get(point["date"]))}
                for point in points
            ]
    except Exception as exc:
        logger.info("News history merge failed for %s: %s", symbol, exc)

    # Scheduled, not awaited. create_task queues the walk on the event loop and this
    # handler returns immediately; the loop only picks the task up once the response is
    # on its way, which is the same fire and forget shape start_analysis uses.
    seeding = False
    try:
        backfiller = _social_backfiller()
        if backfiller.enabled:
            walked = await loop.run_in_executor(
                None, backfiller.history.is_seeded, symbol
            )
            if not walked:
                asyncio.create_task(_seed_job(symbol))
                seeding = True
    except Exception as exc:
        logger.info("Seed check failed for %s: %s", symbol, exc)

    return {"ticker": symbol, "points": points, "seeding": seeding}


async def _seed_job(symbol: str) -> None:
    try:
        loop = asyncio.get_running_loop()
        rows = await loop.run_in_executor(None, _social_backfiller().seed_one, symbol)
        logger.info("Lazy seed for %s wrote %d day rows", symbol, rows)
    except Exception as exc:
        logger.warning("Lazy seed for %s failed: %s", symbol, exc)


@app.get("/api/assets/{ticker}/sentiment-summary")
async def get_sentiment_summary(ticker: str, day: str):
    """The generated paragraph for one day of one ticker's chart.

    Informational and unauthenticated, like the history endpoint it sits beside. Reads a
    stored summary and returns it; generates one only when there is nothing stored, or
    when the day is still open and both the cooldown and the evidence say the stored one
    has been overtaken. A settled day is generated once and never again, which is what
    lets a reader click back and forth across a week for the price of that week.

    ``summary`` comes back null for every uninteresting reason there is: summaries
    switched off, a day outside the window, a day nothing was collected on, Groq
    unconfigured, generation failed. The panel renders the same quiet fallback for all of
    them, because to a reader they are the same thing and none is an error.

    Synchronous, unlike the seed the history endpoint fires. A seed is a thirty page walk
    nobody asked for; this is one short completion behind an explicit click, and a click
    that shows a spinner for two seconds is a better trade than one that returns empty and
    fills in later.
    """
    symbol = ticker.upper()
    try:
        datetime.date.fromisoformat(day)
    except ValueError:
        raise HTTPException(status_code=400, detail="day must be YYYY-MM-DD")

    loop = asyncio.get_running_loop()
    try:
        point = await loop.run_in_executor(
            None, _day_summaries().summary_for, symbol, day
        )
    except Exception as exc:
        logger.warning("Day summary failed for %s %s: %s", symbol, day, exc)
        point = None

    if point is None:
        return {
            "ticker": symbol,
            "day": day,
            "summary": None,
            "is_final": False,
            "generated_at": None,
        }
    return {"ticker": symbol, **point}


@app.post("/api/social/tick")
async def social_tick(x_daily_run_secret: Optional[str] = Header(None)):
    """Top up today's social row for recently ranked tickers, during market hours.

    Two Cloud Scheduler jobs on America/New_York time, weekdays only: just after the open
    and again at midday. The timezone rather than UTC because the open moves an hour twice
    a year and a tick that has drifted off the open is a tick that misses the loudest part
    of the session.

    This exists because today's bar is otherwise empty until 22:00 UTC. The nightly writes
    the day that has just ended, so the day a reader is actually looking at has nothing in
    it for most of the time they are looking.

    Deliberately not the backfill on a second schedule. That job walks thirty pages back
    over seven days and writes in replace mode, and its pending() would find nothing to do
    anyway, since every ticker it would consider was seeded the night it appeared.

    Overlapping anything else is harmless. This writes only social_sentiment_daily, through
    the same accumulate RPC a run uses, which merges under a row lock.
    """
    if not DAILY_RUN_SECRET:
        raise HTTPException(status_code=503, detail="Tick not configured")
    if not x_daily_run_secret or not secrets.compare_digest(
        x_daily_run_secret, DAILY_RUN_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid daily run secret")

    loop = asyncio.get_running_loop()
    from src.utils.supabase_client import get_recently_ranked_tickers

    try:
        tickers = await loop.run_in_executor(
            None, get_recently_ranked_tickers, TICK_RECENT_DAYS
        )
    except Exception as exc:
        logger.warning("Tick could not list recently ranked tickers: %s", exc)
        return {"ok": False, "error": str(exc), "walked": 0}

    try:
        summary = await loop.run_in_executor(None, _social_ticker().tick, tickers, None)
        return {"ok": True, **summary}
    except Exception as exc:
        logger.warning("Tick failed: %s", exc)
        return {"ok": False, "error": str(exc), "walked": 0}


@app.post("/api/sentiment/summaries")
async def sentiment_summaries(x_daily_run_secret: Optional[str] = Header(None)):
    """Fill in and settle day summaries for tickers people have actually opened.

    Its own Cloud Scheduler job at 00:30 UTC, after the 22:00 nightly and the 23:00
    backfill have both written the day that just closed. Half past midnight rather than
    half eleven so the day being settled is genuinely over: run an hour earlier and
    yesterday would sit marked "so far today" until the following night.

    Only tickers that already have a stored summary, which is the entire cost control. A
    name with no row is a name nobody has opened, and generating a week of prose against
    the chance that somebody might is how a lazy feature turns into a nightly bill.
    """
    if not DAILY_RUN_SECRET:
        raise HTTPException(status_code=503, detail="Summaries not configured")
    if not x_daily_run_secret or not secrets.compare_digest(
        x_daily_run_secret, DAILY_RUN_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid daily run secret")

    loop = asyncio.get_running_loop()
    from src.utils.supabase_client import get_recently_ranked_tickers

    try:
        tickers = await loop.run_in_executor(
            None, get_recently_ranked_tickers, BACKFILL_RECENT_DAYS
        )
    except Exception as exc:
        logger.warning("Summary top-up could not list recently ranked tickers: %s", exc)
        return {"ok": False, "error": str(exc), "generated": 0}

    try:
        summary = await loop.run_in_executor(None, _day_summaries().top_up, tickers, None)
        return {"ok": True, **summary}
    except Exception as exc:
        logger.warning("Summary top-up failed: %s", exc)
        return {"ok": False, "error": str(exc), "generated": 0}


@app.post("/api/social/backfill")
async def social_backfill(x_daily_run_secret: Optional[str] = Header(None)):
    """Fill in social history for tickers that have never been walked.

    Its own Cloud Scheduler job at 23:00 UTC, an hour AFTER the nightly. That order is
    deliberate: discovery runs at the top of run_daily, so a ticker discovered tonight
    does not exist yet when an earlier job would look for it, and it would sit on one
    bar out of seven until the following night. By 23:00 the batch has written its
    recommendations and this picks the new names up the same night.

    Overlapping a long nightly is harmless. This writes only social_sentiment_daily,
    and the accumulate RPC merges under a row lock, so a run and a backfill landing on
    the same day cannot lose each other's counts.

    Nothing waits on this, which is the entire reason it can afford a thirty page walk
    where the run is capped at six.
    """
    if not DAILY_RUN_SECRET:
        raise HTTPException(status_code=503, detail="Backfill not configured")
    if not x_daily_run_secret or not secrets.compare_digest(
        x_daily_run_secret, DAILY_RUN_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid daily run secret")

    loop = asyncio.get_running_loop()
    from src.utils.supabase_client import get_recently_ranked_tickers

    try:
        tickers = await loop.run_in_executor(
            None, get_recently_ranked_tickers, BACKFILL_RECENT_DAYS
        )
    except Exception as exc:
        logger.warning("Backfill could not list recently ranked tickers: %s", exc)
        return {"ok": False, "error": str(exc), "seeded": 0}

    try:
        summary = await loop.run_in_executor(
            None, _social_backfiller().backfill, tickers, None
        )
        return {"ok": True, **summary}
    except Exception as exc:
        logger.warning("Backfill failed: %s", exc)
        return {"ok": False, "error": str(exc), "seeded": 0}


@app.post("/api/analysis/run-daily")
async def run_daily(x_daily_run_secret: Optional[str] = Header(None)):
    """Scheduled nightly refresh, triggered by Cloud Scheduler at 22:00 UTC
    (just after the NYSE close). Refreshes every active user's insights so they
    see fresh data without pressing refresh. Guarded by a shared secret.

    For resource efficiency the raw quant + sentiment signals are gathered ONCE
    for the union of all users' tickers (see run_daily_batch), then personalized
    per user. Runs synchronously; failures are isolated per user.
    """
    if not DAILY_RUN_SECRET:
        raise HTTPException(status_code=503, detail="Daily run not configured")
    if not x_daily_run_secret or not secrets.compare_digest(
        x_daily_run_secret, DAILY_RUN_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid daily run secret")

    # Refresh the discovery pool BEFORE the batch reads it — this is the only
    # place discovery runs (the manual run never discovers). Guarded by
    # DISCOVERY_ENABLED so it stays completely inert (module never imported) until
    # the flag is set; a failure here logs and the batch proceeds on the existing
    # pool. Offloaded to a thread since it does external network I/O.
    discovery_summary = None
    if os.getenv("DISCOVERY_ENABLED", "false").lower() == "true":
        try:
            from src.agents.asset_discovery import refresh_discovery

            loop = asyncio.get_running_loop()
            discovery_summary = await loop.run_in_executor(None, refresh_discovery)
            logger.info("Discovery refresh complete: %s", discovery_summary.get("universes"))
        except Exception as e:
            logger.exception("Discovery refresh failed (continuing on existing pool): %s", e)

    # Describe anything the discovery agent added tonight, so a new ticker is
    # never shown as a bare symbol. Best-effort: whale watching is purely
    # informational, so a failure here must never stop the recommendation batch.
    whales_summary = None
    try:
        whales_summary = await whales.refresh_nightly()
        logger.info("Whale data refresh complete: %s", whales_summary)
    except Exception as e:
        logger.exception("Whale data refresh failed (serving existing caches): %s", e)

    from src.utils.supabase_client import get_active_user_ids, get_user_preferences
    from src.orchestration.langgraph_orchestrator import run_daily_batch

    user_ids = get_active_user_ids(DAILY_ACTIVE_DAYS)
    logger.info("Daily run starting for %d active users", len(user_ids))

    # Build the batch: one fresh run row per user with their saved preferences.
    users = []
    skipped = 0
    for user_id in user_ids:
        prefs = get_user_preferences(user_id)
        if not prefs or not prefs.get("universes"):
            logger.info("Daily run skipping user %s (no preferences/universes)", user_id)
            skipped += 1
            continue
        # Respect the same lock as the interactive path: if this user already has an
        # analysis in flight (e.g. they opened the dashboard as the batch started),
        # skip them rather than run a second pipeline over the same tickers.
        run_id, acquired = acquire_ai_run(user_id)
        if not acquired:
            logger.info(
                "Daily run skipping user %s (an analysis is already in flight)", user_id
            )
            skipped += 1
            continue
        users.append(
            {
                "user_id": user_id,
                "run_id": run_id,
                "universes": prefs["universes"],
                "risk_tolerance": prefs["risk_tolerance"],
                "expertise_level": prefs["expertise_level"],
            }
        )

    # Gather raw signals once for the union of tickers, then personalize per user.
    # Offloaded to a thread so the event loop stays responsive during the batch.
    loop = asyncio.get_running_loop()
    batch = await loop.run_in_executor(None, run_daily_batch, users)

    summary = {
        "active_days": DAILY_ACTIVE_DAYS,
        "total": len(user_ids),
        "skipped": skipped,
        "succeeded": batch.get("succeeded", 0),
        "failed": batch.get("failed", 0),
        "unique_tickers": batch.get("tickers", 0),
        "discovery": discovery_summary,
        "whales": whales_summary,
    }
    logger.info("Daily run finished: %s", summary)
    return summary


class DeleteUserRequest(BaseModel):
    user_id: str

class ResetPasswordRequest(BaseModel):
    user_id: str
    email: str

class ToggleUserStatusRequest(BaseModel):
    user_id: str
    is_active: bool

async def _get_user_id_from_bearer(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[-1]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
            },
            timeout=10.0,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Supabase token")

    user_info = resp.json() or {}
    user_id = user_info.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unable to determine user id")
    return user_id

async def _require_admin(requester_id: str):
    """Raise 403 if the given user is not an admin."""
    requester = (
        supabase.table("users")
        .select("role")
        .eq("id", requester_id)
        .maybe_single()
        .execute()
    )
    if (requester.data or {}).get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

@app.post("/api/admin/reset-password")
async def reset_user_password(
    req: ResetPasswordRequest,
    authorization: Optional[str] = Header(None),
):
    """Trigger a password-reset email for a given user (admin only)."""
    requester_id = await _get_user_id_from_bearer(authorization)
    await _require_admin(requester_id)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/generate_link",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
            },
            json={"type": "recovery", "email": req.email},
            timeout=10.0,
        )

    if resp.status_code not in (200, 201):
        logger.warning("Supabase generate_link failed for %s: %s", req.email, resp.text)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to send reset email: {resp.text}",
        )

    return {"ok": True, "message": f"Password reset email sent to {req.email}"}


@app.post("/api/admin/toggle-user-status")
async def toggle_user_status(
    req: ToggleUserStatusRequest,
    authorization: Optional[str] = Header(None),
):
    """Activate or deactivate a user account (admin only).

    Requires the `users` table to have an `is_active BOOLEAN DEFAULT TRUE` column.
    Run migration first: ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    """
    requester_id = await _get_user_id_from_bearer(authorization)
    await _require_admin(requester_id)

    if req.user_id == requester_id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account status")

    # Ban/unban in Supabase Auth so the user cannot log in when inactive.
    # ban_duration="none" lifts the ban; a large duration effectively bans permanently.
    ban_duration = "none" if req.is_active else "876600h"

    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"{SUPABASE_URL}/auth/v1/admin/users/{req.user_id}",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
            },
            json={"ban_duration": ban_duration},
            timeout=10.0,
        )

    if resp.status_code not in (200, 201):
        logger.warning("Supabase ban toggle failed for %s: %s", req.user_id, resp.text)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to update auth status: {resp.text}",
        )

    # Mirror the status in our own users table for easy querying.
    supabase.table("users").update({"is_active": req.is_active}).eq("id", req.user_id).execute()

    action = "activated" if req.is_active else "deactivated"
    return {"ok": True, "is_active": req.is_active, "message": f"User {action} successfully"}

@app.post("/api/account/deactivate")
async def deactivate_own_account(authorization: Optional[str] = Header(None)):
    """Soft-deactivate: flags the account inactive but does NOT ban in Supabase
    Auth, so the user can sign in again to reactivate. Admin deactivation
    (toggle-user-status) applies a hard Auth ban and is not self-reversible."""
    user_id = await _get_user_id_from_bearer(authorization)
    supabase.table("users").update({"is_active": False}).eq("id", user_id).execute()
    return {"ok": True, "message": "Account deactivated"}


@app.post("/api/account/reactivate")
async def reactivate_own_account(authorization: Optional[str] = Header(None)):
    """Reactivate a soft-deactivated account. Fails for admin-banned accounts,
    since those users can't obtain a valid token in the first place."""
    user_id = await _get_user_id_from_bearer(authorization)
    supabase.table("users").update({"is_active": True}).eq("id", user_id).execute()
    return {"ok": True, "message": "Account reactivated"}

@app.post("/api/admin/delete-user")
async def delete_user_admin(
    req: DeleteUserRequest,
    authorization: Optional[str] = Header(None),
):
    requester_id = await _get_user_id_from_bearer(authorization)

    requester = (
        supabase.table("users")
        .select("role")
        .eq("id", requester_id)
        .maybe_single()
        .execute()
    )
    requester_role = (requester.data or {}).get("role")
    if requester_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if req.user_id == requester_id:
        raise HTTPException(status_code=400, detail="Admin cannot delete self")

    try:
        supabase.auth.admin.delete_user(req.user_id)

        supabase.table("user_analysis").delete().eq("user_id", req.user_id).execute()
        supabase.table("users").delete().eq("id", req.user_id).execute()
        
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

        
    