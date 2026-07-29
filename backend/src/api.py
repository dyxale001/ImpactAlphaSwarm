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

from src.utils.supabase_client import (
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, supabase,
    create_ai_run, update_ai_run_status, fetch_price_at_run_in_zar, fetch_fx_rate_to_zar,
)
from src.utils import whale_watching as ww

logger = logging.getLogger("alpha-api")
app = FastAPI(title="AlphaSwarm API")

# Shared secret that Cloud Scheduler presents to trigger the nightly run. Unset
# in local dev; the endpoint 503s until it's configured on Cloud Run.
DAILY_RUN_SECRET = os.getenv("DAILY_RUN_SECRET")
# Only refresh users whose last run is within this many days.
DAILY_ACTIVE_DAYS = int(os.getenv("DAILY_ACTIVE_DAYS", "7"))

_allowed = os.getenv("API_CORS_ORIGINS", "http://localhost:5173")
origins = [u.strip() for u in _allowed.split(",") if u.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
# All data access and caching lives in utils/whale_watching.py; these handlers
# stay thin (read cache → fetch if stale → shape response).


@app.get("/api/whales/{ticker}")
async def whale_activity(ticker: str):
    """Recent insider dealings for a ticker, via Finnhub (US-listed only).

    Read-through cache: serves the Supabase-cached rows while fresh (< TTL) and
    only refetches when stale. Returns an empty ``transactions`` list (not an
    error) when no API key is configured or the ticker has no coverage.
    """
    symbol = ticker.upper()

    cached = ww.read_insider_cache(symbol)
    if cached and ww.cache_is_fresh(cached):
        return ww.insider_cache_payload(symbol, cached)

    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        # No key: serve whatever we cached before, else an honest empty state.
        return ww.insider_cache_payload(symbol, cached) if cached else {"ticker": symbol, "transactions": [], "source": None}

    try:
        transactions, source = await ww.fetch_fresh_insider(symbol, api_key)
    except Exception as e:
        # Network / server error: prefer stale cache over failing the request.
        logger.warning("Finnhub insider fetch failed for %s: %s", symbol, e)
        if cached:
            return ww.insider_cache_payload(symbol, cached)
        raise HTTPException(status_code=502, detail="Unable to load insider transactions")

    fetched_at = ww.write_insider_cache(symbol, transactions, source)
    return {"ticker": symbol, "transactions": transactions, "source": source, "cached": False, "fetched_at": fetched_at}


@app.get("/api/institutions/{ticker}")
async def institutional_ownership(ticker: str):
    """Institutional ownership for a ticker, via yfinance. Read-through cache with
    a 7-day TTL (13F data only changes quarterly)."""
    symbol = ticker.upper()

    cached = ww.read_institutions_cache(symbol)
    if cached and ww.cache_is_fresh(cached, ww.INSTITUTIONS_CACHE_TTL):
        return {"ticker": symbol, **(cached.get("payload") or {}), "cached": True, "fetched_at": cached.get("fetched_at")}

    loop = asyncio.get_running_loop()
    try:
        payload = await loop.run_in_executor(None, ww.fetch_institutional, symbol)
    except Exception as e:
        logger.warning("Institutional fetch failed for %s: %s", symbol, e)
        if cached:
            return {"ticker": symbol, **(cached.get("payload") or {}), "cached": True, "fetched_at": cached.get("fetched_at")}
        raise HTTPException(status_code=502, detail="Unable to load institutional ownership")

    fetched_at = ww.write_institutions_cache(symbol, payload)
    return {"ticker": symbol, **payload, "cached": False, "fetched_at": fetched_at}


@app.get("/api/funds")
async def top_funds():
    """Institutional data inverted to per-fund holdings across all tracked assets
    (for the Top Funds / Notable Investors views). Weekly read-through cache; the
    first build after expiry aggregates every tracked ticker, so it can be slow."""
    cached = ww.read_funds_cache()
    if cached and ww.cache_is_fresh(cached, ww.FUNDS_CACHE_TTL):
        funds = ww.with_descriptions(cached.get("payload") or [])
        return {"funds": funds, "cached": True, "fetched_at": cached.get("fetched_at")}

    assets = supabase.table("assets").select("ticker, universe").execute().data or []
    loop = asyncio.get_running_loop()
    funds = await loop.run_in_executor(None, ww.build_fund_holdings, assets)
    fetched_at = ww.write_funds_cache(funds)
    return {"funds": ww.with_descriptions(funds), "cached": False, "fetched_at": fetched_at}


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

    run_id = create_ai_run(user_id=user_id, status="running")

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

    # Keep equities and ETFs; drop crypto, futures, indices
    allowed = {"EQUITY", "ETF"}
    quotes = [r for r in quotes if r.get("quoteType", "").upper() in allowed][:6]

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
        run_id = create_ai_run(user_id=user_id, status="running")
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

        
    