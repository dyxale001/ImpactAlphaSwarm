"""Supabase access for the whole backend.

## Structure

Every table this backend touches has one repository, and each repository owns the
reads and writes for its own concern:

	Repository (ABC)             holds the client; degrades instead of raising
	├── UserRepository           user_analysis + auth
	├── AssetRepository          assets — identity and universe lookups
	├── AiRunRepository          ai_runs — the per-user run lock
	├── RecommendationRepository ai_recommendation
	├── RankingRepository        ranking_shadow
	├── NewsCacheRepository      the article caches
	├── DiscoveryRepository      the discovered-asset pool + its audit log
	└── SentimentHistoryRepository  the one freshness read over the daily sentiment tables

The base class exists for one shared rule rather than for shared code: **a failure
reaching Supabase degrades, it does not raise.** A read that cannot be served
returns an empty answer so the pipeline ages its data by a night; the alternative
is a single flaky call failing a whole nightly batch. Each method keeps its own
message, because which read failed is the useful part of the log line.

`NewsCacheRepository` is one class with two instances rather than two classes: the
Marketaux and Finnhub caches are the same table shape and the same read/write, and
were previously four near-identical functions differing only in a table name.

Every repository takes its client, defaulting to the module-level one. That is
what lets a test drive them against a fake rather than a live project.

Not everything here is a class. `normalize_risk_tolerance` is a pure lookup over a
dict of spellings and gains nothing from being wrapped in one, so it stays a
function.

The module-level functions at the bottom are thin delegations to a default set of
repositories. They are the published surface — `api.py`, the orchestrator and the
discovery agent all import them by name — so they keep working unchanged.
"""

import os
import uuid
import datetime
import json
import threading
import time
from abc import ABC
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


_MISS = object()


