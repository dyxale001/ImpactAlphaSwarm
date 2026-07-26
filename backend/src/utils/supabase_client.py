import os
import uuid
import datetime
import json
from supabase import create_client
from typing import List, Dict, Any, Optional

import pandas as pd
import yfinance as yf

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars for Supabase client")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _latest_close_from_history(history: pd.DataFrame | None) -> float | None:
    if history is None or history.empty or "Close" not in history.columns:
        return None

    close_values = pd.to_numeric(history["Close"], errors="coerce").dropna()
    if close_values.empty:
        return None

    return float(close_values.iloc[-1])


def _ticker_currency(ticker: str) -> str | None:
    try:
        ticker_obj = yf.Ticker(ticker)
        fast_info = getattr(ticker_obj, "fast_info", None)
        if fast_info and fast_info.get("currency"):
            return str(fast_info.get("currency")).upper()

        info = getattr(ticker_obj, "info", None) or {}
        currency = info.get("currency") or info.get("financialCurrency")
        return str(currency).upper() if currency else None
    except Exception:
        return None


def _fx_rate_to_zar(currency: str) -> float | None:
    normalized_currency = (currency or "").upper()
    if not normalized_currency or normalized_currency == "ZAR":
        return 1.0

    pair_candidates = (
        (f"{normalized_currency}ZAR=X", False),
        (f"ZAR{normalized_currency}=X", True),
    )

    for pair_symbol, invert_rate in pair_candidates:
        try:
            pair_history = yf.Ticker(pair_symbol).history(period="5d", interval="1d", auto_adjust=False)
            rate = _latest_close_from_history(pair_history)
            if rate is None or rate <= 0:
                continue
            return 1 / rate if invert_rate else rate
        except Exception:
            continue

    return None


def fetch_fx_rate_to_zar(currency: str) -> float | None:
    return _fx_rate_to_zar(currency)


def fetch_price_at_run_in_zar(ticker: str) -> float | None:
    try:
        ticker_obj = yf.Ticker(ticker)
        history = ticker_obj.history(period="5d", interval="1d", auto_adjust=False)
        latest_close = _latest_close_from_history(history)
        if latest_close is None:
            return None

        currency = _ticker_currency(ticker)
        if not currency or currency == "ZAR":
            return latest_close

        if currency in {"ZAC", "ZA CENT", "ZACP"}:
            return latest_close / 100.0

        fx_rate = _fx_rate_to_zar(currency)
        if fx_rate is None:
            return latest_close

        return latest_close * fx_rate
    except Exception as e:
        print(f"Failed to fetch yfinance price for {ticker}: {e}")
        return None


# ---------------------------------------------------------------------------
# Risk-tolerance normalisation
# ---------------------------------------------------------------------------
# `user_analysis.risk_tolerance` is free text and the stored values have drifted
# into six spellings of three levels — 'Moderate', 'moderate', 'conservative',
# 'Conservative', 'aggressive', 'Aggressive' and the misspelling 'aggresive'.
# Consumers compare against exact title-case labels (e.g.
# `risk_tolerance == "Conservative"`), so every lower-cased or misspelled row
# silently skipped its risk handling: the personalisation looked applied but never
# fired. Normalise once, on read, so downstream comparisons are safe.

RISK_LEVELS = ("Conservative", "Moderate", "Aggressive")
DEFAULT_RISK_LEVEL = "Moderate"

# Casefolded spellings seen in live data, plus near-miss typos → canonical label.
_RISK_ALIASES: Dict[str, str] = {
    "conservative": "Conservative",
    "conservitive": "Conservative",
    "concervative": "Conservative",
    "low": "Conservative",
    "moderate": "Moderate",
    "moderat": "Moderate",
    "medium": "Moderate",
    "balanced": "Moderate",
    "aggressive": "Aggressive",
    "aggresive": "Aggressive",   # observed in live data
    "agressive": "Aggressive",
    "high": "Aggressive",
}


def normalize_risk_tolerance(value: Any) -> str:
    """Map any stored risk-tolerance spelling to one of ``RISK_LEVELS``.

    Unknown, empty or non-string values fall back to ``DEFAULT_RISK_LEVEL`` (the
    neutral profile) rather than raising, so a malformed row degrades to "no
    special handling" instead of failing a run.
    """
    if not isinstance(value, str):
        return DEFAULT_RISK_LEVEL
    return _RISK_ALIASES.get(value.strip().casefold(), DEFAULT_RISK_LEVEL)


