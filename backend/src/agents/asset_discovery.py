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

## Structure

Each stage is a small hierarchy, and each network call sits behind a client so a
test can drive the whole pass without a socket.

	CandidateSource (ABC)        stage 1 — where names come from
	├── StockTwitsTrendingSource
	└── LlmGapFillSource

	Gate (ABC)                   stage 2 — one rejection rule each, applied in order
	├── SymbolDirectoryGate      is it a real US common stock?
	├── ProfileGate              seasoned enough, big enough, listed here?
	├── LiquidityGate            can it actually be traded?
	└── ResearchabilityGate      is anyone trustworthy writing about it?

	Classifier (ABC)             stage 3 — which universe does it belong to?
	├── IndustryClassifier       the static map
	└── LlmClassifier            the residue the map cannot place

The funnel is a chain: a candidate is offered to each gate in turn and the first
one to return a reason stops it, which is why the rejection log can name the exact
stage that ended a ticker's run. Adding a gate is adding a class and one list
entry — the funnel itself does not change.

`SourceFactory` builds the enabled sources from configuration, so
``DISCOVERY_LLM_FILLER`` decides which objects exist rather than being an ``if``
buried inside the gathering loop.

`DiscoveryRun` is the facade over all four stages. Every collaborator is
injectable with the production default, so ``DiscoveryRun()`` is the nightly pass
and a test can substitute a fake source, a fake client, or a single gate.
"""

from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
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
# Groq helpers (thin; isolated for stubbing)
# ══════════════════════════════════════════════════════════════════════════════

def _get_groq():
    # 3000 rather than 600: classifying a whole residue of tickers is the most
    # demanding prompt here and spends most of its tokens reasoning, which left
    # nothing for the answer under the old budget. Headroom is not billed, and a
    # ceiling reached mid-thought produces an empty reply rather than a shorter one.
    from ..utils.llm_client import GroqClient

    # Discovery names its own account so its usage stays legible in the Groq
    # dashboards, separate from the reasoning traces. It shares that account with a
    # trace lane, which is safe on both counts that matter: the two never issue a
    # call in the same minute (api.run_daily awaits this pass to completion before
    # the batch, and discovery never runs on the interactive path), and this agent
    # spends about six calls a night in total against the daily quota.
    return GroqClient.create(
        purpose="discovery",
        max_tokens=3000,
        temperature=0.2,
        key_env="GROQ_API_KEY3",
        fallback_key_env="GROQ_API_KEY",
    )


def _groq_text(llm, prompt: str) -> str:
    try:
        return llm.complete(prompt)
    except Exception as exc:
        # Warning, not info: at the default LOG_LEVEL an info line is invisible, which
        # is how a model retirement went unnoticed across a whole run.
        logger.warning("Groq invoke failed for discovery: %s", exc)
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
# External clients — the network seam
# ══════════════════════════════════════════════════════════════════════════════

class StockTwitsClient:
    """Trending symbols. Best-effort: [] on any failure."""

    @staticmethod
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

    def trending(self) -> list[dict[str, Any]]:
        """Return [{ticker, watchlist_count}]. Crypto (``.`` suffix, e.g. BTC.X)
        dropped."""
        if requests is None and cloudscraper is None:
            return []
        session = self._new_session()
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


class FinnhubClient:
    """The three Finnhub reads the funnel needs. Every one degrades to an empty
    answer rather than raising, so a Finnhub outage ages the pool by a night
    instead of corrupting it."""

    @staticmethod
    def _api_key() -> str:
        return os.getenv("FINNHUB_API_KEY", "").strip()

    def us_common_stock_set(self) -> set[str]:
        """Set of US 'Common Stock' tickers from Finnhub's symbol directory (one call,
        meant to be cached for the day by the caller). Empty set on failure — which
        makes Stage 2 reject everything and the pool ages a night, never corrupts."""
        api_key = self._api_key()
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

    def profile(self, ticker: str) -> dict[str, Any]:
        """Company profile (profile2). {} on failure/no-coverage."""
        api_key = self._api_key()
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

    def trusted_news_count(self, ticker: str, now: Optional[datetime] = None) -> int:
        """Count trusted-tier company-news articles in the lookback window. Reuses the
        sentiment scout's publisher tiers (``_source_tier``)."""
        api_key = self._api_key()
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


