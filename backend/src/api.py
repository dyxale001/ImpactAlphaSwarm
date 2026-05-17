import os
import asyncio
import logging
from typing import List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# REMOVED: from src.orchestration.langgraph_orchestrator import run_analysis
from src.utils.supabase_client import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, supabase, create_ai_run, update_ai_run_status

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

class DeleteUserRequest(BaseModel):
    user_id: str

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