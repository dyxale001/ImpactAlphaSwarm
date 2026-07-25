"""Exploratory asset-discovery agent (D-068) — the fourth agent.

Refreshes the per-universe candidate pool once a night instead of relying on the
hand-curated seed list alone. It decides **membership only** — which tickers the
analyst agents look at — never how they score. See DISCOVERY_AGENT_PLAN.md.

Pipeline (all wrapped so any stage failing degrades to the previous pool):
  1. Candidate generation  — StockTwits trending (+ optional Groq gap-filler)
  2. Validation funnel      — real US common stock, seasoned, big, liquid, covered
  3. Universe classification — static industry map first, Groq for the residue
  4. Scoring + hysteresis    — stable pools, capped churn, decay, quarantine

Only Stage 4's persistence touches the DB, and only when ``dry_run`` is False;
everything upstream is pure computation over injected data, so the ``--dry-run``
CLI can exercise the whole funnel against the live sources without writing.

External calls (StockTwits, Finnhub, Groq, yfinance) live in small module-level
functions so they are easy to stub in tests; the funnel/scoring/hysteresis logic
is pure.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from ..utils.ss_sources import _source_tier

try:
    import requests
except ImportError:  # pragma: no cover - requests is a hard dep in prod
    requests = None

try:
    import cloudscraper
except ImportError:  # pragma: no cover
    cloudscraper = None

logger = logging.getLogger("asset-discovery")

# ── Universes (must match the seed labels / onboardingData.ts exactly) ────────
UNIVERSES = ["Technology", "Green Energy", "Finance", "AI & Robotics", "Healthcare"]

# ── Config (all env-tunable; see DISCOVERY_AGENT_PLAN.md §9) ───────────────────
DISCOVERY_LLM_FILLER = os.getenv("DISCOVERY_LLM_FILLER", "true").lower() == "true"
DISCOVERY_MAX_NEW_PER_NIGHT = int(os.getenv("DISCOVERY_MAX_NEW_PER_NIGHT", "5"))
DISCOVERY_MIN_MARKET_CAP_USD = float(os.getenv("DISCOVERY_MIN_MARKET_CAP_USD", "2e9"))
DISCOVERY_MIN_IPO_AGE_DAYS = int(os.getenv("DISCOVERY_MIN_IPO_AGE_DAYS", "180"))
DISCOVERY_MIN_AVG_DOLLAR_VOL = float(os.getenv("DISCOVERY_MIN_AVG_DOLLAR_VOL", "1e7"))
DISCOVERY_MIN_NEWS_ARTICLES = int(os.getenv("DISCOVERY_MIN_NEWS_ARTICLES", "1"))
DISCOVERY_NEWS_LOOKBACK_DAYS = int(os.getenv("DISCOVERY_NEWS_LOOKBACK_DAYS", "7"))
DISCOVERY_DECAY_FACTOR = float(os.getenv("DISCOVERY_DECAY_FACTOR", "0.7"))
DISCOVERY_RETIRE_THRESHOLD = float(os.getenv("DISCOVERY_RETIRE_THRESHOLD", "0.1"))
DISCOVERY_LLM_CANDIDATES = int(os.getenv("DISCOVERY_LLM_CANDIDATES", "15"))
# Scoring blend weights (trending / trusted-news / liquidity).
W_TREND = float(os.getenv("DISCOVERY_W_TREND", "0.5"))
W_NEWS = float(os.getenv("DISCOVERY_W_NEWS", "0.3"))
W_LIQ = float(os.getenv("DISCOVERY_W_LIQ", "0.2"))
# Normalisation caps so a single huge value can't dominate a component.
NEWS_SCORE_CAP = int(os.getenv("DISCOVERY_NEWS_SCORE_CAP", "10"))
LIQ_SCORE_CAP = float(os.getenv("DISCOVERY_LIQ_SCORE_CAP", "5e8"))  # $500M/day saturates

FINNHUB_BASE = "https://finnhub.io/api/v1"
STOCKTWITS_TRENDING_URL = "https://api.stocktwits.com/api/2/trending/symbols.json"
STOCKTWITS_STREAM_HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Finnhub finnhubIndustry (substring, lowercased) → universe. First match wins.
# Deliberately partial: Technology/Finance/Healthcare classify cleanly here;
# Green Energy and (especially) AI & Robotics are not real industry categories,
# so their residue falls through to the Groq classifier.
INDUSTRY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Green Energy", ("renewable", "solar", "wind", "hydrogen", "clean energy")),
    ("Healthcare", ("pharmaceutic", "biotech", "health", "life sciences", "medical", "drug")),
    ("Finance", ("bank", "insurance", "financial", "capital markets", "asset management")),
    ("Technology", ("semiconductor", "software", "technology", "hardware", "electronic",
                    "communications", "telecommunication", "internet", "media")),
]


@dataclass
class Candidate:
    """A ticker moving through the funnel. Fields fill in as stages complete."""
    ticker: str
    sources: list[str] = field(default_factory=list)
    watchlist_count: int = 0
    name: str = ""
    universe: Optional[str] = None
    industry: Optional[str] = None
    market_cap_usd: Optional[float] = None
    ipo_date: Optional[str] = None
    dollar_volume: Optional[float] = None
    news_count: int = 0
    score: float = 0.0


# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — candidate generation
# ══════════════════════════════════════════════════════════════════════════════

def _new_session():
    """A cloudscraper session (StockTwits shields with Cloudflare), falling back
    to plain requests. Mirrors ss_social's approach."""
    if cloudscraper is not None:
        try:
            return cloudscraper.create_scraper(
                browser={"browser": "chrome", "platform": "linux", "desktop": True}
            )
        except Exception:
            pass
    return requests


