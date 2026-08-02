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

# How long a run may sit in 'running' before it is presumed abandoned and may be
# claimed by a new one. Mirrors api.STALE_RUN_MINUTES, which heals such rows.
RUN_LOCK_STALE_MINUTES = int(os.getenv("STALE_RUN_MINUTES", "15"))


def acquire_ai_run(
    user_id: str, stale_minutes: int = RUN_LOCK_STALE_MINUTES
) -> tuple[Optional[str], bool]:
    """Atomically claim this user's single ai_run row for a new analysis.

    Returns ``(run_id, acquired)``. ``acquired=False`` means an analysis is already
    in flight and the caller must NOT start another — the returned id is the run
    already going, so the caller can simply poll that instead.

    Why this exists: the previous check-then-update was not atomic, so two requests
    26ms apart both "created" a run, both cleared the recommendations, and both ran
    the full pipeline — double the API spend and duplicate rows. The claim below is
    a single conditional UPDATE, so exactly one concurrent caller can win it.

    An abandoned run (older than ``stale_minutes``) is stealable, otherwise a
    crashed pipeline would lock the user out until manual intervention.
    """
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    claim = {"status": "running", "created_at": now_iso}

    # 1. Claim the row only if it is NOT already running. One winner by construction.
    try:
        resp = (
            supabase.table("ai_runs")
            .update(claim)
            .eq("user_id", user_id)
            .neq("status", "running")
            .execute()
        )
        if resp.data:
            return resp.data[0]["id"], True
    except Exception as e:
        print(f"Error claiming ai_run for {user_id}: {e}")

    # 2. Either a run is in flight, or the user has no row at all.
    try:
        existing = (
            supabase.table("ai_runs")
            .select("id,status,created_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as e:
        print(f"Error reading ai_run for {user_id}: {e}")
        existing = []

    if existing:
        row = existing[0]
        cutoff = (
            datetime.datetime.now(datetime.timezone.utc)
            - datetime.timedelta(minutes=stale_minutes)
        ).isoformat()
        # Steal an abandoned run — filtered on created_at so a run that started
        # since our read is never stolen out from under itself.
        try:
            stolen = (
                supabase.table("ai_runs")
                .update(claim)
                .eq("user_id", user_id)
                .eq("status", "running")
                .lt("created_at", cutoff)
                .execute()
            )
            if stolen.data:
                print(f"Reclaimed stale ai_run for user {user_id}")
                return stolen.data[0]["id"], True
        except Exception as e:
            print(f"Error reclaiming stale ai_run for {user_id}: {e}")
        return row["id"], False

    # 3. No row yet — insert one. A concurrent insert loses on the unique
    #    constraint, so fall back to reading the winner's row.
    try:
        resp = supabase.table("ai_runs").insert(
            {"user_id": user_id, "status": "running"}
        ).execute()
        data = resp.data or []
        if data:
            return data[0]["id"], True
    except Exception as e:
        print(f"Insert of ai_run lost a race for {user_id} ({e}); reading the winner")

    try:
        rows = (
            supabase.table("ai_runs")
            .select("id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            return rows[0]["id"], False
    except Exception as e:
        print(f"Error resolving ai_run for {user_id}: {e}")
    return None, False


def create_ai_run(user_id: str, status: str = "running") -> str:
    """Claim an ai_run row for the user and return its id.

    Thin wrapper over :func:`acquire_ai_run` kept for callers that do not care
    whether they won the claim. NOTE it no longer deletes the user's existing
    ai_recommendation rows: that used to happen at run START, so a failed or
    interrupted analysis left the dashboard empty. ``save_top_assets`` clears the
    run's rows immediately before inserting the new ones instead, which keeps
    yesterday's results visible until fresh ones exist.
    """
    run_id, _acquired = acquire_ai_run(user_id)
    if not run_id:
        raise RuntimeError(f"Failed to create or claim an ai_run row for {user_id}")
    return run_id


def update_ai_run_status(run_id: str, status: str) -> None:
    supabase.table("ai_runs").update({
        "status": status,
    }).eq("id", run_id).execute()


# Disclosed ranking-v2 fields written per recommendation (migration 010). Kept as
# one list so the "retry without them" fallback below stays in sync automatically.
RANKING_V2_COLUMNS = (
    "rank_score",
    "signal_strength",
    "signal_direction",
    "convergence",
    "convergence_state",
    "data_sufficiency",
    "profile_fit",
    "quant_lean",
    "sent_lean",
    "combined_lean",
    "quant_state",
    "ranking_version",
    "ranking_weights",
    "strength_variants",
)


def get_last_news_for_asset(asset_id: str) -> Optional[Dict[str, Any]]:
    """Most recent stored news for an asset that actually had articles, or None.

    Used to avoid overwriting good news with an empty result: when a run's news
    fetch comes back empty (a transient Finnhub failure, an empty cache), we carry
    the last non-empty news forward rather than zeroing what a prior run stored."""
    try:
        resp = (
            supabase.table("ai_recommendation")
            .select("news_articles,news_count,news_sentiment_score,news_bullish,news_bearish")
            .eq("asset_id", asset_id)
            .gt("news_count", 0)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None
    except Exception as e:
        print(f"Error fetching last news for asset {asset_id}: {e}")
        return None


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

        # News sub-signal. If this run collected no news at all (empty cache or a
        # transient Finnhub failure), don't persist zeros over the last good news
        # we stored -- carry the most recent non-empty news forward instead, so one
        # blip can't blank out an asset's news until the next nightly run.
        news_articles = sentiment.get("news_articles") or []
        news_count = int(sentiment.get("news_count") or 0)
        news_sentiment_score = sentiment.get("news_sentiment_score")
        news_bullish = int(sentiment.get("news_bullish") or 0)
        news_bearish = int(sentiment.get("news_bearish") or 0)
        if news_count == 0 and not news_articles:
            prior = get_last_news_for_asset(asset_id)
            if prior:
                news_articles = prior.get("news_articles") or []
                news_count = int(prior.get("news_count") or 0)
                news_sentiment_score = prior.get("news_sentiment_score")
                news_bullish = int(prior.get("news_bullish") or 0)
                news_bearish = int(prior.get("news_bearish") or 0)

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
            # Uses the carried-forward values above so a blank run keeps the last
            # good news instead of overwriting it with zeros.
            "news_sentiment_score": int(
                news_sentiment_score
                if news_sentiment_score is not None
                else (sentiment.get("sentiment_score") or 0)
            ),
            "social_sentiment_score": int(
                sentiment.get("social_sentiment_score")
                or sentiment.get("sentiment_score")
                or 0
            ),
            "news_count": news_count,
            "news_bullish": news_bullish,
            "news_bearish": news_bearish,
            # Per-article transparency list: publisher, tier, date, headline, link.
            "news_articles": news_articles,
            # Per-post transparency list: author, date, text, link, sentiment.
            "social_posts": sentiment.get("social_posts") or [],
        }

        # Unified ranking v2 terms (migration 010), present only when the ranking
        # module ran. Written for disclosure: the UI and the reasoning trace need
        # to say WHY an asset placed where it did, not just where.
        for key in RANKING_V2_COLUMNS:
            if key in asset:
                row[key] = asset[key]

        rows.append(row)

    if not rows:
        return {"status": "no_rows"}

    # Make the write idempotent for this run. create_ai_run clears the PREVIOUS
    # run's rows, but two analyses for the same user can race (observed 26ms
    # apart: both deletes landed before either insert, leaving two full sets of 5
    # under one run_id). Duplicates then broke the asset page, whose single-row
    # lookup errors on multiple matches. Clearing by run_id here means the last
    # writer wins with exactly one set, whatever the ordering.
    try:
        supabase.table("ai_recommendation").delete().eq("run_id", run_id).execute()
    except Exception as e:
        print(f"Warning: could not clear existing rows for run {run_id}: {e}")

    try:
        resp = supabase.table("ai_recommendation").insert(rows).execute()
        return {"status": "inserted", "response": resp.data}
    except Exception as e:
        # Most likely migration 010 has not been applied yet, so the v2 columns
        # don't exist. The recommendations themselves matter far more than the
        # disclosure fields, so drop those and retry rather than lose the run.
        if not any(key in row for row in rows for key in RANKING_V2_COLUMNS):
            raise
        print(f"Insert with ranking v2 columns failed ({e}); retrying without them")
        legacy_rows = [
            {k: v for k, v in row.items() if k not in RANKING_V2_COLUMNS} for row in rows
        ]
        resp = supabase.table("ai_recommendation").insert(legacy_rows).execute()
        return {"status": "inserted_without_v2", "response": resp.data}


# ---------------------------------------------------------------------------
# Unified ranking v2 shadow log (see migrations/010)
# ---------------------------------------------------------------------------
# One row per (run, candidate) covering the WHOLE scoped set, not just the
# surviving top 5. That breadth is the point: a strongly bearish asset never
# reaches a top 5, and divergent hype names were already demoted out of it by the
# old hype penalty, so neither the direction question nor the convergence term can
# be evaluated from `ai_recommendation` alone.


def save_ranking_shadow(run_id: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Record the v2 ranking breakdown for every candidate in a run, per night.

    Rows are stamped with ``as_of_night`` (migration 011) so successive nights
    ACCUMULATE instead of overwriting each other: run ids are reused per user, so
    keying on (run_id, ticker) alone meant each night destroyed the one before it.

    The night's slice is deleted before inserting rather than upserted, so a
    same-night re-run replaces cleanly AND tickers that dropped out of the
    candidate set don't linger as stale rows skewing the reports.

    Best-effort: a failure here (e.g. migration 010/011 not yet applied) is
    reported, never raised — shadow logging must not be able to fail an analysis.
    """
    if not run_id or not rows:
        return {"status": "no_rows"}

    night = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    payload = [{**row, "run_id": run_id, "as_of_night": night} for row in rows]
    try:
        supabase.table("ranking_shadow").delete().eq("run_id", run_id).eq(
            "as_of_night", night
        ).execute()
    except Exception as e:
        print(f"Could not clear tonight's ranking_shadow slice ({e}); continuing")
    try:
        supabase.table("ranking_shadow").insert(payload).execute()
        return {"status": "saved", "rows": len(payload), "as_of_night": night}
    except Exception as e:
        print(f"Ranking shadow log failed (continuing): {e}")
        return {"status": "error", "error": str(e)}


def get_asset_universes(tickers: List[str]) -> Dict[str, str]:
    """Return ``{ticker: universe}`` for the given tickers in one round trip.

    Used to stamp each shadow row with the universe the asset was analysed UNDER
    (migration 012), so a per-universe view needs no join and stays historically
    accurate even if the asset is later reclassified. Missing tickers are simply
    absent from the result — a watchlist ticker may have no assets row.
    """
    if not tickers:
        return {}
    try:
        rows = (
            supabase.table("assets")
            .select("ticker,universe")
            .in_("ticker", list(tickers))
            .execute()
            .data
            or []
        )
    except Exception as e:
        print(f"Could not read asset universes: {e}")
        return {}
    return {r["ticker"]: r["universe"] for r in rows if r.get("ticker")}


def get_previous_ranking(run_id: str, before_night: Optional[str] = None) -> Dict[str, int]:
    """Return ``{ticker: v2_rank}`` from this run's most recent EARLIER night.

    Feeds the ranking tie-band: near-equal candidates keep the order they had last
    night instead of flipping on noise. Returns ``{}`` on any failure or when there
    is no prior night, so the caller degrades to "no hysteresis" rather than
    failing — first run, missing migration and read error all behave the same.
    """
    if not run_id:
        return {}
    night = before_night or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    try:
        rows = (
            supabase.table("ranking_shadow")
            .select("ticker,v2_rank,as_of_night")
            .eq("run_id", run_id)
            .lt("as_of_night", night)
            .order("as_of_night", desc=True)
            .execute()
            .data
            or []
        )
    except Exception as e:
        print(f"Could not read the previous ranking for {run_id}: {e}")
        return {}
    if not rows:
        return {}
    latest = rows[0].get("as_of_night")
    return {
        r["ticker"]: r["v2_rank"]
        for r in rows
        if r.get("as_of_night") == latest and r.get("v2_rank") is not None
    }


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
# Finnhub trusted-source news cache (see migrations/010)
# ---------------------------------------------------------------------------
# Finnhub is capped at 60 calls/min per key; querying it live on every user
# refresh exhausted that budget and 429'd the news signal to nothing. The nightly
# batch now writes each ticker's trusted-tier articles here, and refreshes read
# them back instead of re-hitting the API (mirrors the Marketaux cache above).


def save_finnhub_news_cache(ticker_to_articles: Dict[str, List[Dict[str, Any]]]) -> None:
    """Upsert each ticker's trusted-tier Finnhub articles into the cache (keyed by
    ticker). Tickers are written even with an empty list so a ticker that lost its
    coverage this run doesn't keep serving stale articles."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = [
        {"ticker": ticker, "articles": articles or [], "fetched_at": now}
        for ticker, articles in ticker_to_articles.items()
    ]
    if not rows:
        return
    supabase.table("finnhub_news_cache").upsert(rows, on_conflict="ticker").execute()


def load_finnhub_news_cache(
    tickers: List[str], max_age_hours: int = 48
) -> Dict[str, List[Dict[str, Any]]]:
    """Return cached Finnhub articles per ticker, fresher than ``max_age_hours``.
    Tickers with no fresh cache entry are omitted (so the caller can tell a cache
    miss apart from a genuinely empty result and top it up live)."""
    if not tickers:
        return {}
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc)
        - datetime.timedelta(hours=max_age_hours)
    ).isoformat()
    resp = (
        supabase.table("finnhub_news_cache")
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