class _TtlCache:
    """Values that expire, shared safely between threads.

    Small on purpose: the two things cached here are a handful of currency codes
    and a handful of exchange rates, so there is nothing to evict.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: Dict[str, tuple] = {}

    def get(self, key: str) -> Any:
        """The stored value, or ``_MISS`` when absent or expired."""
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return _MISS
            expires_at, value = entry
            if expires_at <= time.monotonic():
                self._entries.pop(key, None)
                return _MISS
            return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        with self._lock:
            self._entries[key] = (time.monotonic() + ttl_seconds, value)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


class ZarPriceConverter:
    """A ticker's latest close, expressed in rand.

    The exchange rate is the same for every asset in a run and the currency a
    ticker trades in changes about never, but both used to be fetched per asset.
    Saving 17 assets therefore paid for 17 USD/ZAR lookups, and each of those is a
    pair of yfinance calls, because the direct ``USDZAR=X`` pair returns nothing
    and it falls back to the inverted one. Yahoo answers cloud IPs slowly, which
    made the save loop cost around a minute an asset.

    Both lookups are cached here, so a run pays for one rate rather than one per
    asset. The price itself is never cached: that is the number being recorded.
    """

    # Shorter than a run takes, so a rate is fetched once per run and a quote
    # served to a user is never more than this old.
    FX_TTL_SECONDS = 900
    # A failed lookup is held briefly, only so a broken pair does not get retried
    # once per asset. Holding it for the full TTL would spoil a whole run.
    FX_FAILURE_TTL_SECONDS = 60
    CURRENCY_TTL_SECONDS = 86_400

    # Rand cents, quoted by the JSE for some instruments.
    _SUBUNIT_CURRENCIES = {"ZAC", "ZA CENT", "ZACP"}

    def __init__(self) -> None:
        self._fx_rates = _TtlCache()
        self._currencies = _TtlCache()

    def fx_rate(self, currency: str) -> float | None:
        """Units of rand per unit of ``currency``, or None if unavailable."""
        code = (currency or "").upper()
        if not code:
            return None
        if code == "ZAR":
            return 1.0

        cached = self._fx_rates.get(code)
        if cached is not _MISS:
            return cached

        rate = self._lookup_fx_rate(code)
        self._fx_rates.set(
            code,
            rate,
            self.FX_TTL_SECONDS if rate else self.FX_FAILURE_TTL_SECONDS,
        )
        return rate

    def currency_of(self, ticker: str) -> str | None:
        """The currency a ticker trades in, cached for the day."""
        cached = self._currencies.get(ticker)
        if cached is not _MISS:
            return cached

        currency = self._lookup_currency(ticker)
        self._currencies.set(ticker, currency, self.CURRENCY_TTL_SECONDS)
        return currency

    def price_in_zar(self, ticker: str) -> float | None:
        try:
            history = yf.Ticker(ticker).history(period="5d", interval="1d", auto_adjust=False)
            latest_close = _latest_close_from_history(history)
            if latest_close is None:
                return None

            currency = self.currency_of(ticker)
            if not currency or currency == "ZAR":
                return latest_close

            if currency in self._SUBUNIT_CURRENCIES:
                return latest_close / 100.0

            rate = self.fx_rate(currency)
            if rate is None:
                return latest_close

            return latest_close * rate
        except Exception as e:
            print(f"Failed to fetch yfinance price for {ticker}: {e}")
            return None

    def clear(self) -> None:
        """Drop both caches. For tests, and for a caller that wants a fresh rate."""
        self._fx_rates.clear()
        self._currencies.clear()

    def _lookup_currency(self, ticker: str) -> str | None:
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

    def _lookup_fx_rate(self, currency: str) -> float | None:
        pair_candidates = (
            (f"{currency}ZAR=X", False),
            (f"ZAR{currency}=X", True),
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


# One converter for the process, so its caches are shared by the save loop and by
# the endpoint that quotes the rate.
zar_prices = ZarPriceConverter()


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
#
# Left as a function deliberately: it is a pure lookup over the dict below and a
# class around it would add a name without adding a seam.

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


# ---------------------------------------------------------------------------
# Repositories
# ---------------------------------------------------------------------------

class Repository(ABC):
    """Base for the table-scoped repositories.

    Two things live here. The client, which every repository needs and none should
    construct; and the rule they all follow — **a Supabase failure degrades, it
    does not raise.** A read that cannot be served returns an empty answer so the
    pipeline ages its data by a night, because the alternative is one flaky call
    failing a whole nightly batch for every user.

    Each method keeps its own log message rather than inheriting a generic one:
    which read failed is the part worth reading in the log.
    """

    table_name: str = ""

    def __init__(self, client: Any = None):
        self._client = client

    @property
    def client(self) -> Any:
        # Resolved on use so the module-level client stays swappable in a test.
        return supabase if self._client is None else self._client

    def table(self, name: Optional[str] = None):
        return self.client.table(name or self.table_name)

    @staticmethod
    def _now_iso() -> str:
        return datetime.datetime.now(datetime.timezone.utc).isoformat()

    @staticmethod
    def _today_iso() -> str:
        return datetime.datetime.now(datetime.timezone.utc).date().isoformat()


class UserRepository(Repository):
    """Who the users are and what they asked for."""

    table_name = "user_analysis"

    def preferences(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Fetch user preferences from user_analysis table."""
        try:
            resp = self.table().select("*").eq("user_id", user_id).limit(1).execute()
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

    def active_ids(self, within_days: int = 7) -> List[str]:
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
                users = self.client.auth.admin.list_users(page=page, per_page=per_page)
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


class AssetRepository(Repository):
    """Asset identity and universe membership."""

    table_name = "assets"

    def tickers_in_universes(self, universes: List[str]) -> List[str]:
        """Fetch tickers for assets matching user's investment universes."""
        try:
            if not universes:
                return []

            # Query assets table for rows matching any of the universes
            resp = self.table().select("ticker").in_("universe", universes).execute()
            data = resp.data or []
            tickers = [row["ticker"] for row in data if row.get("ticker")]
            return list(set(tickers))  # Remove duplicates
        except Exception as e:
            print(f"Error fetching assets: {e}")
            return []

    def get_or_create_id(self, ticker: str) -> Optional[str]:
        resp = self.table().select("id").eq("ticker", ticker).limit(1).execute()
        data = resp.data or []
        if data:
            return data[0]["id"]
        # Optional: create a minimal asset row if your schema allows it
        new_resp = self.table().insert({"ticker": ticker, "name": ticker}).execute()
        new_data = new_resp.data or []
        return new_data[0]["id"] if new_data else None

    def universes_of(self, tickers: List[str]) -> Dict[str, str]:
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
                self.table()
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


