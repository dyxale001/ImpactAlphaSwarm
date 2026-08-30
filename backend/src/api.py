import os
import asyncio
import datetime
import logging
import secrets
import time
from typing import Dict, List, Optional

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
    (for the Top Funds / Notable Investors views).

    Weekly read-through cache. A miss is still cheap because the rebuild is pure
    aggregation over the institutional cache, which the nightly job warms
    (ww.refresh_institutions_cache); this request never calls yfinance.

    Scoped to active assets, so tickers the discovery agent has retired or
    benched no longer contribute holdings.
    """
    cached = ww.read_funds_cache()
    if cached and ww.cache_is_fresh(cached, ww.FUNDS_CACHE_TTL):
        funds = ww.with_descriptions(cached.get("payload") or [])
        return {"funds": funds, "cached": True, "fetched_at": cached.get("fetched_at")}

    loop = asyncio.get_running_loop()
    assets = await loop.run_in_executor(None, ww.read_active_assets)
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



# ---------------------------------------------------------------------------
# Ask AlphaSwarm — controlled natural-language interface over existing
# AlphaSwarm data. The LLM never invents facts, scores, or predictions; it only
# (a) classifies intent, and (b) narrates data the backend already retrieved
# deterministically from Supabase. See spec for the full contract.
# ---------------------------------------------------------------------------

ASK_INTENTS = (
    "ASSET_SEARCH",
    "USER_DATA_SEARCH",
    "ANALYSIS_EXPLANATION",
    "LEARNING_QUESTION",
    "PLATFORM_QUESTION",
    "UNSUPPORTED_FINANCIAL_ADVICE",
    "UNKNOWN",
)

_ASK_BLOCKLIST = (
    "should i buy",
    "should i sell",
    "should i invest",
    "what should i",
    "will it go up",
    "will it go down",
    "is it a good time",
    "what will happen",
    "predict",
    "should i hold",
    "price target",
    "when to buy",
    "when to sell",
)

_ASK_REDIRECT_SUGGESTIONS = [
    "Show me technology assets in my universe",
    "Tell me about NVDA",
    "How does AlphaSwarm calculate Signal Score?",
]

_ASK_NO_ADVICE_MESSAGE = (
    "AlphaSwarm can't answer that — it doesn't give investment advice or "
    "predictions. Try asking about specific assets, your watchlist, or how "
    "AlphaSwarm's analysis works instead."
)

_ASK_NO_DATA_MESSAGE = (
    "AlphaSwarm cannot answer this reliably because it could not find "
    "supporting data in its own analysis. This is informational only — not "
    "financial advice."
)

# Hardcoded methodology text — actual AlphaSwarm implementation only, never
# LLM-generated. Mirrors ranking.py's disclosed four-term composite.
_PLATFORM_METHODOLOGY = (
    "AlphaSwarm ranks assets using four disclosed, measured factors, "
    "multiplied together: (1) Signal strength — how strongly the price data "
    "and news/social tone lean, (2) Convergence — how much those two signals "
    "agree with each other, (3) Data sufficiency — how much evidence (news "
    "articles, social posts, price history) backs the read, and (4) Profile "
    "fit — how well the asset's volatility matches your stated risk "
    "tolerance. None of these factors is a prediction or a recommendation — "
    "they describe what the current data shows. This is informational only "
    "— not financial advice."
)

# Simple in-memory per-user rate limiter (process-local; see spec — no Redis).
_ASK_RATE_LIMIT = 10
_ASK_RATE_WINDOW_SECONDS = 60
_ask_rate_state: Dict[str, List[float]] = {}


def _check_ask_rate_limit(user_id: str) -> bool:
    """Return True if this request is allowed; False if the user is over the
    limit. Sliding window using timestamps kept in memory per user_id."""
    now = time.time()
    window_start = now - _ASK_RATE_WINDOW_SECONDS
    timestamps = [t for t in _ask_rate_state.get(user_id, []) if t > window_start]
    if len(timestamps) >= _ASK_RATE_LIMIT:
        _ask_rate_state[user_id] = timestamps
        return False
    timestamps.append(now)
    _ask_rate_state[user_id] = timestamps
    return True


def _ask_blocklist_hit(query: str) -> bool:
    q = query.lower()
    return any(phrase in q for phrase in _ASK_BLOCKLIST)


def _get_ask_groq():
    """Lazy Groq client for the intent classifier / narrator.

    TEMPORARY: pinned to its own model (ASK_GROQ_MODEL, default
    llama-3.1-8b-instant) instead of the shared GROQ_MODEL the orchestrator/
    agents use, because that shared default is currently returning 404 on
    this Groq account. Scoped to /api/ask only so the rest of the app's model
    configuration is untouched — revert to GROQ_MODEL once that's fixed."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    from langchain_groq import ChatGroq

    model = os.getenv("ASK_GROQ_MODEL", "llama-3.1-8b-instant")
    return ChatGroq, api_key, model