class LiquiditySource:
    """Average traded value, from yfinance."""

    def avg_dollar_volume(self, ticker: str) -> Optional[float]:
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


# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — candidate generation
# ══════════════════════════════════════════════════════════════════════════════

class CandidatePool:
    """The deduped ``{ticker: Candidate}`` being assembled, plus the universes we
    failed to survey.

    That second half matters as much as the first: hysteresis reads an absent
    ticker as "did not show up tonight" and decays it, so a universe we could not
    look at must stay distinguishable from a universe with nothing in it.
    """

    def __init__(self):
        self.candidates: dict[str, Candidate] = {}
        self.unsurveyed: set[str] = set()

    def add(self, ticker: str, source: str, watchlist_count: int = 0) -> Candidate:
        cand = self.candidates.setdefault(ticker, Candidate(ticker=ticker))
        cand.watchlist_count = max(cand.watchlist_count, watchlist_count)
        if source not in cand.sources:
            cand.sources.append(source)
        return cand

    def mark_unsurveyed(self, universe: str) -> None:
        self.unsurveyed.add(universe)


class CandidateSource(ABC):
    """Somewhere candidate tickers come from."""

    name: str = "source"

    @abstractmethod
    def contribute(self, pool: CandidatePool) -> None:
        """Add this source's names to the pool, recording provenance."""


class StockTwitsTrendingSource(CandidateSource):
    """What retail is watching tonight, with the watchlist counts the score uses."""

    name = "stocktwits_trending"

    def __init__(self, client: StockTwitsClient | None = None):
        self.client = client or StockTwitsClient()

    def contribute(self, pool: CandidatePool) -> None:
        for entry in self.client.trending():
            pool.add(entry["ticker"], self.name, entry["watchlist_count"])


class LlmGapFillSource(CandidateSource):
    """Tops up universes that rarely trend, by asking Groq for liquid US names.

    Hallucination is acceptable — every name still runs the full funnel.
    """

    name = "llm"

    def __init__(self, universes: list[str] | None = None):
        self.universes = universes if universes is not None else UNIVERSES

    def tickers_for(self, universe: str) -> Optional[list[str]]:
        """Returns the tickers, or ``None`` when the call could not be made or
        produced nothing usable.

        None and [] must stay distinct: [] is a real answer meaning the model found
        nothing, while None means we learned nothing at all this run. The caller
        decays a universe's incumbents on the strength of an empty result, so
        treating a failure as [] retires assets on the back of a model hiccup.
        """
        llm = _get_groq()
        if llm is None:
            return None
        prompt = (
            f"List up to {DISCOVERY_LLM_CANDIDATES} large, liquid, US-listed (NYSE or NASDAQ) "
            f"common-stock companies in the '{universe}' sector. Return ONLY a JSON array of "
            f'ticker symbol strings, e.g. ["AAA","BBB"]. No prose.'
        )
        raw = _groq_text(llm, prompt)
        if not raw:
            return None
        tickers = _parse_ticker_array(raw)
        if not tickers:
            # Well-formed but empty, or unparseable. Either way we cannot tell this
            # apart from a failure, so do not let it stand in for evidence.
            logger.warning("Discovery gap fill for %s returned no usable tickers", universe)
            return None
        return tickers

    def contribute(self, pool: CandidatePool) -> None:
        for universe in self.universes:
            tickers = self.tickers_for(universe)
            if tickers is None:
                pool.mark_unsurveyed(universe)
                continue
            for ticker in tickers:
                pool.add(ticker, self.name)