def fetch_stocktwits_trending() -> list[dict[str, Any]]:
    """Return [{ticker, watchlist_count}] from StockTwits trending. Crypto (``.``
    suffix, e.g. BTC.X) dropped. Best-effort: [] on any failure."""
    if requests is None and cloudscraper is None:
        return []
    session = _new_session()
    client_id = os.getenv("STOCKTWITS_CLIENT_ID")
    params = {"client_id": client_id} if client_id else {}
    try:
        resp = session.get(
            STOCKTWITS_TRENDING_URL, params=params, headers=STOCKTWITS_STREAM_HEADERS, timeout=10
        )
        if resp.status_code != 200:
            logger.info("StockTwits trending returned HTTP %s", resp.status_code)
            return []
        payload = resp.json()
    except Exception as exc:
        logger.info("StockTwits trending fetch failed: %s", exc)
        return []

    out = []
    for entry in (payload.get("symbols", []) if isinstance(payload, dict) else []):
        symbol = (entry.get("symbol") or "").upper().strip()
        if not symbol or "." in symbol:  # drop crypto / non-common suffixes
            continue
        out.append({"ticker": symbol, "watchlist_count": int(entry.get("watchlist_count") or 0)})
    return out


def llm_gap_fill(universe: str) -> list[str]:
    """Ask Groq for liquid US-listed names in a universe (for quiet universes that
    rarely trend). Hallucination is acceptable — every name still runs the funnel.
    Best-effort: [] if the LLM is unavailable or returns junk."""
    llm = _get_groq()
    if llm is None:
        return []
    prompt = (
        f"List up to {DISCOVERY_LLM_CANDIDATES} large, liquid, US-listed (NYSE or NASDAQ) "
        f"common-stock companies in the '{universe}' sector. Return ONLY a JSON array of "
        f'ticker symbol strings, e.g. ["AAA","BBB"]. No prose.'
    )
    raw = _groq_text(llm, prompt)
    tickers = _parse_ticker_array(raw)
    return tickers


# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — validation funnel  (pure gates + thin Finnhub/yfinance fetchers)
# ══════════════════════════════════════════════════════════════════════════════

def finnhub_us_common_stock_set() -> set[str]:
    """Set of US 'Common Stock' tickers from Finnhub's symbol directory (one call,
    meant to be cached for the day by the caller). Empty set on failure — which
    makes Stage 2 reject everything and the pool ages a night, never corrupts."""
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if requests is None or not api_key:
        return set()
    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/stock/symbol",
            params={"exchange": "US", "token": api_key},
            timeout=15,
        )
        if resp.status_code != 200:
            return set()
        rows = resp.json()
    except Exception as exc:
        logger.info("Finnhub symbol directory fetch failed: %s", exc)
        return set()
    return {
        (r.get("symbol") or "").upper()
        for r in (rows if isinstance(rows, list) else [])
        if r.get("type") == "Common Stock" and r.get("symbol")
    }