def get_user_preferences(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch user preferences from user_analysis table."""
    try:
        resp = supabase.table("user_analysis").select("*").eq("user_id", user_id).limit(1).execute()
        data = resp.data or []
        if data:
            user = data[0]
            # Parse investment_universe (it's stored as JSON string or array)
            universes = user.get("investment_universe", [])
            if isinstance(universes, str):
                universes = json.loads(universes)
            
            return {
                "user_id": user_id,
                "universes": universes,
                # Normalised: the raw column holds mixed casing + a typo, and
                # exact-match consumers silently skipped those rows.
                "risk_tolerance": normalize_risk_tolerance(user.get("risk_tolerance")),
                "expertise_level": user.get("ai_derived_expertise", "novice"),  # novice, intermediate, advanced
            }
        return None
    except Exception as e:
        print(f"Error fetching user preferences: {e}")
        return None


def get_active_user_ids(within_days: int = 7) -> List[str]:
    """Return ids of users who have signed in within `within_days` days.

    Activity is based on Supabase auth's ``last_sign_in_at``, deliberately NOT on
    ai_runs: the nightly scheduled run rewrites ai_runs.created_at, so using that
    as the activity signal would keep dormant accounts "active" forever (every
    nightly refresh resets their clock). Sign-in time is only advanced by the
    user, so the automation can't perpetuate itself.

    Users without saved preferences are skipped later by the daily job itself.

    Caveat: ``last_sign_in_at`` advances only on an explicit sign-in, not on
    silent token refresh — a user who stays logged in for weeks can look inactive
    and drop out of the nightly run. The frontend staleness auto-refresh is the
    backstop: their data self-heals the next time they open the app.
    """
    try:
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
            days=within_days
        )
        active: List[str] = []
        page = 1
        per_page = 200
        while True:
            users = supabase.auth.admin.list_users(page=page, per_page=per_page)
            if not users:
                break
            for user in users:
                last_sign_in = getattr(user, "last_sign_in_at", None)
                if last_sign_in is None:
                    continue
                if last_sign_in.tzinfo is None:
                    last_sign_in = last_sign_in.replace(tzinfo=datetime.timezone.utc)
                if last_sign_in >= cutoff:
                    active.append(user.id)
            page += 1
        return active
    except Exception as e:
        print(f"Error fetching active users: {e}")
        return []


def get_assets_by_universes(universes: List[str]) -> List[str]:
    """Fetch tickers for assets matching user's investment universes."""
    try:
        if not universes:
            return []
        
        # Query assets table for rows matching any of the universes
        resp = supabase.table("assets").select("ticker").in_("universe", universes).execute()
        data = resp.data or []
        tickers = [row["ticker"] for row in data if row.get("ticker")]
        return list(set(tickers))  # Remove duplicates
    except Exception as e:
        print(f"Error fetching assets: {e}")
        return []


def get_or_create_asset_id(ticker: str) -> Optional[str]:
    resp = supabase.table("assets").select("id").eq("ticker", ticker).limit(1).execute()
    data = resp.data or []
    if data:
        return data[0]["id"]
    # Optional: create a minimal asset row if your schema allows it
    new_resp = supabase.table("assets").insert({"ticker": ticker, "name": ticker}).execute()
    new_data = new_resp.data or []
    return new_data[0]["id"] if new_data else None

def create_ai_run(user_id: str, status: str = "running") -> str:
    """Create or update an ai_run row for the user. Since ai_runs has a unique 
    constraint on user_id, we upsert: update if exists, insert if not."""
    
    try:
        # Check if user already has an existing ai_run
        existing_runs = supabase.table("ai_runs").select("id").eq("user_id", user_id).execute()
        existing_data = existing_runs.data or []
        
        if existing_data:
            # User already has an ai_run, update it
            old_run_id = existing_data[0]["id"]
            try:
                # Delete associated ai_recommendation rows for the existing run
                supabase.table("ai_recommendation").delete().eq("run_id", old_run_id).execute()
                print(f"Deleted ai_recommendation rows for run_id: {old_run_id}")
            except Exception as e:
                print(f"Warning: Could not delete ai_recommendation rows: {e}")
            
            # Update the existing ai_run row
            resp = supabase.table("ai_runs").update({
                "status": status,
                "created_at": datetime.datetime.utcnow().isoformat(),
            }).eq("user_id", user_id).execute()
            
            data = resp.data or []
            if data:
                new_run_id = data[0]["id"]
                print(f"Updated existing ai_run for user {user_id}: {new_run_id}")
                return new_run_id
    
    except Exception as e:
        print(f"Error checking existing ai_run: {e}")
    
    # Create new ai_run row (if user doesn't already have one)
    try:
        resp = supabase.table("ai_runs").insert({
            "user_id": user_id,
            "status": status,
        }).execute()

        data = resp.data or []
        if not data:
            raise RuntimeError("Failed to create ai_run row")

        print(f"Created new ai_run: {data[0]['id']}")
        return data[0]["id"]
    
    except Exception as e:
        print(f"Error creating ai_run: {e}")
        raise


def update_ai_run_status(run_id: str, status: str) -> None:
    supabase.table("ai_runs").update({
        "status": status,
    }).eq("id", run_id).execute()


def save_top_assets(
    run_id: str,
    user_id: str,
    top_5: List[Dict[str, Any]],
    quant_results: Dict[str, Dict[str, Any]],
    sentiment_results: Dict[str, Dict[str, Any]],
    price_cache: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    rows = []
    now = datetime.datetime.utcnow().isoformat()
    for rank, asset in enumerate(top_5, start=1):
        ticker = asset.get("ticker")
        asset_id = get_or_create_asset_id(ticker)
        quant = quant_results.get(ticker, {})
        sentiment = sentiment_results.get(ticker, {})

        raw_sources = sentiment.get("sources")
        normalized_sources = None
        if isinstance(raw_sources, dict):
            # Display names for each signal source; news is listed first since it
            # is weighted higher in the blended score.
            source_labels = {"finnhub": "News", "stocktwits": "Stocktwits"}
            present = [
                source_labels[key]
                for key in ("finnhub", "stocktwits")
                if raw_sources.get(key)
            ]
            # Include any other present sources not in the ordered list above.
            present.extend(
                key.capitalize()
                for key, value in raw_sources.items()
                if value and key not in source_labels
            )
            normalized_sources = ", ".join(present) if present else None
        else:
            normalized_sources = raw_sources if raw_sources not in ("", []) else None

        if price_cache is not None and ticker in price_cache:
            price_at_run = price_cache[ticker]
        else:
            price_at_run = fetch_price_at_run_in_zar(ticker)
            if price_cache is not None:
                price_cache[ticker] = price_at_run

        row = {
            "asset_id": asset_id,
            "sentiment_score": int(sentiment.get("sentiment_score") or asset.get("sentiment_score") or 0),
            "confidence_score": float(asset.get("unified_score") or 0),
            "reasoning_trace": asset.get("reasoning") or "",
            "hype_penalty": int(asset.get("adjustments", {}).get("hype_penalty", 0)),
            "created_at": now,
            "run_id": run_id,
            "rank": rank,
            "price_at_run": price_at_run,
            "quant_score": int(asset.get("quant_score") or 0),
            "beta": float(quant.get("beta")) if quant.get("beta") is not None else None,
            "risk_penalty": int(asset.get("adjustments", {}).get("risk_penalty", 0)),
            "macd": quant.get("macd"),
            "macd_histogram": quant.get("macd_histogram"),
            "rsi": quant.get("rsi"),
            "sharpe_ratio": quant.get("sharpe_ratio"),
            "volatility": quant.get("volatility"),
            # Objective cross-sectional quant sub-dimensions + context bands
            # (see migrations/004). Null when the candidate universe was too
            # small to rank (quant_normalisation = 'insufficient_universe').
            "momentum_pctile": (quant.get("sub_dimensions") or {}).get("momentum"),
            "risk_adj_pctile": (quant.get("sub_dimensions") or {}).get("risk_adjusted_return"),
            "stability_pctile": (quant.get("sub_dimensions") or {}).get("stability"),
            "rsi_band": (quant.get("bands") or {}).get("rsi"),
            "beta_band": (quant.get("bands") or {}).get("beta"),
            "quant_normalisation": quant.get("quant_normalisation"),
            "sources": normalized_sources,
            "bullish_posts": int(sentiment.get("bullish_posts") or 0),
            "bearish_posts": int(sentiment.get("bearish_posts") or 0),
            # News sub-signal (blended into sentiment_score, weighted higher than
            # social). Defaults to the blended score / 0 when no news was found.
            "news_sentiment_score": int(
                sentiment.get("news_sentiment_score")
                or sentiment.get("sentiment_score")
                or 0
            ),
            "social_sentiment_score": int(
                sentiment.get("social_sentiment_score")
                or sentiment.get("sentiment_score")
                or 0
            ),
            "news_count": int(sentiment.get("news_count") or 0),
            "news_bullish": int(sentiment.get("news_bullish") or 0),
            "news_bearish": int(sentiment.get("news_bearish") or 0),
            # Per-article transparency list: publisher, tier, date, headline, link.
            "news_articles": sentiment.get("news_articles") or [],
            # Per-post transparency list: author, date, text, link, sentiment.
            "social_posts": sentiment.get("social_posts") or [],
        }
        rows.append(row)

    if not rows:
        return {"status": "no_rows"}

    resp = supabase.table("ai_recommendation").insert(rows).execute()
    return {"status": "inserted", "response": resp.data}


# ---------------------------------------------------------------------------
# Marketaux tier-1 news cache (see migrations/003)
# ---------------------------------------------------------------------------
# The nightly batch pulls tier-1 news from Marketaux (deep pagination, against the
# tight call budget) and writes it here per ticker; user refreshes read it back
# instead of re-hitting the API, so tier-1 stays visible without spending calls.


def save_marketaux_news_cache(ticker_to_articles: Dict[str, List[Dict[str, Any]]]) -> None:
    """Upsert each ticker's tier-1 Marketaux articles into the cache (keyed by
    ticker). Tickers are written even with an empty list so a ticker that lost its
    tier-1 coverage this run doesn't keep serving stale articles."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = [
        {"ticker": ticker, "articles": articles or [], "fetched_at": now}
        for ticker, articles in ticker_to_articles.items()
    ]
    if not rows:
        return
    supabase.table("marketaux_news_cache").upsert(rows, on_conflict="ticker").execute()


def load_marketaux_news_cache(
    tickers: List[str], max_age_hours: int = 48
) -> Dict[str, List[Dict[str, Any]]]:
    """Return cached Marketaux articles per ticker, fresher than ``max_age_hours``.
    Tickers with no fresh cache entry are omitted."""
    if not tickers:
        return {}
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(hours=max_age_hours)
    ).isoformat()
    resp = (
        supabase.table("marketaux_news_cache")
        .select("ticker,articles,fetched_at")
        .in_("ticker", tickers)
        .gte("fetched_at", cutoff)
        .execute()
    )
    out: Dict[str, List[Dict[str, Any]]] = {}
    for row in resp.data or []:
        out[row["ticker"]] = row.get("articles") or []
    return out


# ---------------------------------------------------------------------------
# Asset discovery (see migrations/009) — D-068
# ---------------------------------------------------------------------------
# Thin DB access for the nightly discovery agent. All scoring / decay /
# hysteresis LOGIC lives in agents/asset_discovery.py; these helpers only read
# and write. Two invariants are enforced here, not left to the caller:
#   * Seed rows (origin='seed') are never rescored, retired, quarantined or
#     reclassified — every mutating write below is guarded on origin='discovered'
#     so a curated seed passed in by mistake is harmlessly ignored.
#   * Rows are retired/quarantined, never deleted, so ai_recommendation history
#     keeps resolving.

# Columns the ranked read (scope_tickers) needs; selection/quarantine policy is
# applied by the caller so it stays in one testable place.
DISCOVERY_POOL_COLUMNS = "ticker,universe,origin,is_active,discovery_score,quarantined_until"


def get_discovery_pool_rows(universes: List[str]) -> List[Dict[str, Any]]:
    """Return the candidate rows (seeds + discovered) for the given universes in
    a single round trip. Ranking and active/quarantine filtering are the
    caller's job."""
    try:
        if not universes:
            return []
        resp = (
            supabase.table("assets")
            .select(DISCOVERY_POOL_COLUMNS)
            .in_("universe", universes)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        print(f"Error fetching discovery pool rows: {e}")
        return []


def upsert_discovered_asset(
    ticker: str,
    name: str,
    universe: str,
    discovery_score: float,
    sources: List[str],
    market_cap_usd: Optional[float] = None,
    ipo_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert or refresh a DISCOVERED asset row (idempotent on ticker).

    Never reclassifies a seed: if the ticker already exists as origin='seed' it
    is left untouched (the curated row wins and is already poolable as a seed).
    Existing discovered rows are refreshed and reactivated; the quarantine is
    cleared since a fresh, validated sighting supersedes it.
    """
    try:
        existing = (
            supabase.table("assets")
            .select("id,origin")
            .eq("ticker", ticker)
            .limit(1)
            .execute()
            .data
            or []
        )
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        fields: Dict[str, Any] = {
            "universe": universe,
            "discovery_score": discovery_score,
            "discovery_sources": sources,
            "last_discovered_at": now,
            "is_active": True,
            "quarantine_reason": None,
            "quarantined_until": None,
        }
        if market_cap_usd is not None:
            fields["market_cap_usd"] = market_cap_usd
        if ipo_date is not None:
            fields["ipo_date"] = ipo_date

        if existing:
            if existing[0].get("origin") == "seed":
                return {"status": "skipped_seed", "ticker": ticker}
            supabase.table("assets").update(fields).eq("ticker", ticker).eq(
                "origin", "discovered"
            ).execute()
            return {"status": "updated", "ticker": ticker}

        insert_row = {
            "ticker": ticker,
            "name": name or ticker,
            "origin": "discovered",
            "first_discovered_at": now,
            **fields,
        }
        supabase.table("assets").insert(insert_row).execute()
        return {"status": "inserted", "ticker": ticker}
    except Exception as e:
        print(f"Error upserting discovered asset {ticker}: {e}")
        return {"status": "error", "ticker": ticker, "error": str(e)}


def update_discovery_scores(score_by_ticker: Dict[str, float]) -> None:
    """Persist recomputed discovery scores (hysteresis decay) for DISCOVERED
    rows. Seeds are skipped via the origin guard."""
    for ticker, score in score_by_ticker.items():
        try:
            supabase.table("assets").update({"discovery_score": score}).eq(
                "ticker", ticker
            ).eq("origin", "discovered").execute()
        except Exception as e:
            print(f"Error updating discovery score for {ticker}: {e}")


def retire_assets(tickers: List[str], reason: str = "decayed_out") -> None:
    """Soft-retire DISCOVERED rows (is_active=false) — the decay floor. Never
    deletes; seeds skipped."""
    if not tickers:
        return
    try:
        supabase.table("assets").update(
            {"is_active": False, "quarantine_reason": reason}
        ).in_("ticker", tickers).eq("origin", "discovered").execute()
    except Exception as e:
        print(f"Error retiring assets {tickers}: {e}")


def quarantine_assets(tickers: List[str], reason: str, until_iso: str) -> None:
    """Bench DISCOVERED rows until ``until_iso`` (seeds skipped)."""
    if not tickers:
        return
    try:
        supabase.table("assets").update(
            {"quarantine_reason": reason, "quarantined_until": until_iso}
        ).in_("ticker", tickers).eq("origin", "discovered").execute()
    except Exception as e:
        print(f"Error quarantining assets {tickers}: {e}")


def mark_quant_empty(tickers: List[str], quarantine_days: int = 30) -> None:
    """Feedback hook (called from the nightly batch): a discovered ticker whose
    quant fetch returned nothing this run is benched for ``quarantine_days``,
    after which it can re-qualify through the funnel. Seeds are never benched, so
    passing the whole empty-quant union here is safe."""
    if not tickers:
        return
    until = (
        datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(days=quarantine_days)
    ).isoformat()
    quarantine_assets(tickers, reason="no_quant_data", until_iso=until)


def record_discovery_run(
    summary: Dict[str, Any],
    rejections: List[Dict[str, Any]],
    status: str,
) -> None:
    """Write one audit row per nightly discovery pass (best-effort; a failure to
    audit must not fail discovery)."""
    try:
        supabase.table("discovery_runs").insert(
            {"summary": summary, "rejections": rejections, "status": status}
        ).execute()
    except Exception as e:
        print(f"Error recording discovery run: {e}")