class SourceFactory:
    """Builds the candidate sources that configuration says are switched on.

    Keeps ``DISCOVERY_LLM_FILLER`` a question about which objects exist, rather
    than a branch inside the gathering loop.
    """

    @staticmethod
    def from_config() -> list[CandidateSource]:
        sources: list[CandidateSource] = [StockTwitsTrendingSource()]
        if DISCOVERY_LLM_FILLER:
            sources.append(LlmGapFillSource())
        return sources


# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — validation funnel
# ══════════════════════════════════════════════════════════════════════════════

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


@dataclass
class FunnelContext:
    """What every gate is allowed to know about tonight's run."""
    now: datetime
    today: date
    us_common: set[str]


class Gate(ABC):
    """One rejection rule in the validation funnel.

    Gates enrich as they filter: the profile gate caches the facts it fetched onto
    the candidate, because those same facts are what the pool row is built from
    later. A gate returns the reason it rejected, so the run's rejection log can
    name the exact stage a ticker died at.
    """

    stage: str = "gate"

    @abstractmethod
    def check(self, candidate: Candidate, ctx: FunnelContext) -> Optional[str]:
        """Rejection reason, or None to let the candidate through."""


class SymbolDirectoryGate(Gate):
    """Is this a real US common stock, per Finnhub's directory?"""

    stage = "symbol_directory"

    def check(self, candidate: Candidate, ctx: FunnelContext) -> Optional[str]:
        # An empty directory means the fetch failed, not that nothing is listed;
        # the gate stands down rather than rejecting the entire night.
        if ctx.us_common and candidate.ticker not in ctx.us_common:
            return "not_us_common_stock"
        return None


class ProfileGate(Gate):
    """Seasoned enough, big enough, and listed on a US primary exchange?"""

    stage = "profile"

    def __init__(self, client: FinnhubClient | None = None):
        self.client = client or FinnhubClient()

    def apply(self, candidate: Candidate, profile: dict, today: date) -> Optional[str]:
        """The pure half: judge an already-fetched profile, caching its facts."""
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

    def check(self, candidate: Candidate, ctx: FunnelContext) -> Optional[str]:
        return self.apply(candidate, self.client.profile(candidate.ticker), ctx.today)


class LiquidityGate(Gate):
    """Can it actually be traded in size?"""

    stage = "liquidity"

    def __init__(self, source: LiquiditySource | None = None):
        self.source = source or LiquiditySource()

    def check(self, candidate: Candidate, ctx: FunnelContext) -> Optional[str]:
        vol = self.source.avg_dollar_volume(candidate.ticker)
        candidate.dollar_volume = vol
        # Fails OPEN: an unmeasurable volume is a data hiccup, not evidence of
        # illiquidity, and a validated large cap should not be dropped for it.
        if vol is not None and vol < DISCOVERY_MIN_AVG_DOLLAR_VOL:
            return f"illiquid({vol:.0f})"
        return None


class ResearchabilityGate(Gate):
    """Is anyone trustworthy writing about it? Without coverage there is nothing
    for the sentiment scout to read."""

    stage = "researchability"

    def __init__(self, client: FinnhubClient | None = None):
        self.client = client or FinnhubClient()

    def check(self, candidate: Candidate, ctx: FunnelContext) -> Optional[str]:
        candidate.news_count = self.client.trusted_news_count(candidate.ticker, ctx.now)
        if candidate.news_count < DISCOVERY_MIN_NEWS_ARTICLES:
            return "no_trusted_news"
        return None