def finnhub_profile(ticker: str) -> dict[str, Any]:
    """Company profile (profile2). {} on failure/no-coverage."""
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if requests is None or not api_key:
        return {}
    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/stock/profile2",
            params={"symbol": ticker, "token": api_key},
            timeout=10,
        )
        if resp.status_code != 200:
            return {}
        return resp.json() or {}
    except Exception as exc:
        logger.info("Finnhub profile fetch failed for %s: %s", ticker, exc)
        return {}


def finnhub_trusted_news_count(ticker: str, now: Optional[datetime] = None) -> int:
    """Count trusted-tier company-news articles in the lookback window. Reuses the
    sentiment scout's publisher tiers (``_source_tier``)."""
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if requests is None or not api_key:
        return 0
    now = now or datetime.now(timezone.utc)
    date_to = now.date().isoformat()
    date_from = (now.date() - timedelta(days=max(1, DISCOVERY_NEWS_LOOKBACK_DAYS))).isoformat()
    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/company-news",
            params={"symbol": ticker, "from": date_from, "to": date_to, "token": api_key},
            timeout=10,
        )
        if resp.status_code != 200:
            return 0
        articles = resp.json()
    except Exception as exc:
        logger.info("Finnhub company-news fetch failed for %s: %s", ticker, exc)
        return 0
    if not isinstance(articles, list):
        return 0
    return sum(1 for a in articles if _source_tier(a.get("source", "")) is not None)


def yfinance_avg_dollar_volume(ticker: str) -> Optional[float]:
    """Average daily dollar volume over ~1 month. None if unmeasurable (the gate
    then fails open — a validated large cap is not rejected on a data hiccup)."""
    try:
        import yfinance as yf

        hist = yf.Ticker(ticker).history(period="1mo", interval="1d", auto_adjust=False)
        if hist is None or hist.empty or "Close" not in hist or "Volume" not in hist:
            return None
        dollar = (hist["Close"] * hist["Volume"]).dropna()
        if dollar.empty:
            return None
        return float(dollar.mean())
    except Exception as exc:
        logger.info("yfinance dollar-volume fetch failed for %s: %s", ticker, exc)
        return None


def _ipo_age_days(ipo: Optional[str], today: date) -> Optional[int]:
    if not ipo:
        return None
    try:
        return (today - date.fromisoformat(str(ipo)[:10])).days
    except (ValueError, TypeError):
        return None


def _exchange_ok(exchange: str) -> bool:
    ex = (exchange or "").upper()
    return "NASDAQ" in ex or "NEW YORK STOCK EXCHANGE" in ex or ex.startswith("NYSE")


def profile_gate(candidate: Candidate, profile: dict, today: date) -> Optional[str]:
    """Apply the seasoning / size / exchange gates to a fetched profile, mutating
    the candidate with the cached facts. Returns a rejection reason, or None if it
    passes."""
    market_cap = (profile.get("marketCapitalization") or 0) * 1e6  # Finnhub reports millions
    ipo = profile.get("ipo")
    exchange = profile.get("exchange") or ""
    candidate.name = profile.get("name") or candidate.name or candidate.ticker
    candidate.industry = profile.get("finnhubIndustry")
    candidate.market_cap_usd = market_cap or None
    candidate.ipo_date = str(ipo)[:10] if ipo else None

    age = _ipo_age_days(ipo, today)
    if age is None:
        return "no_ipo_date"
    if age < DISCOVERY_MIN_IPO_AGE_DAYS:
        return f"too_new({age}d)"
    if market_cap < DISCOVERY_MIN_MARKET_CAP_USD:
        return f"below_market_cap({market_cap:.0f})"
    if not _exchange_ok(exchange):
        return f"wrong_exchange({exchange})"
    return None


# ══════════════════════════════════════════════════════════════════════════════
# Stage 3 — universe classification
# ══════════════════════════════════════════════════════════════════════════════

