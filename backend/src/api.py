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


# Whale watching — large insider (director/exec) dealings for a ticker. This is
# purely informational reference data for the user and is intentionally NOT part
# of the analysis pipeline: it never feeds the Unified Confidence Score.
FINNHUB_INSIDER_URL = "https://finnhub.io/api/v1/stock/insider-transactions"


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


# Insider data (SEC Form 4) lands within ~2 business days of a trade and is
# sporadic per ticker, so we serve from a Supabase cache and only refetch when a
# ticker's row is older than this. Bump to hours=72 for a 3-day window.
INSIDER_CACHE_TTL = datetime.timedelta(hours=48)


def _read_insider_cache(symbol: str) -> Optional[dict]:
    """Return the cached row for a ticker, or None if absent / on read error."""
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


def _cache_is_fresh(row: dict) -> bool:
    ts = row.get("fetched_at")
    if not ts:
        return False
    try:
        fetched = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return False
    return datetime.datetime.now(datetime.timezone.utc) - fetched < INSIDER_CACHE_TTL


def _cache_payload(symbol: str, row: dict) -> dict:
    return {
        "ticker": symbol,
        "transactions": row.get("transactions") or [],
        "source": row.get("source"),
        "cached": True,
        "fetched_at": row.get("fetched_at"),
    }


def _write_insider_cache(symbol: str, transactions: list, source: Optional[str]) -> str:
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


async def _fetch_fresh_insider(symbol: str, api_key: str) -> tuple[list, Optional[str]]:
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


@app.get("/api/whales/{ticker}")
async def whale_activity(ticker: str):
    """Recent insider dealings for a ticker, via Finnhub (US-listed only).

    Read-through cache: serves the Supabase-cached rows while fresh (< TTL) and
    only refetches when stale. Returns an empty ``transactions`` list (not an
    error) when no API key is configured or the ticker has no coverage.
    """
    symbol = ticker.upper()

    cached = _read_insider_cache(symbol)
    if cached and _cache_is_fresh(cached):
        return _cache_payload(symbol, cached)

    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        # No key: serve whatever we cached before, else an honest empty state.
        return _cache_payload(symbol, cached) if cached else {"ticker": symbol, "transactions": [], "source": None}

    try:
        transactions, source = await _fetch_fresh_insider(symbol, api_key)
    except Exception as e:
        # Network / server error: prefer stale cache over failing the request.
        logger.warning("Finnhub insider fetch failed for %s: %s", symbol, e)
        if cached:
            return _cache_payload(symbol, cached)
        raise HTTPException(status_code=502, detail="Unable to load insider transactions")

    fetched_at = _write_insider_cache(symbol, transactions, source)
    return {"ticker": symbol, "transactions": transactions, "source": source, "cached": False, "fetched_at": fetched_at}


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