class ValidationFunnel:
    """Runs each candidate through the gates in order, keeping a rejection log.

    The first gate to object stops that candidate — which is what makes the log
    readable as "this is where it died", and what keeps the expensive gates from
    being paid for names the cheap ones already excluded.
    """

    def __init__(
        self,
        gates: list[Gate] | None = None,
        finnhub: FinnhubClient | None = None,
        liquidity: LiquiditySource | None = None,
    ):
        self.finnhub = finnhub or FinnhubClient()
        self.gates = gates if gates is not None else [
            SymbolDirectoryGate(),
            ProfileGate(self.finnhub),
            LiquidityGate(liquidity or LiquiditySource()),
            ResearchabilityGate(self.finnhub),
        ]

    def run(
        self, candidates: dict[str, Candidate], now: datetime
    ) -> tuple[list[Candidate], list[dict]]:
        """Return survivors and a rejection log."""
        ctx = FunnelContext(
            now=now,
            today=now.date(),
            us_common=self.finnhub.us_common_stock_set(),
        )
        survivors: list[Candidate] = []
        rejections: list[dict] = []

        # Sorted so a run is reproducible ticker-for-ticker.
        for _ticker, cand in sorted(candidates.items()):
            reason = None
            for gate in self.gates:
                reason = gate.check(cand, ctx)
                if reason:
                    rejections.append(
                        {"ticker": cand.ticker, "stage": gate.stage, "reason": reason}
                    )
                    break
            if not reason:
                survivors.append(cand)
        return survivors, rejections


# ══════════════════════════════════════════════════════════════════════════════
# Stage 3 — universe classification
# ══════════════════════════════════════════════════════════════════════════════

class Classifier(ABC):
    """Places candidates into one of UNIVERSES."""

    @abstractmethod
    def classify(self, candidates: list[Candidate]) -> dict[str, str]:
        """Map ticker → universe. A ticker it cannot place is simply absent."""


class IndustryClassifier(Classifier):
    """The static industry→universe map. Free, deterministic, and right for the
    three universes that are real industry categories."""

    def of(self, industry: Optional[str]) -> Optional[str]:
        name = (industry or "").lower()
        if not name:
            return None
        for universe, keywords in INDUSTRY_KEYWORDS:
            if any(k in name for k in keywords):
                return universe
        return None

    def classify(self, candidates: list[Candidate]) -> dict[str, str]:
        out = {}
        for cand in candidates:
            universe = self.of(cand.industry)
            if universe:
                out[cand.ticker] = universe
        return out


class LlmClassifier(Classifier):
    """Groq, for the residue the static map cannot place — mainly Green Energy and
    AI & Robotics, which are not Finnhub industry categories at all."""

    def classify(self, candidates: list[Candidate]) -> dict[str, str]:
        return self.of_tickers([c.ticker for c in candidates])

    def of_tickers(self, tickers: list[str]) -> dict[str, str]:
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


class ClassificationChain:
    """Cheap classifier first; whatever it cannot place falls through to the next.

    Ordering is the whole design: the static map costs nothing and is never wrong,
    so the LLM is only ever asked about the residue.
    """

    def __init__(self, classifiers: list[Classifier] | None = None):
        self.classifiers = classifiers if classifiers is not None else [
            IndustryClassifier(),
            LlmClassifier(),
        ]

    def apply(self, survivors: list[Candidate]) -> None:
        """Set ``candidate.universe`` in place."""
        by_ticker = {c.ticker: c for c in survivors}
        unplaced = list(survivors)
        for cand in survivors:
            cand.universe = None

        for classifier in self.classifiers:
            if not unplaced:
                break
            for ticker, universe in classifier.classify(unplaced).items():
                if ticker in by_ticker:
                    by_ticker[ticker].universe = universe
            unplaced = [c for c in unplaced if c.universe is None]


# ══════════════════════════════════════════════════════════════════════════════
# Stage 4 — scoring + hysteresis  (pure)
# ══════════════════════════════════════════════════════════════════════════════

class DiscoveryScorer:
    """Blend trending strength / trusted-news volume / liquidity into [0, 1].
    Membership/ordering only — never a user-facing rating."""

    def score(self, candidate: Candidate, max_watchlist: int) -> float:
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