def _classify_ask_intent(query: str) -> str:
    """Small Groq call: classify into exactly one of ASK_INTENTS. Falls back to
    UNKNOWN if Groq is unavailable or returns something unrecognised."""
    client = _get_ask_groq()
    if client is None:
        return "UNKNOWN"
    ChatGroq, api_key, model = client
    try:
        from langchain_core.messages import HumanMessage

        llm = ChatGroq(api_key=api_key, model=model, temperature=0, max_tokens=10)
        prompt = (
            "Classify the user question into exactly one label, output ONLY the "
            "label, nothing else:\n"
            "ASSET_SEARCH - looking for a LIST of assets/tickers by sector or universe\n"
            "USER_DATA_SEARCH - asking about their own watchlist or latest analysis run\n"
            "ANALYSIS_EXPLANATION - asking about ONE specific asset: its ranking, score, "
            "sentiment, risk, quant metrics, or general info ('tell me about X', 'why does "
            "X rank high', 'sentiment on X', 'is X risky')\n"
            "LEARNING_QUESTION - asking what a financial term/concept means\n"
            "PLATFORM_QUESTION - asking how AlphaSwarm itself works/calculates things\n"
            "UNSUPPORTED_FINANCIAL_ADVICE - asking for a prediction or buy/sell/hold advice\n"
            "UNKNOWN - anything else\n\n"
            f"Question: {query}\nLabel:"
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        label = (response.content or "").strip().upper()
        for intent in ASK_INTENTS:
            if intent in label:
                return intent
        return "UNKNOWN"
    except Exception as e:
        logger.warning("Ask intent classification failed: %s", e)
        return "UNKNOWN"


def _narrate_ask(question: str, data_summary: str) -> Optional[str]:
    """Small Groq call: narrate the ALREADY-RETRIEVED data. Returns None (never
    call narrator) if Groq is unavailable — caller must handle that case."""
    client = _get_ask_groq()
    if client is None:
        return None
    ChatGroq, api_key, model = client
    try:
        from langchain_core.messages import HumanMessage

        llm = ChatGroq(api_key=api_key, model=model, temperature=0, max_tokens=120)
        system = (
            "You are AlphaSwarm.\n\n"
            "Explain only the AlphaSwarm data provided to you.\n\n"
            "Rules:\n"
            "1. Never invent financial data.\n"
            "2. Never invent scores, rankings, prices, metrics, or analysis.\n"
            "3. Never make predictions.\n"
            "4. Never provide personalised financial advice.\n"
            "5. Never tell the user what to buy, sell, or hold.\n"
            "6. If the retrieved data only partially answers the question, explain the "
            "relevant information that IS available rather than refusing.\n"
            "7. Do not claim unavailable information exists.\n"
            "8. Do not use external knowledge.\n"
            "9. Keep the answer concise.\n"
            '10. End with:\n"This is informational only — not financial advice."'
        )
        prompt = f"{system}\n\nUSER QUESTION:\n{question}\n\nALPHASWARM DATA:\n{data_summary}"
        response = llm.invoke([HumanMessage(content=prompt)])
        return (response.content or "").strip()
    except Exception as e:
        logger.warning("Ask narration failed: %s", e)
        return None


def _ask_asset_search(query: str, user_id: str) -> tuple[dict, str]:
    """Deterministic asset search. Respects the user's investment universe when
    it can be inferred from their saved preferences (user_analysis)."""
    prefs_resp = (
        supabase.table("user_analysis")
        .select("investment_universe")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    prefs_rows = prefs_resp.data or []
    universes = []
    if prefs_rows:
        raw = prefs_rows[0].get("investment_universe")
        if isinstance(raw, str):
            import json as _json
            try:
                raw = _json.loads(raw)
            except Exception:
                raw = []
        universes = raw or []

    q = supabase.table("assets").select("ticker,name,universe,current_price")
    matched_universe = next((u for u in universes if u.lower() in query.lower()), None)
    if matched_universe:
        q = q.eq("universe", matched_universe)
    elif universes:
        q = q.in_("universe", universes)
    resp = q.limit(5).execute()
    rows = resp.data or []
    return {"assets": rows}, "asset_search"


def _ask_user_data_search(user_id: str) -> tuple[dict, str]:
    """Deterministic retrieval of the user's own watchlist + latest run top picks."""
    watchlist_resp = (
        supabase.table("user_watchlist_assets")
        .select("ticker")
        .eq("user_id", user_id)
        .execute()
    )
    watchlist = [r["ticker"] for r in (watchlist_resp.data or []) if r.get("ticker")]

    run_resp = (
        supabase.table("ai_runs")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "complete")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    run_rows = run_resp.data or []
    top_picks = []
    if run_rows:
        run_id = run_rows[0]["id"]
        recs_resp = (
            supabase.table("ai_recommendation")
            .select("asset_id,rank,confidence_score")
            .eq("run_id", run_id)
            .order("rank", desc=False)
            .limit(5)
            .execute()
        )
        recs = recs_resp.data or []
        asset_ids = [r["asset_id"] for r in recs if r.get("asset_id")]
        asset_map = {}
        if asset_ids:
            assets_resp = supabase.table("assets").select("id,ticker").in_("id", asset_ids).execute()
            asset_map = {a["id"]: a["ticker"] for a in (assets_resp.data or [])}
        top_picks = [
            {"ticker": asset_map.get(r["asset_id"], ""), "rank": r["rank"]}
            for r in recs
            if asset_map.get(r["asset_id"])
        ]

    return {"watchlist": watchlist, "top_picks": top_picks}, "user_data"


def _resolve_asset(query: str) -> Optional[dict]:
    """Deterministically resolve the asset a query is about — by ticker symbol
    or company-name substring, against the actual `assets` table. No LLM: this
    is the same data the discovery agent and asset search already use, just
    matched against the free-text question."""
    import re

    resp = supabase.table("assets").select("id,ticker,name,universe,current_price").execute()
    assets = resp.data or []
    if not assets:
        return None

    tokens = set(re.findall(r"\b[A-Za-z]{1,5}\b", query.upper()))
    for asset in assets:
        ticker = (asset.get("ticker") or "").upper()
        if ticker and ticker in tokens:
            return asset

    # Company-name substring match, longest name first so "NVIDIA Corp" beats a
    # shorter unrelated name that happens to also match part of the query.
    q_lower = query.lower()
    for asset in sorted(assets, key=lambda a: -len(a.get("name") or "")):
        name = (asset.get("name") or "").lower()
        if len(name) > 2 and name in q_lower:
            return asset
    return None


# Fields already persisted per recommendation by save_top_assets — quant,
# sentiment and ranking-v2 outputs from the existing agents. Selected together
# so ANALYSIS_EXPLANATION can answer ranking, sentiment and risk questions from
# the same stored row without re-running any agent.
_REC_FIELDS_V2 = (
    "rank,confidence_score,sentiment_score,quant_score,reasoning_trace,"
    "rsi,sharpe_ratio,volatility,beta,macd,"
    "news_sentiment_score,social_sentiment_score,"
    "signal_strength,convergence,convergence_state,data_sufficiency,profile_fit,"
    "created_at"
)
_REC_FIELDS_BASE = (
    "rank,confidence_score,sentiment_score,quant_score,reasoning_trace,"
    "rsi,sharpe_ratio,volatility,beta,macd,"
    "news_sentiment_score,social_sentiment_score,created_at"
)


def _fetch_recommendation(run_id: str, asset_id: str) -> Optional[dict]:
    """One recommendation row for (run_id, asset_id), reusing the ranking-v2
    columns when present and falling back to the base set (mirrors
    save_top_assets' own fallback for deployments without migration 010)."""
    resp = (
        supabase.table("ai_recommendation")
        .select(_REC_FIELDS_V2)
        .eq("run_id", run_id)
        .eq("asset_id", asset_id)
        .maybe_single()
        .execute()
    )
    if resp and resp.data:
        return resp.data
    resp = (
        supabase.table("ai_recommendation")
        .select(_REC_FIELDS_BASE)
        .eq("run_id", run_id)
        .eq("asset_id", asset_id)
        .maybe_single()
        .execute()
    )
    return resp.data if resp else None


def _ask_analysis_explanation(query: str, user_id: str) -> tuple[dict, str]:
    """Retrieve existing agent outputs for one asset — ranking, quant and
    sentiment fields already stored on `ai_recommendation` — with a
    deterministic broadening fallback so a real question rarely comes back
    empty:

      1. the asset's row in the user's own latest completed run
      2. the asset's most recent recommendation from ANY run (still real,
         already-computed AlphaSwarm output — just not this user's last run)
      3. bare asset info (ticker/name/universe/price) if no analysis exists yet
    """
    asset = _resolve_asset(query)
    if not asset:
        return {}, "analysis_explanation"

    base = {
        "ticker": asset["ticker"],
        "name": asset.get("name"),
        "universe": asset.get("universe"),
        "current_price": asset.get("current_price"),
    }

    # 1. This user's latest completed run.
    run_resp = (
        supabase.table("ai_runs")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "complete")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    run_rows = run_resp.data or []
    if run_rows:
        rec = _fetch_recommendation(run_rows[0]["id"], asset["id"])
        if rec:
            return {**base, **rec, "run_scope": "latest_user_run"}, "ai_recommendation"

    # 2. Broaden: this asset's most recent recommendation from any run —
    #    still an existing, already-computed agent output, not a new one.
    fallback_resp = (
        supabase.table("ai_recommendation")
        .select(_REC_FIELDS_BASE)
        .eq("asset_id", asset["id"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    fallback_rows = fallback_resp.data or []
    if fallback_rows:
        return {**base, **fallback_rows[0], "run_scope": "most_recent_available"}, "ai_recommendation"

    # 3. No analysis exists for this asset yet — still return what IS known
    #    (asset info) instead of an empty "no data" response.
    return {**base, "run_scope": "asset_info_only"}, "assets"


# Deterministic fallback glossary for terms AlphaSwarm's own agents already
# define/compute (see quant_analyst.py, ranking.py) but that may not have a
# matching Learning Centre article. Not invented content — each definition
# mirrors how the metric is actually implemented.
_ASK_GLOSSARY = {
    "beta": "Beta measures how much an asset's price has moved relative to the market (SPY) over the analysis window. Below 0.8 is labelled 'low', 0.8–1.2 'market', above 1.2 'high', and negative beta is 'inverse' (it moved opposite to the market).",
    "rsi": "RSI (Relative Strength Index) is a momentum measure over the last 14 periods. Below 30 is labelled 'oversold', 30–70 'neutral', above 70 'overbought'.",
    "sharpe": "The Sharpe ratio measures risk-adjusted return: annualised return in excess of a risk-free rate, divided by annualised volatility. Higher means more return per unit of risk taken.",
    "sharpe ratio": "The Sharpe ratio measures risk-adjusted return: annualised return in excess of a risk-free rate, divided by annualised volatility. Higher means more return per unit of risk taken.",
    "volatility": "Volatility is the annualised standard deviation of an asset's daily returns — how much its price has swung, not a prediction of future moves.",
    "macd": "MACD (Moving Average Convergence Divergence) compares a 12-period and 26-period moving average of price. A positive histogram is labelled a bullish crossover, negative a bearish crossover.",
    "signal strength": "Signal strength is how strongly AlphaSwarm's price data and news/social tone lean in one direction, on a 0-1 scale.",
    "convergence": "Convergence measures how much the quantitative (price) signal and the sentiment (news/social) signal agree with each other. Higher means the two signals point the same way.",
    "data sufficiency": "Data sufficiency reflects how much evidence — news articles, social posts, price history — backs an asset's analysis. Thin coverage lowers this term.",
    "profile fit": "Profile fit reflects how well an asset's market exposure (beta) matches your stated risk tolerance. It only ever demotes a mismatch, never boosts a score.",
    "sentiment score": "The sentiment score blends news sentiment (weighted higher) and social sentiment (StockTwits) into a single 0-100 reading of tone, not a price forecast.",
}


def _ask_learning_question(query: str) -> tuple[dict, str]:
    """Deterministic search: Learning Centre articles first (title/summary
    match), then a hardcoded glossary of terms AlphaSwarm's own agents already
    define. No LLM involved in the lookup itself."""
    q_lower = query.lower()
    words = [w for w in q_lower.split() if len(w) > 3]

    if words:
        resp = supabase.table("learning_articles").select("title,summary,content").execute()
        articles = resp.data or []
        for article in articles:
            haystack = f"{article.get('title', '')} {article.get('summary', '')}".lower()
            if any(w in haystack for w in words):
                snippet = article.get("summary") or (article.get("content") or "")[:400]
                return {"title": article.get("title"), "summary": snippet}, "learning_centre"

    # Fall back to the deterministic glossary (longest term first, so "sharpe
    # ratio" is preferred over the shorter "sharpe" when both would match).
    for term in sorted(_ASK_GLOSSARY, key=len, reverse=True):
        if term in q_lower:
            return {"term": term, "definition": _ASK_GLOSSARY[term]}, "methodology_glossary"

    return {}, "learning_centre"


class AskRequest(BaseModel):
    query: str


class AskResponse(BaseModel):
    intent: str
    narration: str
    data: dict
    source: str
    is_blocked: bool = False
    redirect_suggestions: List[str] = []


@app.post("/api/ask", response_model=AskResponse)
async def ask_alphaswarm(
    req: AskRequest,
    authorization: Optional[str] = Header(None),
):
    user_id = await _get_user_id_from_bearer(authorization)

    if not _check_ask_rate_limit(user_id):
        raise HTTPException(status_code=429, detail="Too many requests — please wait a moment.")

    query = (req.query or "").strip()
    if not query:
        return AskResponse(
            intent="UNKNOWN",
            narration="Ask a question about assets, your watchlist, or how AlphaSwarm works.",
            data={},
            source="none",
            is_blocked=False,
            redirect_suggestions=_ASK_REDIRECT_SUGGESTIONS,
        )

    # 1. Local blocklist — before any LLM call.
    if _ask_blocklist_hit(query):
        return AskResponse(
            intent="UNSUPPORTED_FINANCIAL_ADVICE",
            narration=_ASK_NO_ADVICE_MESSAGE,
            data={},
            source="blocklist",
            is_blocked=True,
            redirect_suggestions=_ASK_REDIRECT_SUGGESTIONS,
        )

    # 2. Intent classification (small Groq call).
    intent = _classify_ask_intent(query)

    if intent == "UNSUPPORTED_FINANCIAL_ADVICE":
        return AskResponse(
            intent=intent,
            narration=_ASK_NO_ADVICE_MESSAGE,
            data={},
            source="classifier",
            is_blocked=True,
            redirect_suggestions=_ASK_REDIRECT_SUGGESTIONS,
        )

    if intent == "UNKNOWN":
        return AskResponse(
            intent=intent,
            narration=(
                "I can help you explore AlphaSwarm's assets, analysis, metrics, "
                "Learning Centre, and methodology. Try asking one of these:"
            ),
            data={},
            source="none",
            is_blocked=False,
            redirect_suggestions=_ASK_REDIRECT_SUGGESTIONS,
        )

    if intent == "PLATFORM_QUESTION":
        # Deterministic, hardcoded — no narration LLM call needed.
        return AskResponse(
            intent=intent,
            narration=_PLATFORM_METHODOLOGY,
            data={},
            source="platform_methodology",
            is_blocked=False,
            redirect_suggestions=[],
        )

    # 3. Deterministic retrieval per intent.
    try:
        if intent == "ASSET_SEARCH":
            data, source = _ask_asset_search(query, user_id)
        elif intent == "USER_DATA_SEARCH":
            data, source = _ask_user_data_search(user_id)
        elif intent == "ANALYSIS_EXPLANATION":
            data, source = _ask_analysis_explanation(query, user_id)
        elif intent == "LEARNING_QUESTION":
            data, source = _ask_learning_question(query)
        else:
            data, source = {}, "none"
    except Exception as e:
        logger.warning("Ask retrieval failed for intent %s: %s", intent, e)
        data, source = {}, "none"

    # No-data rule: never call the narrator if retrieval found nothing.
    has_data = bool(
        data.get("assets") if intent == "ASSET_SEARCH"
        else data.get("watchlist") or data.get("top_picks") if intent == "USER_DATA_SEARCH"
        else data.get("ticker") if intent == "ANALYSIS_EXPLANATION"
        else (data.get("title") or data.get("term")) if intent == "LEARNING_QUESTION"
        else False
    )
    if not has_data:
        return AskResponse(
            intent=intent,
            narration=_ASK_NO_DATA_MESSAGE,
            data={},
            source=source,
            is_blocked=False,
            redirect_suggestions=_ASK_REDIRECT_SUGGESTIONS,
        )

    # Glossary hits are already clean, grounded deterministic text — narrating
    # them would just spend a call rephrasing, so render directly (mirrors the
    # PLATFORM_QUESTION shortcut above).
    if source == "methodology_glossary":
        return AskResponse(
            intent=intent,
            narration=f"{data['definition']} This is informational only — not financial advice.",
            data=data,
            source=source,
            is_blocked=False,
            redirect_suggestions=[],
        )

    # 4. Narration (small Groq call) over the minimum relevant retrieved data.
    narration = _narrate_ask(query, str(data))
    if narration is None:
        return AskResponse(
            intent=intent,
            narration=_ASK_NO_DATA_MESSAGE,
            data={},
            source=source,
            is_blocked=False,
            redirect_suggestions=_ASK_REDIRECT_SUGGESTIONS,
        )

    return AskResponse(
        intent=intent,
        narration=narration,
        data=data,
        source=source,
        is_blocked=False,
        redirect_suggestions=[],
    )


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


async def _refresh_whale_data() -> dict:
    """Nightly whale-watching maintenance, run after the discovery agent.

    Four stages, each isolated so one failing does not cost the others:
      1. warm the institutional cache for tickers that are missing or stale —
         the slow part (one yfinance call each), which is exactly why it lives
         here rather than inside the /api/funds request
      2. rebuild the fund-holdings aggregation over the warmed cache
      3. describe any company that still has no blurb
      4. describe any fund we have not seen before

    Stages 3 and 4 are the reason this exists: the discovery agent adds tickers
    every night, each new ticker brings unfamiliar fund holders, and both would
    otherwise show up undescribed.
    """
    from src.utils import descriptions as desc

    loop = asyncio.get_running_loop()
    summary: dict = {}

    assets = await loop.run_in_executor(None, ww.read_active_assets)
    summary["assets"] = len(assets)

    try:
        summary["institutions"] = await loop.run_in_executor(
            None, ww.refresh_institutions_cache, assets
        )
    except Exception as e:
        logger.warning("Institutional cache warm failed: %s", e)
        summary["institutions"] = {"error": str(e)}

    funds: list = []
    try:
        funds = await loop.run_in_executor(None, ww.build_fund_holdings, assets)
        ww.write_funds_cache(funds)
        summary["funds"] = len(funds)
    except Exception as e:
        logger.warning("Fund holdings rebuild failed: %s", e)
        summary["funds"] = {"error": str(e)}

    try:
        fund_names = [f["fund"] for f in funds if f.get("fund")]
        summary["descriptions"] = await loop.run_in_executor(
            None, desc.backfill_descriptions, fund_names
        )
    except Exception as e:
        logger.warning("Description backfill failed: %s", e)
        summary["descriptions"] = {"error": str(e)}

    return summary


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
        whales_summary = await _refresh_whale_data()
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

        
    