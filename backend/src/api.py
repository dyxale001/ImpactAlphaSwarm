import os
import asyncio
import datetime
import logging
from typing import List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# REMOVED: from src.orchestration.langgraph_orchestrator import run_analysis
from src.utils.supabase_client import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, supabase, create_ai_run, update_ai_run_status, fetch_fx_rate_to_zar
from src.utils import whale_watching as ww

logger = logging.getLogger("alpha-api")
app = FastAPI(title="AlphaSwarm API")

_allowed = os.getenv("API_CORS_ORIGINS", "http://localhost:5173")
origins = [u.strip() for u in _allowed.split(",") if u.strip()]

# Local dev: the Vite host (localhost vs 127.0.0.1) and port (5173 -> 5174 when
# a port is taken) both vary, so match any localhost/127.0.0.1 origin in addition
# to the explicit production list from API_CORS_ORIGINS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
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

class DeleteUserRequest(BaseModel):
    user_id: str

class ResetPasswordRequest(BaseModel):
    user_id: str
    email: str

class ToggleUserStatusRequest(BaseModel):
    user_id: str
    is_active: bool

class SetUserRoleRequest(BaseModel):
    user_id: str
    role: str  # 'admin' or 'user'

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


@app.post("/api/admin/set-user-role")
async def set_user_role(
    req: SetUserRoleRequest,
    authorization: Optional[str] = Header(None),
):
    """Promote a user to admin or demote an admin back to user (admin only)."""
    requester_id = await _get_user_id_from_bearer(authorization)
    await _require_admin(requester_id)

    if req.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    if req.user_id == requester_id:
        raise HTTPException(status_code=400, detail="Cannot modify your own role")

    supabase.table("users").update({"role": req.role}).eq("id", req.user_id).execute()

    action = "promoted to admin" if req.role == "admin" else "demoted to user"
    return {"ok": True, "role": req.role, "message": f"User {action} successfully"}


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