class HysteresisPolicy:
    """Stabilise one universe's discovered pool.

    * incumbents seen tonight  → refreshed (upsert with the fresh score)
    * quiet, active incumbents → decayed ×DISCOVERY_DECAY_FACTOR; retired if the
      decayed score drops below DISCOVERY_RETIRE_THRESHOLD
    * quarantined incumbents   → left untouched until their quarantine expires
    * genuinely new names       → at most DISCOVERY_MAX_NEW_PER_NIGHT enter, by
      score; the rest are deferred (may enter a later night)
    """

    def still_quarantined(self, quarantined_until: Any, now: datetime) -> bool:
        if not quarantined_until:
            return False
        try:
            until = datetime.fromisoformat(str(quarantined_until).replace("Z", "+00:00"))
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
            return until > now
        except (ValueError, TypeError):
            # Failing open on purpose: a malformed timestamp must not silently
            # freeze a ticker in the pool for ever.
            return False

    def plan(
        self,
        universe_incumbents: list[dict],
        fresh_scores: dict[str, float],
        now: datetime,
    ) -> HysteresisPlan:
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
            if self.still_quarantined(row.get("quarantined_until"), now) or not row.get("is_active", True):
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


# ══════════════════════════════════════════════════════════════════════════════
# Orchestration
# ══════════════════════════════════════════════════════════════════════════════

class DiscoveryRun:
    """The facade over all four stages.

    Every collaborator defaults to the production implementation, so
    ``DiscoveryRun()`` is the nightly pass and a test can replace a source, a
    client or a single gate without touching the rest.
    """

    def __init__(
        self,
        sources: list[CandidateSource] | None = None,
        funnel: ValidationFunnel | None = None,
        classifier: ClassificationChain | None = None,
        scorer: DiscoveryScorer | None = None,
        hysteresis: HysteresisPolicy | None = None,
    ):
        self.sources = sources if sources is not None else SourceFactory.from_config()
        self.funnel = funnel or ValidationFunnel()
        self.classifier = classifier or ClassificationChain()
        self.scorer = scorer or DiscoveryScorer()
        self.hysteresis = hysteresis or HysteresisPolicy()

    def gather(self) -> CandidatePool:
        """Stage 1: merge every source into a deduped pool, recording provenance."""
        pool = CandidatePool()
        for source in self.sources:
            source.contribute(pool)
        return pool

    def group_by_universe(
        self, survivors: list[Candidate], rejections: list[dict]
    ) -> dict[str, list[Candidate]]:
        by_universe: dict[str, list[Candidate]] = {u: [] for u in UNIVERSES}
        for cand in survivors:
            if cand.universe in by_universe:
                by_universe[cand.universe].append(cand)
            else:
                rejections.append(
                    {"ticker": cand.ticker, "stage": "classification", "reason": "no_universe"}
                )
        return by_universe

    def execute(self, dry_run: bool = False) -> dict[str, Any]:
        """Run the nightly discovery pass. Returns a summary dict. When ``dry_run``
        is True, computes everything (reading the current pool) but writes nothing —
        the pre-shadow verification tool and demo material."""
        now = datetime.now(timezone.utc)
        summary: dict[str, Any] = {"universes": {}, "dry_run": dry_run}

        pool = self.gather()
        survivors, rejections = self.funnel.run(pool.candidates, now)
        self.classifier.apply(survivors)
        by_universe = self.group_by_universe(survivors, rejections)

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

            # A universe we failed to survey is not a universe with nothing in it.
            # Hysteresis reads an absent ticker as "did not show up tonight", decaying it
            # and retiring the weakest, so running that on a failed gap fill punishes real
            # assets for a model hiccup (it took DUK out of Green Energy). Anything we did
            # find is still good evidence and gets recorded; only the penalties are held
            # back, because those are the half that rests on not having seen a ticker.
            surveyed = universe not in pool.unsurveyed
            if not surveyed:
                logger.warning(
                    "Discovery: %s was not surveyed this run, holding back decay and "
                    "retirement for its %d incumbents",
                    universe,
                    len(incumbents_by_universe[universe]),
                )

            max_watchlist = max((c.watchlist_count for c in cands), default=0)
            for cand in cands:
                cand.score = self.scorer.score(cand, max_watchlist)
            fresh_scores = {c.ticker: c.score for c in cands}
            cand_by_ticker = {c.ticker: c for c in cands}

            plan = self.hysteresis.plan(incumbents_by_universe[universe], fresh_scores, now)
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
                if plan.score_updates and surveyed:
                    update_discovery_scores(plan.score_updates)
                if plan.retired and surveyed:
                    retire_assets(plan.retired)

            summary["universes"][universe] = {
                "candidates": len(cands),
                "new_entrants": plan.new_entrants,
                "refreshed": len(plan.refreshed),
                "decayed": len(plan.score_updates) if surveyed else 0,
                "retired": plan.retired if surveyed else [],
                "deferred": len(plan.deferred),
                **({} if surveyed else {"unsurveyed": "gap_fill_failed"}),
            }

        summary["total_candidates"] = len(pool.candidates)
        summary["validated"] = len(survivors)
        summary["rejections"] = len(rejections)

        if not dry_run:
            record_discovery_run(summary=summary, rejections=rejections, status="ok")
        else:
            summary["rejection_detail"] = rejections
        return summary


