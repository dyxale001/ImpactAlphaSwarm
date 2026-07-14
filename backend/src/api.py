import os
import asyncio
import logging
import datetime
from typing import List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.utils.supabase_client import (
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, supabase,
    create_ai_run, update_ai_run_status, fetch_price_at_run_in_zar,
)

logger = logging.getLogger("alpha-api")
app = FastAPI(title="AlphaSwarm API")

_allowed = os.getenv("API_CORS_ORIGINS", "http://localhost:5173")
origins = [u.strip() for u in _allowed.split(",") if u.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartAnalysisRequest(BaseModel):
    universes: List[str]
    watchlist: Optional[List[str]] = []
    risk_tolerance: Optional[str] = "Moderate"
    expertise_level: Optional[str] = "novice"


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
    return data[0]


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