def classify_by_industry(industry: Optional[str]) -> Optional[str]:
    """Static industry→universe map. None → hand off to the LLM classifier."""
    name = (industry or "").lower()
    if not name:
        return None
    for universe, keywords in INDUSTRY_KEYWORDS:
        if any(k in name for k in keywords):
            return universe
    return None


def llm_classify(tickers: list[str]) -> dict[str, str]:
    """Batch-classify leftover tickers into one of UNIVERSES or 'none'. Output is
    validated: only input tickers and known labels survive; 'none'/unknown are
    dropped rather than guessed."""
    if not tickers:
        return {}
    llm = _get_groq()
    if llm is None:
        return {}
    prompt = (
        "Classify each stock ticker into exactly one of these sectors: "
        f"{UNIVERSES + ['none']}. Use 'none' if it fits none well. "
        f"Tickers: {tickers}. "
        'Return ONLY a JSON object mapping ticker -> sector, e.g. {"AAA":"Technology"}.'
    )
    raw = _groq_text(llm, prompt)
    parsed = _parse_json_object(raw)
    valid_labels = set(UNIVERSES)
    input_set = set(tickers)
    out: dict[str, str] = {}
    for ticker, label in parsed.items():
        tk = str(ticker).upper()
        if tk in input_set and label in valid_labels:
            out[tk] = label
    return out


# ══════════════════════════════════════════════════════════════════════════════
# Stage 4 — scoring + hysteresis  (pure)
# ══════════════════════════════════════════════════════════════════════════════

def discovery_score(candidate: Candidate, max_watchlist: int) -> float:
    """Blend trending strength / trusted-news volume / liquidity into [0, 1].
    Membership/ordering only — never a user-facing rating."""
    trend = (candidate.watchlist_count / max_watchlist) if max_watchlist > 0 else 0.0
    news = min(candidate.news_count, NEWS_SCORE_CAP) / NEWS_SCORE_CAP if NEWS_SCORE_CAP else 0.0
    liq = (
        min(candidate.dollar_volume, LIQ_SCORE_CAP) / LIQ_SCORE_CAP
        if candidate.dollar_volume and LIQ_SCORE_CAP
        else 0.0
    )
    return round(W_TREND * trend + W_NEWS * news + W_LIQ * liq, 6)


@dataclass
class HysteresisPlan:
    """What Stage 4 decided for one universe (all keyed by ticker)."""
    new_entrants: list[str] = field(default_factory=list)   # fresh names entering tonight (≤ cap)
    refreshed: list[str] = field(default_factory=list)      # incumbents seen again tonight
    score_updates: dict[str, float] = field(default_factory=dict)  # decayed quiet incumbents kept
    retired: list[str] = field(default_factory=list)        # decayed below the floor
    deferred: list[str] = field(default_factory=list)       # fresh names over the nightly entrant cap


def apply_hysteresis(
    universe_incumbents: list[dict],
    fresh_scores: dict[str, float],
    now: datetime,
) -> HysteresisPlan:
    """Stabilise one universe's discovered pool.

    * incumbents seen tonight  → refreshed (upsert with the fresh score)
    * quiet, active incumbents → decayed ×DISCOVERY_DECAY_FACTOR; retired if the
      decayed score drops below DISCOVERY_RETIRE_THRESHOLD
    * quarantined incumbents   → left untouched until their quarantine expires
    * genuinely new names       → at most DISCOVERY_MAX_NEW_PER_NIGHT enter, by
      score; the rest are deferred (may enter a later night)
    """
    plan = HysteresisPlan()
    incumbent_tickers = set()
    for row in universe_incumbents:
        ticker = row.get("ticker")
        if not ticker:
            continue
        incumbent_tickers.add(ticker)
        if ticker in fresh_scores:
            plan.refreshed.append(ticker)
            continue
        # No fresh evidence tonight.
        if _still_quarantined(row.get("quarantined_until"), now) or not row.get("is_active", True):
            continue  # benched/retired incumbents are not decayed
        decayed = round(float(row.get("discovery_score") or 0.0) * DISCOVERY_DECAY_FACTOR, 6)
        if decayed < DISCOVERY_RETIRE_THRESHOLD:
            plan.retired.append(ticker)
        else:
            plan.score_updates[ticker] = decayed

    new_names = [t for t in fresh_scores if t not in incumbent_tickers]
    new_names.sort(key=lambda t: (-fresh_scores[t], t))
    plan.new_entrants = new_names[:DISCOVERY_MAX_NEW_PER_NIGHT]
    plan.deferred = new_names[DISCOVERY_MAX_NEW_PER_NIGHT:]
    return plan