# ══════════════════════════════════════════════════════════════════════════════
# Published surface — thin delegations
# ══════════════════════════════════════════════════════════════════════════════
# `api.run_daily` and the orchestrator call `refresh_discovery`; the unit suite
# calls the pure stages by name. They stay so the class layer above is something
# callers adopt at their own pace, not a breaking change.

_STOCKTWITS = StockTwitsClient()
_FINNHUB = FinnhubClient()
_LIQUIDITY = LiquiditySource()
_INDUSTRY = IndustryClassifier()
_SCORER = DiscoveryScorer()
_HYSTERESIS = HysteresisPolicy()


def _new_session():
    return StockTwitsClient._new_session()


def fetch_stocktwits_trending() -> list[dict[str, Any]]:
    return _STOCKTWITS.trending()


def llm_gap_fill(universe: str) -> Optional[list[str]]:
    return LlmGapFillSource().tickers_for(universe)


def finnhub_us_common_stock_set() -> set[str]:
    return _FINNHUB.us_common_stock_set()


def finnhub_profile(ticker: str) -> dict[str, Any]:
    return _FINNHUB.profile(ticker)


def finnhub_trusted_news_count(ticker: str, now: Optional[datetime] = None) -> int:
    return _FINNHUB.trusted_news_count(ticker, now)


def yfinance_avg_dollar_volume(ticker: str) -> Optional[float]:
    return _LIQUIDITY.avg_dollar_volume(ticker)


def profile_gate(candidate: Candidate, profile: dict, today: date) -> Optional[str]:
    return ProfileGate(_FINNHUB).apply(candidate, profile, today)


def classify_by_industry(industry: Optional[str]) -> Optional[str]:
    return _INDUSTRY.of(industry)


def llm_classify(tickers: list[str]) -> dict[str, str]:
    return LlmClassifier().of_tickers(tickers)


def discovery_score(candidate: Candidate, max_watchlist: int) -> float:
    return _SCORER.score(candidate, max_watchlist)


def apply_hysteresis(
    universe_incumbents: list[dict],
    fresh_scores: dict[str, float],
    now: datetime,
) -> HysteresisPlan:
    return _HYSTERESIS.plan(universe_incumbents, fresh_scores, now)


def _still_quarantined(quarantined_until: Any, now: datetime) -> bool:
    return _HYSTERESIS.still_quarantined(quarantined_until, now)


def refresh_discovery(dry_run: bool = False) -> dict[str, Any]:
    return DiscoveryRun().execute(dry_run=dry_run)


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