# How long a run may sit in 'running' before it is presumed abandoned and may be
# claimed by a new one. Mirrors api.STALE_RUN_MINUTES, which heals such rows.
RUN_LOCK_STALE_MINUTES = int(os.getenv("STALE_RUN_MINUTES", "15"))


class AiRunRepository(Repository):
    """The per-user run lock.

    One row per user, and claiming it is what stops two requests running the same
    analysis twice.
    """

    table_name = "ai_runs"

    def acquire(
        self, user_id: str, stale_minutes: int = RUN_LOCK_STALE_MINUTES
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
        now_iso = self._now_iso()
        claim = {"status": "running", "created_at": now_iso}

        # 1. Claim the row only if it is NOT already running. One winner by construction.
        try:
            resp = (
                self.table()
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
                self.table()
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
                    self.table()
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
            resp = self.table().insert(
                {"user_id": user_id, "status": "running"}
            ).execute()
            data = resp.data or []
            if data:
                return data[0]["id"], True
        except Exception as e:
            print(f"Insert of ai_run lost a race for {user_id} ({e}); reading the winner")

        try:
            rows = (
                self.table()
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

    def create(self, user_id: str, status: str = "running") -> str:
        """Claim an ai_run row for the user and return its id.

        Thin wrapper over :meth:`acquire` kept for callers that do not care
        whether they won the claim. NOTE it no longer deletes the user's existing
        ai_recommendation rows: that used to happen at run START, so a failed or
        interrupted analysis left the dashboard empty. ``save_top_assets`` clears the
        run's rows immediately before inserting the new ones instead, which keeps
        yesterday's results visible until fresh ones exist.
        """
        run_id, _acquired = self.acquire(user_id)
        if not run_id:
            raise RuntimeError(f"Failed to create or claim an ai_run row for {user_id}")
        return run_id

    def update_status(self, run_id: str, status: str) -> None:
        self.table().update({
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


class RecommendationRepository(Repository):
    """What a run decided, per asset."""

    table_name = "ai_recommendation"

    def last_news_for_asset(self, asset_id: str) -> Optional[Dict[str, Any]]:
        """Most recent stored news for an asset that actually had articles, or None.

        Used to avoid overwriting good news with an empty result: when a run's news
        fetch comes back empty (a transient Finnhub failure, an empty cache), we carry
        the last non-empty news forward rather than zeroing what a prior run stored."""
        try:
            resp = (
                self.table()
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
        self,
        run_id: str,
        user_id: str,
        top_5: List[Dict[str, Any]],
        quant_results: Dict[str, Dict[str, Any]],
        sentiment_results: Dict[str, Dict[str, Any]],
        price_cache: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Persist a run's ranked assets. Rank is the caller's list position.

        The body lives in ``RecommendationWriter`` (rec_writer.py), which batches the
        asset-id, price and carried-forward-news lookups that used to run once per
        ticker in sequence. That per-ticker cost, about three seconds an asset, is
        what made keeping the whole ranked feed unaffordable. The parameter name
        ``top_5`` is historical: both callers now pass every ranked asset.
        """
        from .rec_writer import RecommendationWriter

        return RecommendationWriter().write(
            run_id=run_id,
            user_id=user_id,
            assets=top_5,
            quant_results=quant_results,
            sentiment_results=sentiment_results,
            price_cache=price_cache,
        )

    def recently_ranked_tickers(self, days: int = 3) -> List[str]:
        """Tickers that reached someone's ranked feed in the last ``days``.

        The backfill's ticker source. Anything here is something a user can open and expect
        a chart for, which is a tighter set than every row in ``assets`` and a wider one
        than any single user's watchlist.

        Read from the database rather than handed over by the nightly batch on purpose.
        ``run_daily_batch`` does return its ticker union, but coupling the two scheduler
        jobs that way means the backfill is only correct when it runs after a successful
        nightly; a query is correct whether it runs on schedule, by hand, or twice.

        Returns ``[]`` on any failure, so a backfill that cannot see the database does
        nothing rather than crawling a guess.
        """
        cutoff = (
            datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=max(1, days))
        ).isoformat()
        try:
            rows = (
                self.table()
                .select("asset_id,created_at")
                .gte("created_at", cutoff)
                .execute()
                .data
                or []
            )
            asset_ids = sorted({row["asset_id"] for row in rows if row.get("asset_id")})
            if not asset_ids:
                return []

            # One round trip for the symbols, matching the batching rule in rec_writer.
            assets = (
                self.table("assets")
                .select("id,ticker")
                .in_("id", asset_ids)
                .execute()
                .data
                or []
            )
            return sorted({a["ticker"].upper() for a in assets if a.get("ticker")})
        except Exception as e:
            print(f"Error listing recently ranked tickers: {e}")
            return []


class RankingRepository(Repository):
    """The unified ranking v2 shadow log (see migrations/010).

    One row per (run, candidate) covering the WHOLE scoped set, not just the
    surviving top 5. That breadth is the point: a strongly bearish asset never
    reaches a top 5, and divergent hype names were already demoted out of it by the
    old hype penalty, so neither the direction question nor the convergence term can
    be evaluated from `ai_recommendation` alone.
    """

    table_name = "ranking_shadow"

    def save_shadow(self, run_id: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
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

        night = self._today_iso()
        payload = [{**row, "run_id": run_id, "as_of_night": night} for row in rows]
        try:
            self.table().delete().eq("run_id", run_id).eq(
                "as_of_night", night
            ).execute()
        except Exception as e:
            print(f"Could not clear tonight's ranking_shadow slice ({e}); continuing")
        try:
            self.table().insert(payload).execute()
            return {"status": "saved", "rows": len(payload), "as_of_night": night}
        except Exception as e:
            print(f"Ranking shadow log failed (continuing): {e}")
            return {"status": "error", "error": str(e)}

    def previous_ranking(self, run_id: str, before_night: Optional[str] = None) -> Dict[str, int]:
        """Return ``{ticker: v2_rank}`` from this run's most recent EARLIER night.

        Feeds the ranking tie-band: near-equal candidates keep the order they had last
        night instead of flipping on noise. Returns ``{}`` on any failure or when there
        is no prior night, so the caller degrades to "no hysteresis" rather than
        failing — first run, missing migration and read error all behave the same.
        """
        if not run_id:
            return {}
        night = before_night or self._today_iso()
        try:
            rows = (
                self.table()
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


class NewsCacheRepository(Repository):
    """A per-ticker article cache.

    Two instances, one table each — the Marketaux and Finnhub caches have the same
    shape and the same reason to exist, and were four near-identical functions
    before. Marketaux: the nightly batch pulls tier-1 news against a tight call
    budget and writes it here, so user refreshes read it back instead of spending
    calls. Finnhub: capped at 60 calls/min per key, and querying it live on every
    refresh exhausted that budget and 429'd the news signal to nothing.
    """

    def __init__(self, table_name: str, client: Any = None):
        super().__init__(client)
        self.table_name = table_name

    def save(self, ticker_to_articles: Dict[str, List[Dict[str, Any]]]) -> None:
        """Upsert each ticker's articles into the cache (keyed by ticker). Tickers are
        written even with an empty list so a ticker that lost its coverage this run
        doesn't keep serving stale articles."""
        now = self._now_iso()
        rows = [
            {"ticker": ticker, "articles": articles or [], "fetched_at": now}
            for ticker, articles in ticker_to_articles.items()
        ]
        if not rows:
            return
        self.table().upsert(rows, on_conflict="ticker").execute()

    def load(
        self, tickers: List[str], max_age_hours: int = 48
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Return cached articles per ticker, fresher than ``max_age_hours``. Tickers
        with no fresh cache entry are omitted (so the caller can tell a cache miss
        apart from a genuinely empty result and top it up live)."""
        if not tickers:
            return {}
        cutoff = (
            datetime.datetime.now(datetime.timezone.utc)
            - datetime.timedelta(hours=max_age_hours)
        ).isoformat()
        resp = (
            self.table()
            .select("ticker,articles,fetched_at")
            .in_("ticker", tickers)
            .gte("fetched_at", cutoff)
            .execute()
        )
        out: Dict[str, List[Dict[str, Any]]] = {}
        for row in resp.data or []:
            out[row["ticker"]] = row.get("articles") or []
        return out


# Columns the ranked read (scope_tickers) needs; selection/quarantine policy is
# applied by the caller so it stays in one testable place.
DISCOVERY_POOL_COLUMNS = "ticker,universe,origin,is_active,discovery_score,quarantined_until"


class DiscoveryRepository(Repository):
    """The discovered-asset pool (see migrations/009) — D-068.

    Thin DB access for the nightly discovery agent. All scoring / decay /
    hysteresis LOGIC lives in agents/asset_discovery.py; this only reads and
    writes. Two invariants are enforced here, not left to the caller:
      * Seed rows (origin='seed') are never rescored, retired, quarantined or
        reclassified — every mutating write below is guarded on origin='discovered'
        so a curated seed passed in by mistake is harmlessly ignored.
      * Rows are retired/quarantined, never deleted, so ai_recommendation history
        keeps resolving.
    """

    table_name = "assets"
    audit_table_name = "discovery_runs"

    def pool_rows(self, universes: List[str]) -> List[Dict[str, Any]]:
        """Return the candidate rows (seeds + discovered) for the given universes in
        a single round trip. Ranking and active/quarantine filtering are the
        caller's job."""
        try:
            if not universes:
                return []
            resp = (
                self.table()
                .select(DISCOVERY_POOL_COLUMNS)
                .in_("universe", universes)
                .execute()
            )
            return resp.data or []
        except Exception as e:
            print(f"Error fetching discovery pool rows: {e}")
            return []

    def upsert_discovered(
        self,
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
                self.table()
                .select("id,origin")
                .eq("ticker", ticker)
                .limit(1)
                .execute()
                .data
                or []
            )
            now = self._now_iso()
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
                self.table().update(fields).eq("ticker", ticker).eq(
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
            self.table().insert(insert_row).execute()
            return {"status": "inserted", "ticker": ticker}
        except Exception as e:
            print(f"Error upserting discovered asset {ticker}: {e}")
            return {"status": "error", "ticker": ticker, "error": str(e)}

    def update_scores(self, score_by_ticker: Dict[str, float]) -> None:
        """Persist recomputed discovery scores (hysteresis decay) for DISCOVERED
        rows. Seeds are skipped via the origin guard."""
        for ticker, score in score_by_ticker.items():
            try:
                self.table().update({"discovery_score": score}).eq(
                    "ticker", ticker
                ).eq("origin", "discovered").execute()
            except Exception as e:
                print(f"Error updating discovery score for {ticker}: {e}")

    def retire(self, tickers: List[str], reason: str = "decayed_out") -> None:
        """Soft-retire DISCOVERED rows (is_active=false) — the decay floor. Never
        deletes; seeds skipped."""
        if not tickers:
            return
        try:
            self.table().update(
                {"is_active": False, "quarantine_reason": reason}
            ).in_("ticker", tickers).eq("origin", "discovered").execute()
        except Exception as e:
            print(f"Error retiring assets {tickers}: {e}")

    def quarantine(self, tickers: List[str], reason: str, until_iso: str) -> None:
        """Bench DISCOVERED rows until ``until_iso`` (seeds skipped)."""
        if not tickers:
            return
        try:
            self.table().update(
                {"quarantine_reason": reason, "quarantined_until": until_iso}
            ).in_("ticker", tickers).eq("origin", "discovered").execute()
        except Exception as e:
            print(f"Error quarantining assets {tickers}: {e}")

    def mark_quant_empty(self, tickers: List[str], quarantine_days: int = 30) -> None:
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
        self.quarantine(tickers, reason="no_quant_data", until_iso=until)

    def record_run(
        self,
        summary: Dict[str, Any],
        rejections: List[Dict[str, Any]],
        status: str,
    ) -> None:
        """Write one audit row per nightly discovery pass (best-effort; a failure to
        audit must not fail discovery)."""
        try:
            self.table(self.audit_table_name).insert(
                {"summary": summary, "rejections": rejections, "status": status}
            ).execute()
        except Exception as e:
            print(f"Error recording discovery run: {e}")


class SentimentHistoryRepository(Repository):
    """The daily sentiment history tables — social and news (migrations 019–023).

    These tables are WRITTEN by ``ss_daily`` / ``ns_daily`` and the intraday tick through
    their own lazily imported client, not through here. This repository holds only the
    one cross-table READ the assets header needs. It is its own class rather than a method
    on ``RankingRepository`` because "how fresh is the sentiment" is a different question
    from "how did the ranking go", and the tables are a different concern.
    """

    TABLES = ("social_sentiment_daily", "news_sentiment_daily")

    def last_updated(self) -> Optional[str]:
        """When sentiment data was last written, across every ticker.

        The more recent of ``social_sentiment_daily.updated_at`` and
        ``news_sentiment_daily.updated_at``. Both are touched by more than the nightly run
        now: the intraday tick and the lazy seed behind a chart write the social table, and a
        run's own scoring writes the news table, so "last AI run" on the assets header no
        longer bounds how fresh the sentiment behind those recommendations is. This answers
        the freshness question the run timestamp can no longer answer by itself.

        Deliberately global rather than scoped to one user's tickers. A tick walks whatever
        was recently ranked across every user, so a per-user figure would read almost
        identically to this one on any deployment with more than a handful of users, for the
        cost of a second parameter and a join this page does not otherwise need.

        Returns ``None`` on any failure or when both tables are empty, which the caller shows
        as "unknown" rather than a wrong guess.
        """
        try:
            latest: Optional[str] = None
            for table in self.TABLES:
                rows = (
                    self.table(table)
                    .select("updated_at")
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                stamp = rows[0]["updated_at"] if rows else None
                if stamp and (latest is None or stamp > latest):
                    latest = stamp
            return latest
        except Exception as e:
            print(f"Error reading sentiment last-updated: {e}")
            return None


# ---------------------------------------------------------------------------
# Published surface — thin delegations to the default repositories
# ---------------------------------------------------------------------------
# `api.py`, the orchestrator, the discovery agent and rec_writer all import these
# by name. They stay so the repositories above are something callers adopt at
# their own pace, not a breaking change.

_users = UserRepository()
_assets = AssetRepository()
_ai_runs = AiRunRepository()
_recommendations = RecommendationRepository()
_rankings = RankingRepository()
_marketaux_news = NewsCacheRepository("marketaux_news_cache")
_finnhub_news = NewsCacheRepository("finnhub_news_cache")
_discovery = DiscoveryRepository()
_sentiment_history = SentimentHistoryRepository()


def fetch_fx_rate_to_zar(currency: str) -> float | None:
    return zar_prices.fx_rate(currency)


def fetch_price_at_run_in_zar(ticker: str) -> float | None:
    return zar_prices.price_in_zar(ticker)


def get_user_preferences(user_id: str) -> Optional[Dict[str, Any]]:
    return _users.preferences(user_id)


def get_active_user_ids(within_days: int = 7) -> List[str]:
    return _users.active_ids(within_days)


def get_assets_by_universes(universes: List[str]) -> List[str]:
    return _assets.tickers_in_universes(universes)


def get_or_create_asset_id(ticker: str) -> Optional[str]:
    return _assets.get_or_create_id(ticker)


def get_asset_universes(tickers: List[str]) -> Dict[str, str]:
    return _assets.universes_of(tickers)


def acquire_ai_run(
    user_id: str, stale_minutes: int = RUN_LOCK_STALE_MINUTES
) -> tuple[Optional[str], bool]:
    return _ai_runs.acquire(user_id, stale_minutes)


def create_ai_run(user_id: str, status: str = "running") -> str:
    return _ai_runs.create(user_id, status)


def update_ai_run_status(run_id: str, status: str) -> None:
    _ai_runs.update_status(run_id, status)


def get_last_news_for_asset(asset_id: str) -> Optional[Dict[str, Any]]:
    return _recommendations.last_news_for_asset(asset_id)


def save_top_assets(
    run_id: str,
    user_id: str,
    top_5: List[Dict[str, Any]],
    quant_results: Dict[str, Dict[str, Any]],
    sentiment_results: Dict[str, Dict[str, Any]],
    price_cache: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return _recommendations.save_top_assets(
        run_id, user_id, top_5, quant_results, sentiment_results, price_cache
    )


# ---------------------------------------------------------------------------
# Unified ranking v2 shadow log (see migrations/010)
# ---------------------------------------------------------------------------
# One row per (run, candidate) covering the WHOLE scoped set, not just the
# surviving top 5. That breadth is the point: a strongly bearish asset never
# reaches a top 5, and divergent hype names were already demoted out of it by the
# old hype penalty, so neither the direction question nor the convergence term can
# be evaluated from `ai_recommendation` alone.


def save_ranking_shadow(run_id: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    return _rankings.save_shadow(run_id, rows)


def get_recently_ranked_tickers(days: int = 3) -> List[str]:
    return _recommendations.recently_ranked_tickers(days)


def get_sentiment_last_updated() -> Optional[str]:
    return _sentiment_history.last_updated()


def get_previous_ranking(run_id: str, before_night: Optional[str] = None) -> Dict[str, int]:
    return _rankings.previous_ranking(run_id, before_night)


def save_marketaux_news_cache(ticker_to_articles: Dict[str, List[Dict[str, Any]]]) -> None:
    _marketaux_news.save(ticker_to_articles)


def load_marketaux_news_cache(
    tickers: List[str], max_age_hours: int = 48
) -> Dict[str, List[Dict[str, Any]]]:
    return _marketaux_news.load(tickers, max_age_hours)


def save_finnhub_news_cache(ticker_to_articles: Dict[str, List[Dict[str, Any]]]) -> None:
    _finnhub_news.save(ticker_to_articles)


def load_finnhub_news_cache(
    tickers: List[str], max_age_hours: int = 48
) -> Dict[str, List[Dict[str, Any]]]:
    return _finnhub_news.load(tickers, max_age_hours)


def get_discovery_pool_rows(universes: List[str]) -> List[Dict[str, Any]]:
    return _discovery.pool_rows(universes)


def upsert_discovered_asset(
    ticker: str,
    name: str,
    universe: str,
    discovery_score: float,
    sources: List[str],
    market_cap_usd: Optional[float] = None,
    ipo_date: Optional[str] = None,
) -> Dict[str, Any]:
    return _discovery.upsert_discovered(
        ticker, name, universe, discovery_score, sources, market_cap_usd, ipo_date
    )


def update_discovery_scores(score_by_ticker: Dict[str, float]) -> None:
    _discovery.update_scores(score_by_ticker)


def retire_assets(tickers: List[str], reason: str = "decayed_out") -> None:
    _discovery.retire(tickers, reason)


def quarantine_assets(tickers: List[str], reason: str, until_iso: str) -> None:
    _discovery.quarantine(tickers, reason, until_iso)


def mark_quant_empty(tickers: List[str], quarantine_days: int = 30) -> None:
    _discovery.mark_quant_empty(tickers, quarantine_days)


def record_discovery_run(
    summary: Dict[str, Any],
    rejections: List[Dict[str, Any]],
    status: str,
) -> None:
    _discovery.record_run(summary, rejections, status)
