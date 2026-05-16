import os
import uuid
import datetime
import json
from supabase import create_client
from typing import List, Dict, Any, Optional

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars for Supabase client")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


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
                "risk_tolerance": user.get("risk_tolerance", "Moderate"),
                "expertise_level": user.get("ai_derived_expertise", "novice"),  # novice, intermediate, advanced
            }
        return None
    except Exception as e:
        print(f"Error fetching user preferences: {e}")
        return None


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
            # prefer stocktwits when present and non-zero
            if raw_sources.get("stocktwits"):
                normalized_sources = "Stocktwits"
            else:
                # fallback: join any other present sources, capitalized
                present = [k.capitalize() for k, v in raw_sources.items() if v]
                normalized_sources = ", ".join(present) if present else None
        else:
            normalized_sources = raw_sources if raw_sources not in ("", []) else None

        # Capture the asset's current price at the time of the run (snapshot)
        price_at_run = None
        try:
            asset_row_resp = supabase.table("assets").select("current_price").eq("id", asset_id).limit(1).execute()
            asset_row_data = asset_row_resp.data or []
            if asset_row_data and asset_row_data[0].get("current_price") is not None:
                try:
                    price_at_run = float(asset_row_data[0].get("current_price"))
                except Exception:
                    price_at_run = asset_row_data[0].get("current_price")
        except Exception as e:
            print(f"Failed to fetch asset price for {ticker}: {e}")
            price_at_run = None

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
            "sources": normalized_sources,
            "bullish_posts": int(sentiment.get("bullish_posts") or 0),
            "bearish_posts": int(sentiment.get("bearish_posts") or 0),
        }
        rows.append(row)

    if not rows:
        return {"status": "no_rows"}

    resp = supabase.table("ai_recommendation").insert(rows).execute()
    return {"status": "inserted", "response": resp.data}