def _still_quarantined(quarantined_until: Any, now: datetime) -> bool:
    if not quarantined_until:
        return False
    try:
        until = datetime.fromisoformat(str(quarantined_until).replace("Z", "+00:00"))
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        return until > now
    except (ValueError, TypeError):
        return False


# ══════════════════════════════════════════════════════════════════════════════
# Groq helpers (thin; isolated for stubbing)
# ══════════════════════════════════════════════════════════════════════════════

def _get_groq():
    key = os.getenv("GROQ_API_KEY")
    if not key:
        return None
    try:
        from langchain_groq import ChatGroq

        return ChatGroq(
            api_key=key,
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            temperature=0.2,
            max_tokens=600,
        )
    except Exception as exc:  # pragma: no cover
        logger.info("Groq init failed: %s", exc)
        return None


def _groq_text(llm, prompt: str) -> str:
    try:
        from langchain_core.messages import HumanMessage

        return (llm.invoke([HumanMessage(content=prompt)]).content or "").strip()
    except Exception as exc:
        logger.info("Groq invoke failed: %s", exc)
        return ""


def _extract_json(raw: str) -> str:
    """Pull the first JSON array/object out of an LLM reply (which may wrap it in
    prose or ```json fences)."""
    if not raw:
        return ""
    for open_c, close_c in (("[", "]"), ("{", "}")):
        start = raw.find(open_c)
        end = raw.rfind(close_c)
        if start != -1 and end > start:
            return raw[start : end + 1]
    return ""


def _parse_ticker_array(raw: str) -> list[str]:
    try:
        data = json.loads(_extract_json(raw) or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [str(t).upper().strip() for t in data if isinstance(t, str) and t.strip()]


def _parse_json_object(raw: str) -> dict:
    try:
        data = json.loads(_extract_json(raw) or "{}")
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


# ══════════════════════════════════════════════════════════════════════════════
# Orchestration
# ══════════════════════════════════════════════════════════════════════════════

def _gather_candidates() -> dict[str, Candidate]:
    """Stage 1: merge sources into a deduped {ticker: Candidate}, recording
    provenance. Trending first; the LLM gap-filler tops up every universe."""
    candidates: dict[str, Candidate] = {}

    for entry in fetch_stocktwits_trending():
        ticker = entry["ticker"]
        cand = candidates.setdefault(ticker, Candidate(ticker=ticker))
        cand.watchlist_count = max(cand.watchlist_count, entry["watchlist_count"])
        if "stocktwits_trending" not in cand.sources:
            cand.sources.append("stocktwits_trending")

    if DISCOVERY_LLM_FILLER:
        for universe in UNIVERSES:
            for ticker in llm_gap_fill(universe):
                cand = candidates.setdefault(ticker, Candidate(ticker=ticker))
                if "llm" not in cand.sources:
                    cand.sources.append("llm")
    return candidates


def _validate(
    candidates: dict[str, Candidate], now: datetime
) -> tuple[list[Candidate], list[dict]]:
    """Stage 2: run the funnel; return survivors and a rejection log."""
    rejections: list[dict] = []
    us_common = finnhub_us_common_stock_set()
    today = now.date()
    survivors: list[Candidate] = []

    for ticker, cand in sorted(candidates.items()):
        if us_common and ticker not in us_common:
            rejections.append({"ticker": ticker, "stage": "symbol_directory", "reason": "not_us_common_stock"})
            continue

        reason = profile_gate(cand, finnhub_profile(ticker), today)
        if reason:
            rejections.append({"ticker": ticker, "stage": "profile", "reason": reason})
            continue

        vol = yfinance_avg_dollar_volume(ticker)
        cand.dollar_volume = vol
        if vol is not None and vol < DISCOVERY_MIN_AVG_DOLLAR_VOL:
            rejections.append({"ticker": ticker, "stage": "liquidity", "reason": f"illiquid({vol:.0f})"})
            continue

        cand.news_count = finnhub_trusted_news_count(ticker, now)
        if cand.news_count < DISCOVERY_MIN_NEWS_ARTICLES:
            rejections.append({"ticker": ticker, "stage": "researchability", "reason": "no_trusted_news"})
            continue

        survivors.append(cand)
    return survivors, rejections


def _classify(survivors: list[Candidate]) -> None:
    """Stage 3: set candidate.universe in place (static map, then LLM residue)."""
    residue: list[str] = []
    by_ticker = {c.ticker: c for c in survivors}
    for cand in survivors:
        cand.universe = classify_by_industry(cand.industry)
        if cand.universe is None:
            residue.append(cand.ticker)
    for ticker, universe in llm_classify(residue).items():
        if ticker in by_ticker:
            by_ticker[ticker].universe = universe


def refresh_discovery(dry_run: bool = False) -> dict[str, Any]:
    """Entry point: run the nightly discovery pass. Returns a summary dict. When
    ``dry_run`` is True, computes everything (reading the current pool) but writes
    nothing — the pre-shadow verification tool and demo material."""
    now = datetime.now(timezone.utc)
    summary: dict[str, Any] = {"universes": {}, "dry_run": dry_run}

    candidates = _gather_candidates()
    survivors, rejections = _validate(candidates, now)
    _classify(survivors)

    # Group classified survivors by universe and score them.
    by_universe: dict[str, list[Candidate]] = {u: [] for u in UNIVERSES}
    for cand in survivors:
        if cand.universe in by_universe:
            by_universe[cand.universe].append(cand)
        else:
            rejections.append({"ticker": cand.ticker, "stage": "classification", "reason": "no_universe"})

    from ..utils.supabase_client import (
        get_discovery_pool_rows,
        upsert_discovered_asset,
        update_discovery_scores,
        retire_assets,
        record_discovery_run,
    )

    pool_rows = get_discovery_pool_rows(UNIVERSES)
    incumbents_by_universe: dict[str, list[dict]] = {u: [] for u in UNIVERSES}
    for row in pool_rows:
        if row.get("origin") == "discovered" and row.get("universe") in incumbents_by_universe:
            incumbents_by_universe[row["universe"]].append(row)

    for universe in UNIVERSES:
        cands = by_universe[universe]
        max_watchlist = max((c.watchlist_count for c in cands), default=0)
        for cand in cands:
            cand.score = discovery_score(cand, max_watchlist)
        fresh_scores = {c.ticker: c.score for c in cands}
        cand_by_ticker = {c.ticker: c for c in cands}

        plan = apply_hysteresis(incumbents_by_universe[universe], fresh_scores, now)
        entering = plan.new_entrants + plan.refreshed

        if not dry_run:
            for ticker in entering:
                c = cand_by_ticker[ticker]
                upsert_discovered_asset(
                    ticker=c.ticker,
                    name=c.name,
                    universe=universe,
                    discovery_score=c.score,
                    sources=c.sources,
                    market_cap_usd=c.market_cap_usd,
                    ipo_date=c.ipo_date,
                )
            if plan.score_updates:
                update_discovery_scores(plan.score_updates)
            if plan.retired:
                retire_assets(plan.retired)

        summary["universes"][universe] = {
            "candidates": len(cands),
            "new_entrants": plan.new_entrants,
            "refreshed": len(plan.refreshed),
            "decayed": len(plan.score_updates),
            "retired": plan.retired,
            "deferred": len(plan.deferred),
        }

    summary["total_candidates"] = len(candidates)
    summary["validated"] = len(survivors)
    summary["rejections"] = len(rejections)

    if not dry_run:
        record_discovery_run(summary=summary, rejections=rejections, status="ok")
    else:
        summary["rejection_detail"] = rejections
    return summary


def _main() -> None:  # pragma: no cover - CLI
    import argparse

    from dotenv import load_dotenv

    load_dotenv()  # pick up backend/.env when run standalone (dry-run testing)

    parser = argparse.ArgumentParser(description="Run the asset-discovery pass.")
    parser.add_argument("--dry-run", action="store_true", help="Compute pools without writing.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    result = refresh_discovery(dry_run=args.dry_run)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":  # pragma: no cover
    _main()
