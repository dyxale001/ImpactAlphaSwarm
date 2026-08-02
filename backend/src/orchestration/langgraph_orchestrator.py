"""AlphaSwarm LangGraph Orchestrator

This module implements the four-phase analysis pipeline using LangGraph state machine:
1. Phase 1: Session Initialization & Data Scoping
2. Phase 2: Agentic Swarm Execution (Quant Analyst + Sentiment Scout in parallel)
3. Phase 3: Orchestrator Synthesis (Hype Check + Risk Engine + Ranking)
4. Phase 4: Explainable AI & Output Delivery
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langsmith.client import Client

from ..agents.quant_analyst import analyze_tickers as analyze_quant_tickers
from ..agents.sentiment_scout import analyze_tickers as analyze_sentiment_tickers
from ..utils.traces import QuantMetrics, SocialMention, Tracer
from ..utils.supabase_client import save_top_assets

load_dotenv()

logger = logging.getLogger(__name__)

LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY")
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "AlphaSwarm")
LANGSMITH_ENABLED = LANGSMITH_API_KEY is not None

if LANGSMITH_ENABLED:
    langsmith_client = Client(api_key=LANGSMITH_API_KEY)
    logger.info(f"LangSmith enabled - Project: {LANGSMITH_PROJECT}")
else:
    langsmith_client = None
    logger.warning("LangSmith not configured - set LANGSMITH_API_KEY to enable tracing")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if GROQ_API_KEY:
    groq_llm = ChatGroq(
        api_key=GROQ_API_KEY,
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        max_tokens=300,
    )
    logger.info("Groq LLM initialized for reasoning generation")
else:
    groq_llm = None
    logger.warning("GROQ_API_KEY not set - reasoning traces will be basic")

_current_tracer: Optional[Tracer] = None


def set_tracer(tracer: Optional[Tracer]):
    global _current_tracer
    _current_tracer = tracer


def get_tracer() -> Optional[Tracer]:
    return _current_tracer


# ── Reasoning-trace vocabulary (ranking v2) ──────────────────────────────────
# Plain-language renderings of the machine states, so the trace explains the same
# four terms the UI shows rather than the penalties v2 removed.

_AUDIENCE_GUIDANCE = {
    "novice": "Write in plain English for a retail investor who is new to investing. Avoid jargon, define any technical term briefly, and focus on the bottom line.",
    "intermediate": "Write for a retail investor who understands basic investing terms. Use some market language, but keep it clear and practical.",
    "advanced": "Write for an experienced retail investor. You may use technical market language, but keep the explanation concise and grounded in the metrics.",
}

_CONVERGENCE_WORDS = {
    "agree_strongly": "the price data and the news/social tone point the same way",
    "lean_together": "the price data and the news/social tone broadly agree",
    "mixed": "the price data and the news/social tone only partly agree",
    "conflict": "the price data and the news/social tone CONTRADICT each other",
}

_QUANT_STATE_WORDS = {
    "cross_sectional": "measured and ranked against the other assets in this run",
    "insufficient_universe": "measured, but there were too few comparable assets to rank it today",
    "no_data": "no usable price history was available",
    "unmeasured": "no measurement was recorded for this asset",
}

# Language that would turn a description into a recommendation. D-081 forbids
# prescription (no licence in SA); D-082 positions the product as information, not
# advice. The trace may explain WHY something ranks where it does; it may never
# say what to do about it.
_ADVICE_PROHIBITION = (
    "HARD RULES — the product is legally not allowed to give advice:\n"
    "- NEVER use: buy, sell, hold, should, must, recommend, advise, target price, "
    "undervalued, overvalued, opportunity, bargain, avoid.\n"
    "- NEVER look forward. No predictions and no forward-looking nouns either — "
    "not 'outlook', 'prospects', 'potential', 'poised to', 'set to rebound'.\n"
    "- Describe only what the measurements SAY and why that places the asset where "
    "it is in the list. Present tense, factual, no verdict on quality.\n"
    "STYLE — this is read by a retail investor, not a quant desk:\n"
    "- Name only the ONE or TWO factors that actually drove the placement. Do not "
    "recite all four, and do not list a factor that had no effect (a fit of 1.00 "
    "changed nothing — say nothing about it).\n"
    "- Quote at most one number, and only if it helps. Prefer plain words "
    "('the two signals disagree') over scores ('agreement 0.51')."
)


def _describe_terms(terms: dict) -> str:
    """Render the four disclosed terms as prompt lines the model can paraphrase."""
    weights = terms.get("ranking_weights") or {}
    quant_state = terms.get("quant_state")
    lines = [
        f"- Signal strength: {terms.get('signal_strength'):.2f} of 1.00 "
        f"(direction: {terms.get('signal_direction')})",
        f"- Agreement between the two signals: {terms.get('convergence'):.2f} of 1.00 — "
        f"{_CONVERGENCE_WORDS.get(terms.get('convergence_state'), 'partly agree')}",
        f"- Depth of available evidence: {terms.get('data_sufficiency'):.2f} of 1.00",
        f"- Fit with the user's stated risk preference: {terms.get('profile_fit'):.2f} of 1.00 "
        f"(1.00 = no mismatch; lower = more volatile than they asked for)",
        f"- Price-data status: {_QUANT_STATE_WORDS.get(quant_state, quant_state)}",
    ]
    if weights:
        lines.append(
            f"- Disclosed weighting used: price data {weights.get('quant')} / "
            f"news+social tone {weights.get('sentiment')}"
        )
    if not terms.get("has_sentiment", True):
        lines.append("- NOTE: no news or social coverage was found, so the tone signal is neutral by default, not genuinely balanced.")
    return "\n".join(lines)


def _reasoning_fallback(ticker: str, terms: Optional[dict], expertise_level: str) -> str:
    """Deterministic trace for when the LLM is unavailable. Describes the terms;
    asserts no verdict (the old fallback said 'strong fundamentals' / 'looks
    solid', which is exactly the advisory framing the pivot removes)."""
    if terms and terms.get("convergence_state"):
        agreement = _CONVERGENCE_WORDS.get(terms["convergence_state"], "partly agree")
        detail = (
            f"{ticker} places here because {agreement}"
            f" (agreement {terms.get('convergence', 0):.2f}, signal strength "
            f"{terms.get('signal_strength', 0):.2f}, evidence depth "
            f"{terms.get('data_sufficiency', 0):.2f})."
        )
        if terms.get("profile_fit", 1.0) < 1.0:
            detail += " It is also more volatile than the risk preference on file."
        if expertise_level == "novice":
            return (
                f"{detail} These are measurements of what the data currently shows, "
                "not a view on whether to invest."
            )
        return detail
    return f"{ticker}: ranking inputs were unavailable for this run."


def generate_reasoning_trace(
    ticker: str,
    quant_data: dict,
    sentiment_data: dict,
    adjustments: dict,
    risk_tolerance: str,
    expertise_level: str,
    terms: Optional[dict] = None,
) -> str:
    """Explain why an asset placed where it did.

    When ``terms`` carries the ranking-v2 breakdown the trace describes those four
    disclosed factors, so what the user READS matches what ordered the feed. Without
    it (v2 disabled) the legacy penalty-based prompt is used unchanged.
    """
    use_v2 = bool(terms and terms.get("rank_score") is not None)

    if not groq_llm:
        if use_v2:
            return _reasoning_fallback(ticker, terms, expertise_level)
        return f"Quant Score: {quant_data.get('raw_quant_score', 'N/A')}, Sentiment: {sentiment_data.get('sentiment_score', 'N/A')}"

    try:
        audience_guidance = _AUDIENCE_GUIDANCE

        audience_note = audience_guidance.get(expertise_level, audience_guidance["novice"])

        # Guard the float formatting: beta is None/absent for unmeasured tickers,
        # and `{beta:.2f}` raises on a non-number — which previously sent every
        # such ticker to the exception fallback below instead of the real prompt.
        beta = quant_data.get("beta")
        beta_text = f"{beta:.2f}" if isinstance(beta, (int, float)) else "not available"

        if use_v2:
            prompt = f"""Explain, in 1-2 sentences, why {ticker} sits where it does in a list of assets shown to one user.

Audience guidance:
- Expertise level: {expertise_level}
- Instruction: {audience_note}

The list is ordered by four disclosed factors, multiplied together. For {ticker}:
{_describe_terms(terms)}

Supporting measurements (facts, for colour — do not re-score them):
- Sentiment score: {sentiment_data.get('sentiment_score', 'N/A')}/100 from {sentiment_data.get('news_count', 0)} trusted articles and {sentiment_data.get('mention_count', 0)} social posts
- RSI: {quant_data.get('rsi', 'N/A')} · Sharpe: {quant_data.get('sharpe_ratio', 'N/A')} · Beta: {beta_text}
- The user's stated risk preference: {risk_tolerance}

{_ADVICE_PROHIBITION}

Write it so the user can see WHICH factor drove the placement — above all when the
two signals disagree, the evidence is thin, or it clashes with their risk
preference. Those three are the things worth telling them about."""
        else:
            prompt = f"""Generate a concise 1-2 sentence investment reasoning for {ticker} based on:

    Audience guidance:
    - Expertise level: {expertise_level}
    - Instruction: {audience_note}

Technical Signals:
- RSI: {quant_data.get('rsi', 'N/A')}
- MACD Signal: {quant_data.get('macd', 'N/A')}
- Sharpe Ratio: {quant_data.get('sharpe_ratio', 'N/A')}
- Beta: {beta_text}

Market Sentiment:
- Sentiment Score: {sentiment_data.get('sentiment_score', 'N/A')}/100
- Bullish Posts: {sentiment_data.get('bullish_posts', 0)}
- Bearish Posts: {sentiment_data.get('bearish_posts', 0)}

Risk Adjustments:
- Hype Penalty: {adjustments.get('hype_penalty', 0)}
- Risk Penalty: {adjustments.get('risk_penalty', 0)}
- User Profile: {risk_tolerance}

Provide a brief, actionable explanation of why this asset ranks where it does. Match the wording to the expertise level, and avoid sounding like an institutional analyst when the user is a retail investor."""

        message = HumanMessage(content=prompt)
        response = groq_llm.invoke([message])
        reasoning = response.content.strip()

        logger.debug(f"Generated reasoning for {ticker}: {reasoning}")
        return reasoning

    except Exception as e:
        logger.warning(f"Failed to generate reasoning for {ticker}: {e}")
        if use_v2:
            return _reasoning_fallback(ticker, terms, expertise_level)
        # Legacy fallback, reworded: the old text asserted "Strong fundamentals"
        # and "This stock looks solid", which is a quality verdict — the exact
        # advisory framing D-081/D-082 rule out. State the inputs instead.
        base_reasoning = (
            f"Quant score {quant_data.get('raw_quant_score', 'N/A')} and sentiment "
            f"{sentiment_data.get('sentiment_score', 'N/A')} for this run."
        )
        if expertise_level == "novice":
            return (
                f"{base_reasoning} These are measurements of what the data currently "
                "shows, not a view on whether to invest."
            )
        return base_reasoning


class AnalysisState(TypedDict):
    user_id: str
    risk_tolerance: str
    expertise_level: str
    universes: list[str]
    watchlist: list[str]
    tickers: list[str]
    quant_results: dict[str, dict]
    sentiment_results: dict[str, dict]
    final_rankings: list[dict]
    run_id: str
    status: str



# Hard cap on tickers analysed per run. Bounds the manual-run latency budget and
# the nightly union. Env-tunable to match the rest of the config surface.
MAX_SCOPED_TICKERS = int(os.getenv("MAX_SCOPED_TICKERS", "30"))

# Discovery-agent read switches (see DISCOVERY_AGENT_PLAN.md / D-068). Off by
# default: scope_tickers behaves exactly as the legacy seeded path until the flag
# is flipped, and shadow mode lets discovery run + persist without being read.
DISCOVERY_ENABLED = os.getenv("DISCOVERY_ENABLED", "false").lower() == "true"
DISCOVERY_SHADOW_MODE = os.getenv("DISCOVERY_SHADOW_MODE", "true").lower() == "true"
DISCOVERY_POOL_SIZE = int(os.getenv("DISCOVERY_POOL_SIZE", "15"))
# Fixed score seeds carry in the union ranking; discovered names (score > this)
# outrank seeds, so seeds fill only the shortfall to DISCOVERY_POOL_SIZE.
DISCOVERY_SEED_BASELINE_SCORE = float(os.getenv("DISCOVERY_SEED_BASELINE_SCORE", "0.0"))

# Unified ranking v2 switches (see UNIFIED_SCORING_PLAN.md / D-087). Off by
# default: the legacy confidence score orders the feed exactly as before. In
# shadow mode the v2 terms are computed and persisted for EVERY candidate while
# the legacy order is still served, which is what makes the open direction and
# convergence questions answerable from data rather than argument.
UNIFIED_RANKING_ENABLED = os.getenv("UNIFIED_RANKING_ENABLED", "false").lower() == "true"
UNIFIED_RANKING_SHADOW = os.getenv("UNIFIED_RANKING_SHADOW", "true").lower() == "true"


def _is_quarantined(quarantined_until: Any, now: datetime) -> bool:
    """True if a discovered row is still benched. Unparseable timestamps fail
    open (treated as not quarantined) so a bad value can't silently shrink the
    pool below the quant crowd."""
    if not quarantined_until:
        return False
    try:
        until = datetime.fromisoformat(str(quarantined_until).replace("Z", "+00:00"))
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        return until > now
    except (ValueError, TypeError):
        return False


def _rank_universe(rows: list[dict], now: datetime) -> list[str]:
    """Rank one universe's candidate rows into its top-``DISCOVERY_POOL_SIZE``.

    Seeds are always eligible at the fixed baseline score; discovered rows must
    be active and not currently quarantined. Ties break on ticker so the order
    is deterministic run-to-run (keeps the cap and quant crowd stable)."""
    scored: list[tuple[float, str]] = []
    for row in rows:
        ticker = row.get("ticker")
        if not ticker:
            continue
        if row.get("origin") == "seed":
            score = DISCOVERY_SEED_BASELINE_SCORE
        else:
            if not row.get("is_active"):
                continue
            if _is_quarantined(row.get("quarantined_until"), now):
                continue
            raw = row.get("discovery_score")
            score = float(raw) if raw is not None else 0.0
        scored.append((score, ticker))
    scored.sort(key=lambda pair: (-pair[0], pair[1]))
    return [ticker for _, ticker in scored[:DISCOVERY_POOL_SIZE]]


def _select_from_pool(
    pool_rows: list[dict],
    universes: list[str],
    watchlist: list[str],
    now: datetime,
) -> list[str]:
    """Assemble the scoped list from the discovered pool: watchlist first (kept
    even if inactive/quarantined — personalization outranks pool hygiene), then a
    round-robin across the user's universes by rank so each universe is fairly
    represented under the cap. Deduped, capped at ``MAX_SCOPED_TICKERS``."""
    by_universe: dict[str, list[dict]] = {u: [] for u in universes}
    for row in pool_rows:
        universe = row.get("universe")
        if universe in by_universe:
            by_universe[universe].append(row)
    ranked = {u: _rank_universe(by_universe[u], now) for u in universes}

    ordered = list(watchlist)
    depth = max((len(names) for names in ranked.values()), default=0)
    for rank in range(depth):
        for universe in universes:
            names = ranked[universe]
            if rank < len(names):
                ordered.append(names[rank])
    return list(dict.fromkeys(ordered))[:MAX_SCOPED_TICKERS]


def scope_tickers(universes: list[str], watchlist: list[str] | None = None) -> list[str]:
    """Resolve a user's investment universes (+ watchlist) to a capped, deduped
    ticker list. Shared by the per-user graph and the batched daily run.

    When discovery is enabled and live, the set is drawn from the ranked
    discovered pool (top ``DISCOVERY_POOL_SIZE`` per universe from discovered ∪
    seeds); otherwise — and whenever the pool read is empty (migration not
    applied, discovery never ran, or a read failure) — it falls back to the
    legacy seeded path. Both paths are deterministic and watchlist-first: a
    user's watchlisted tickers come first so the cap can never drop them.
    """
    watchlist = list(dict.fromkeys(watchlist or []))

    if DISCOVERY_ENABLED and not DISCOVERY_SHADOW_MODE:
        from ..utils.supabase_client import get_discovery_pool_rows

        pool_rows = get_discovery_pool_rows(universes)
        if pool_rows:
            return _select_from_pool(
                pool_rows, universes, watchlist, datetime.now(timezone.utc)
            )
        # Empty pool → degrade to the seeded path rather than starve the run.

    from ..utils.supabase_client import get_assets_by_universes

    universe_tickers = get_assets_by_universes(universes)
    # dict.fromkeys dedups while preserving first-seen order: watchlist entries
    # win their slot, then universe tickers (sorted) fill the remainder.
    ordered = list(dict.fromkeys([*watchlist, *sorted(universe_tickers)]))
    return ordered[:MAX_SCOPED_TICKERS]



def phase_1_initialize(state: AnalysisState) -> dict[str, Any]:
    print("- Phase 1: Initializing session and scoping data...")

    from ..utils.supabase_client import get_assets_by_universes

    # Fetch tickers from Supabase by universe
    tickers = get_assets_by_universes(state["universes"])
    tickers.extend(state["watchlist"])
    tickers = list(set(tickers))[:30]

    print(f"Curated {len(tickers)} tickers for analysis")
    tracer = get_tracer()
    if tracer:
        tracer.tickers = tickers
        tracer.log_step(
            "phase_1_init",
            {
                "tickers_count": len(tickers),
                "universes": state["universes"],
                "watchlist_count": len(state["watchlist"]),
                # Whether this scope came from the discovered pool or the legacy
                # seeded path (observability for the shadow/live rollout).
                "discovery_enabled": DISCOVERY_ENABLED and not DISCOVERY_SHADOW_MODE,
            },
        )
    return {
        "tickers": tickers,
        "status": "initialized",
        "quant_results": {},
        "sentiment_results": {},
    }


def phase_2_quant_analyst(state: AnalysisState) -> dict[str, Any]:
    print("- Phase 2A: Quant Analyst analyzing market data...")
    tracer = get_tracer()
    try:
        quant_results = analyze_quant_tickers(state["tickers"])

        if tracer:
            for ticker, metrics in quant_results.items():
                quant_metrics = QuantMetrics(
                    ticker=ticker,
                    rsi=metrics.get("rsi"),
                    macd_signal=metrics.get("macd"),
                    sharpe_ratio=metrics.get("sharpe_ratio"),
                    beta=metrics.get("beta"),
                    volatility=metrics.get("volatility"),
                    raw_quant_score=metrics.get("raw_quant_score"),
                )
                tracer.add_quant_metrics(ticker, quant_metrics)
            tracer.log_step("phase_2_quant", {"count": len(quant_results), "tickers": list(quant_results.keys())})

        print(f"  ✓ Computed metrics for {len(quant_results)} assets")
        return {"quant_results": quant_results}

    except Exception as e:
        logger.warning("Quant analyst failed: %s", e)
        print("Quant analyst failed; no quant results available")
        return {"quant_results": {}}


def phase_2_sentiment_scout(state: AnalysisState) -> dict[str, Any]:
    print("- Phase 2B: Sentiment Scout scraping social signals...")
    tracer = get_tracer()
    try:
        sentiment_results = analyze_sentiment_tickers(state["tickers"])
    except Exception as e:
        logger.warning("Sentiment scout failed: %s", e)
        print("Sentiment scout failed; no sentiment results available")
        sentiment_results = {}

    if tracer:
        for ticker, sentiment_data in sentiment_results.items():
            tracer.add_sentiment_output(ticker, sentiment_data)
        tracer.log_step(
            "phase_2_sentiment",
            {
                "count": len(sentiment_results),
                "tickers": list(sentiment_results.keys()),
            },
        )

    print(f"  ✓ Analyzed sentiment for {len(sentiment_results)} assets")
    return {"sentiment_results": sentiment_results}


def _apply_ranking_v2(
    tickers: list[str],
    unified_scores: dict[str, dict],
    legacy_order: list[dict],
    quant_results: dict[str, dict],
    sentiment_results: dict[str, dict],
    risk_tolerance: str,
    run_id: str | None,
    user_id: str | None = None,
) -> list[dict]:
    """Compute the disclosed v2 terms for every candidate, log them, and return the
    top 5 in whichever order is currently authoritative.

    In shadow mode the LEGACY order is still served — only the log is written — so
    a night of real data can settle the open questions (plan §12/§13) without any
    user seeing a changed feed.
    """
    from . import ranking
    from ..utils.supabase_client import (
        RANKING_V2_COLUMNS,
        get_asset_universes,
        get_previous_ranking,
        save_ranking_shadow,
    )

    ranked = ranking.rank_assets(tickers, quant_results, sentiment_results, risk_tolerance)
    v2_rank_by_ticker = {row["ticker"]: i + 1 for i, row in enumerate(ranked)}
    legacy_rank_by_ticker = {row["ticker"]: i + 1 for i, row in enumerate(legacy_order)}

    # Feed stability: hold near-equal candidates in last night's order so ranks stop
    # flipping on noise. Read BEFORE tonight's shadow write, or we'd read ourselves.
    # Both orders are persisted so a shadow night can compare legacy vs v2-raw vs
    # v2-stable churn before the mechanism is committed to.
    # Stamped onto each shadow row so per-user and per-universe reads need no join
    # (migration 012). One round trip for the whole candidate set.
    universe_by_ticker = get_asset_universes([row["ticker"] for row in ranked]) if run_id else {}

    previous_rank = get_previous_ranking(run_id) if run_id else {}
    stabilised = ranking.apply_stability(ranked, previous_rank)
    stable_rank_by_ticker = {row["ticker"]: i + 1 for i, row in enumerate(stabilised)}
    stability_holds = sum(
        1
        for i, row in enumerate(stabilised)
        if v2_rank_by_ticker.get(row["ticker"]) != i + 1
    )

    # Attach the disclosed terms to the in-memory assets so save_top_assets can
    # persist them for the top 5 (and the UI can eventually render the scorecard).
    for row in ranked:
        asset = unified_scores.get(row["ticker"])
        if asset is None:
            continue
        asset["rank_score"] = row["rank_score"]
        asset["signal_strength"] = row["signal_strength"]
        asset["signal_direction"] = row["direction"]
        asset["convergence"] = row["convergence"]
        asset["convergence_state"] = row["convergence_state"]
        asset["data_sufficiency"] = row["data_sufficiency"]
        asset["profile_fit"] = row["profile_fit"]
        asset["quant_lean"] = row["quant_lean"]
        asset["sent_lean"] = row["sent_lean"]
        asset["combined_lean"] = row["combined_lean"]
        asset["quant_state"] = row["quant_state"]
        asset["ranking_version"] = row["ranking_version"]
        asset["ranking_weights"] = row["weights"]
        asset["strength_variants"] = row["strength_variants"]
        assert set(RANKING_V2_COLUMNS) <= set(asset), "v2 column/attach mismatch"

    if run_id:
        save_ranking_shadow(
            run_id,
            [
                {
                    "ticker": row["ticker"],
                    "user_id": user_id,
                    "universe": universe_by_ticker.get(row["ticker"]),
                    "legacy_score": (unified_scores.get(row["ticker"]) or {}).get("unified_score"),
                    "legacy_rank": legacy_rank_by_ticker.get(row["ticker"]),
                    "v2_rank": v2_rank_by_ticker.get(row["ticker"]),
                    "v2_rank_stable": stable_rank_by_ticker.get(row["ticker"]),
                    "rank_score": row["rank_score"],
                    "signal_strength": row["signal_strength"],
                    "signal_direction": row["direction"],
                    "convergence": row["convergence"],
                    "convergence_state": row["convergence_state"],
                    "data_sufficiency": row["data_sufficiency"],
                    "profile_fit": row["profile_fit"],
                    "quant_lean": row["quant_lean"],
                    "sent_lean": row["sent_lean"],
                    "combined_lean": row["combined_lean"],
                    "quant_state": row["quant_state"],
                    "strength_variants": row["strength_variants"],
                    "ranking_version": row["ranking_version"],
                    "ranking_weights": row["weights"],
                    "risk_tolerance": risk_tolerance,
                }
                for row in ranked
            ],
        )

    # How much WOULD the feed change? This is the ratification evidence.
    legacy_top = [row["ticker"] for row in legacy_order[:5]]
    v2_top = [row["ticker"] for row in stabilised[:5]]
    divergence = sum(
        1 for i in range(min(len(legacy_top), len(v2_top))) if legacy_top[i] != v2_top[i]
    )
    tracer = get_tracer()
    if tracer:
        tracer.log_step(
            "ranking_v2",
            {
                "mode": "shadow" if UNIFIED_RANKING_SHADOW else "live",
                "direction_mode": ranking.DIRECTION_MODE,
                "candidates": len(ranked),
                "legacy_top_5": legacy_top,
                "v2_top_5": v2_top,
                "top_5_positions_changed": divergence,
                "tie_epsilon": ranking.TIE_EPSILON,
                "stability_holds": stability_holds,
                "convergence_states": {
                    state: sum(1 for row in ranked if row["convergence_state"] == state)
                    for state in ranking.CONVERGENCE_STATES
                },
                "unfavourable_candidates": sum(
                    1 for row in ranked if row["direction"] == "unfavourable"
                ),
            },
        )
    logger.info(
        "Ranking v2 (%s, %s): %d candidates, %d of top-5 would change — legacy %s vs v2 %s",
        "shadow" if UNIFIED_RANKING_SHADOW else "live",
        ranking.DIRECTION_MODE, len(ranked), divergence, legacy_top, v2_top,
    )

    if UNIFIED_RANKING_SHADOW:
        return legacy_order[:5]
    # Live: order by rank_score, falling back to legacy if v2 produced nothing
    # (e.g. `filter` mode dropped every candidate in a broad downturn).
    if not ranked:
        logger.warning("Ranking v2 returned no candidates; serving legacy order")
        return legacy_order[:5]
    return [
        unified_scores[row["ticker"]]
        for row in stabilised[:5]
        if row["ticker"] in unified_scores
    ]


def synthesize_rankings(
    tickers: list[str],
    quant_results: dict[str, dict],
    sentiment_results: dict[str, dict],
    risk_tolerance: str,
    expertise_level: str,
    run_id: str | None = None,
    user_id: str | None = None,
) -> tuple[list[dict], dict[str, dict]]:
    """Apply per-user business logic (hype/risk penalties, ranking, and the LLM
    reasoning trace for the top 5) on top of already-gathered quant + sentiment
    signals. Shared by the per-user graph (phase 3) and the batched daily run, so
    the raw signals can be gathered once and personalized many times.

    ``run_id`` and ``user_id`` are optional and used only to log the ranking-v2
    shadow rows; the return contract is unchanged, so existing callers keep
    working."""
    from ..utils.supabase_client import normalize_risk_tolerance

    # The manual-run path passes this straight through from the request body (which
    # the frontend fills from the raw DB column), so normalise here as well as on
    # read — otherwise the exact-match comparisons below silently do nothing for
    # lower-cased / misspelled values.
    risk_tolerance = normalize_risk_tolerance(risk_tolerance)

    unified_scores = {}

    for ticker in tickers:
        quant = quant_results.get(ticker, {})
        sentiment = sentiment_results.get(ticker, {})

        quant_score = quant.get("raw_quant_score", 50)
        sentiment_score = sentiment.get("sentiment_score", 50)

        hype_penalty = 0
        if sentiment_score >= 75 and quant_score <= 40:
            hype_penalty = -25
            print(f"{ticker}: Potential hype detected (high sentiment, weak quant)")

        risk_penalty = 0
        beta = quant.get("beta", 1.0)

        if risk_tolerance == "Conservative":
            if beta > 1.2:
                risk_penalty = -15
        elif risk_tolerance == "Aggressive":
            if sentiment_score > 70 and quant_score > 60:
                risk_penalty = +5

        unified_score = quant_score * 0.5 + sentiment_score * 0.5 + hype_penalty + risk_penalty
        unified_score = max(0, min(100, unified_score))

        unified_scores[ticker] = {
            "ticker": ticker,
            "quant_score": quant_score,
            "sentiment_score": sentiment_score,
            "adjustments": {
                "hype_penalty": hype_penalty,
                "risk_penalty": risk_penalty,
            },
            "unified_score": unified_score,
            "beta": beta,
            "reasoning": None,
        }

    legacy_order = sorted(
        unified_scores.values(), key=lambda x: (-x["unified_score"], x["ticker"])
    )
    top_5 = legacy_order[:5]

    # ── Unified ranking v2 (D-087) ───────────────────────────────────────────
    # Computed for EVERY candidate, not just the survivors: a strongly bearish
    # asset never reaches a top 5, and divergent hype names were already demoted
    # out of it, so the direction and convergence questions are only answerable
    # across the whole scoped set. Failure here must never fail a run.
    if UNIFIED_RANKING_ENABLED:
        try:
            top_5 = _apply_ranking_v2(
                tickers=tickers,
                unified_scores=unified_scores,
                legacy_order=legacy_order,
                quant_results=quant_results,
                sentiment_results=sentiment_results,
                risk_tolerance=risk_tolerance,
                run_id=run_id,
                user_id=user_id,
            )
        except Exception as e:
            logger.exception("Ranking v2 failed, serving legacy order: %s", e)
            top_5 = legacy_order[:5]

    # Generate the LLM reasoning trace only for the final top 5. Doing it for
    # every ticker (then discarding all but 5) wasted ~25 calls per run.
    for asset in top_5:
        asset_ticker = asset["ticker"]
        asset["reasoning"] = generate_reasoning_trace(
            ticker=asset_ticker,
            quant_data=quant_results.get(asset_ticker, {}),
            sentiment_data=sentiment_results.get(asset_ticker, {}),
            adjustments=asset["adjustments"],
            risk_tolerance=risk_tolerance,
            expertise_level=expertise_level,
            # Only describe the v2 factors when they ACTUALLY ordered the feed. In
            # shadow mode the terms are computed and attached (for logging) while
            # the legacy score still decides placement, so using them here would
            # have the trace explain a placement it did not cause.
            terms=(
                asset
                if asset.get("rank_score") is not None and not UNIFIED_RANKING_SHADOW
                else None
            ),
        )

    return top_5, unified_scores


def phase_3_synthesizer(state: AnalysisState) -> dict[str, Any]:
    print("- Phase 3: Synthesizing results and applying business logic...")

    top_5, unified_scores = synthesize_rankings(
        state["tickers"],
        state["quant_results"],
        state["sentiment_results"],
        state["risk_tolerance"],
        state["expertise_level"],
        run_id=state.get("run_id"),
        user_id=state.get("user_id"),
    )

    # Persist EVERY analysed asset, not just the survivors, so watchlist cards for
    # assets outside the top 5 still carry scores (main's behaviour, PR #16). The
    # `rank` column is simply the list position and the dashboard orders by it with
    # .limit(5), so the authoritative top 5 must stay at the FRONT — otherwise the
    # legacy five would be served even with ranking v2 live.
    chosen = {asset["ticker"] for asset in top_5}
    all_ranked = list(top_5) + sorted(
        (a for a in unified_scores.values() if a["ticker"] not in chosen),
        key=lambda x: (-x["unified_score"], x["ticker"]),
    )

    print(f"Generated rankings for {len(all_ranked)} assets (saving all, top 5 displayed)")
    for i, asset in enumerate(top_5, 1):
        print(f"    {i}. {asset['ticker']}: {asset['unified_score']:.0f}")

    tracer = get_tracer()
    if tracer:
        tracer.add_aggregates(top_5, unified_scores)
        tracer.log_step(
            "phase_3_synthesis",
            {
                "top_5": [asset["ticker"] for asset in top_5],
                "all_ranked": [asset["ticker"] for asset in all_ranked],
                "unified_scores": {t: unified_scores[t]["unified_score"] for t in unified_scores},
            },
        )

    return {"final_rankings": all_ranked, "status": "synthesized"}


def phase_4_output(state: AnalysisState) -> dict[str, Any]:
    print("- Phase 4: Formatting output with reasoning traces...")

    output = {
        "run_id": state["run_id"],
        "user_id": state["user_id"],
        "risk_tolerance": state["risk_tolerance"],
        "expertise_level": state["expertise_level"],
        "top_5": state["final_rankings"],
    }

    print("Output ready for frontend:")
    print(json.dumps(output, indent=2))
    # Persist ALL ranked assets to Supabase so watchlist cards can show scores
    # for assets that didn't make the top 5. Dashboard still shows top 5 via .limit(5).
    try:
        save_res = save_top_assets(
            run_id=state["run_id"],
            user_id=state["user_id"],
            top_5=state["final_rankings"],  # now contains all ranked assets
            quant_results=state.get("quant_results", {}),
            sentiment_results=state.get("sentiment_results", {}),
        )
        logger.info(f"Saved {len(state['final_rankings'])} assets to Supabase: {save_res.get('status')}")
    except Exception as e:
        logger.error(f"Failed to save top-5 to Supabase: {e}")

    print("Output formatted and ready")
    return {"status": "complete"}


def build_graph():
    graph = StateGraph(AnalysisState)

    graph.add_node("phase_1_init", phase_1_initialize)
    graph.add_node("phase_2_quant", phase_2_quant_analyst)
    graph.add_node("phase_2_sentiment", phase_2_sentiment_scout)
    graph.add_node("phase_3_synthesis", phase_3_synthesizer)
    graph.add_node("phase_4_output", phase_4_output)

    graph.add_edge(START, "phase_1_init")
    graph.add_edge("phase_1_init", "phase_2_quant")
    graph.add_edge("phase_1_init", "phase_2_sentiment")
    graph.add_edge("phase_2_quant", "phase_3_synthesis")
    graph.add_edge("phase_2_sentiment", "phase_3_synthesis")
    graph.add_edge("phase_3_synthesis", "phase_4_output")
    graph.add_edge("phase_4_output", END)

    return graph.compile()


def run_analysis(
    user_id: str,
    risk_tolerance: str,
    universes: list[str],
    watchlist: list[str],
    run_id: str = "run_001",
    expertise_level: str = "novice",
):
    tracer = Tracer(
        run_id=run_id,
        user_id=user_id,
        risk_tolerance=risk_tolerance,
        universes=universes,
    )
    set_tracer(tracer)
    logger.info(f"Starting analysis run {run_id} for user {user_id}")

    try:
        initial_state = {
            "user_id": user_id,
            "risk_tolerance": risk_tolerance,
            "expertise_level": expertise_level,
            "universes": universes,
            "watchlist": watchlist,
            "tickers": [],
            "quant_results": {},
            "sentiment_results": {},
            "final_rankings": [],
            "run_id": run_id,
            "status": "pending",
        }

        app = build_graph()

        run_id_langsmith = None
        if LANGSMITH_ENABLED:
            try:
                from datetime import datetime
                from uuid import uuid4

                run_id_langsmith = str(uuid4())
                langsmith_client.create_run(
                    id=run_id_langsmith,
                    name=f"AlphaSwarm Analysis - {run_id}",
                    run_type="chain",
                    inputs={"user_id": user_id, "risk_tolerance": risk_tolerance, "universes": universes},
                    project_name=LANGSMITH_PROJECT,
                    tags=["alphaswarm", "investment-analysis"],
                )
                logger.info(f"LangSmith run created: {run_id_langsmith}")
            except Exception as e:
                logger.error(f"Failed to create LangSmith run: {e}")
                run_id_langsmith = None

        result = app.invoke(initial_state)

        if LANGSMITH_ENABLED and run_id_langsmith:
            try:
                from datetime import datetime

                langsmith_client.update_run(
                    run_id_langsmith,
                    end_time=datetime.utcnow(),
                    outputs={
                        "top_5": [r["ticker"] for r in result.get("final_rankings", [])],
                        "run_id": run_id,
                        "status": "completed",
                    },
                )
                logger.info(f"LangSmith run completed: {run_id_langsmith}")
            except Exception as e:
                logger.error(f"Failed to update LangSmith run: {e}")

        if tracer:
            tracer.tickers = result.get("tickers", [])
            tracer.log_step("phase_1_init", {"tickers_count": len(result.get("tickers", []))})

        if tracer:
            result["run_id"] = run_id
            logger.info(f"Analysis run {run_id} completed. Traces sent to LangSmith.")

        return result

    finally:
        set_tracer(None)



def run_daily_batch(users: list[dict[str, Any]]) -> dict[str, Any]:
    """Resource-efficient nightly run.

    Gathers raw quant + sentiment signals ONCE for the union of every active
    user's tickers, then applies each user's personalization (risk scoring,
    ranking, reasoning) and persists their top 5. This avoids re-fetching the
    same ticker's market data and social posts once per user — the expensive
    raw gathering is shared, only the cheap per-user layer repeats.

    Each user dict must contain: user_id, run_id, universes, risk_tolerance,
    expertise_level (and optionally watchlist). Failures are isolated per user.
    """
    from ..utils.supabase_client import update_ai_run_status

    if not users:
        return {"total": 0, "succeeded": 0, "failed": 0, "tickers": 0}

    # 1. Scope each user's tickers, then take the union to gather once.
    for user in users:
        user["tickers"] = scope_tickers(user["universes"], user.get("watchlist", []))
    union = sorted({ticker for user in users for ticker in user["tickers"]})
    logger.info("Daily batch: %d users, %d unique tickers", len(users), len(union))

    # 2. Gather raw signals ONCE for the union (degrade gracefully on failure).
    try:
        quant_results = analyze_quant_tickers(union)
    except Exception as e:
        logger.warning("Batch quant gather failed: %s", e)
        quant_results = {}

    # Discovery feedback loop: a discovered ticker whose quant fetch came back
    # empty this run is benched (quarantined) so it stops being selected until it
    # re-qualifies. Guarded on a non-empty quant_results so a *total* quant outage
    # can't quarantine the whole pool, and on origin='discovered' inside the helper
    # so seeds are never benched. Only active when discovery is enabled.
    if DISCOVERY_ENABLED and quant_results:
        try:
            from ..utils.supabase_client import mark_quant_empty

            empty = [ticker for ticker in union if not quant_results.get(ticker)]
            if empty:
                mark_quant_empty(empty)
                logger.info("Discovery: quarantined %d empty-quant tickers", len(empty))
        except Exception as e:
            logger.warning("Discovery quant-empty feedback failed: %s", e)

    try:
        # Nightly is the ONLY place the Marketaux API is called: one batched, deeply
        # paginated query for the whole union of tickers, whose tier-1 results are
        # cached per ticker so user refreshes can reuse them (see collect_news).
        sentiment_results = analyze_sentiment_tickers(union, marketaux="fetch")
    except Exception as e:
        logger.warning("Batch sentiment gather failed: %s", e)
        sentiment_results = {}

    # 3. Personalize + persist per user, reusing the shared signals. The price
    #    cache dedupes yfinance price lookups across users' overlapping top-5s.
    price_cache: dict[str, Any] = {}
    summary = {"total": len(users), "succeeded": 0, "failed": 0, "tickers": len(union)}
    for user in users:
        try:
            top_5, _ = synthesize_rankings(
                user["tickers"],
                quant_results,
                sentiment_results,
                user["risk_tolerance"],
                user["expertise_level"],
                run_id=user["run_id"],
                user_id=user["user_id"],
            )
            save_top_assets(
                run_id=user["run_id"],
                user_id=user["user_id"],
                top_5=top_5,
                quant_results=quant_results,
                sentiment_results=sentiment_results,
                price_cache=price_cache,
            )
            update_ai_run_status(user["run_id"], "complete")
            summary["succeeded"] += 1
        except Exception as e:
            logger.exception("Daily batch failed for user %s: %s", user["user_id"], e)
            update_ai_run_status(user["run_id"], "failed")
            summary["failed"] += 1

    logger.info("Daily batch finished: %s", summary)
    return summary


def main() -> None:
    print("AlphaSwarm LangGraph Orchestrator - Full Pipeline Demo\n")

    # Fetch user preferences from Supabase
    from ..utils.supabase_client import get_user_preferences, get_assets_by_universes
    from ..utils.supabase_client import create_ai_run, update_ai_run_status
    
    user_id = "d7593d52-b416-42ea-95c8-8d183aade83c"  # Example user from your CSV
    user_prefs = get_user_preferences(user_id)
    
    if not user_prefs:
        print(f"Error: User {user_id} not found in database")
        return
    
    print(f"Loaded user: {user_id}")
    print(f"  Universes: {user_prefs['universes']}")
    print(f"  Risk Tolerance: {user_prefs['risk_tolerance']}")
    print(f"  Expertise Level: {user_prefs['expertise_level']}\n")

    ai_run_id = create_ai_run(user_id=user_id, status="running")

    try:
        result = run_analysis(
            user_id=user_id,
            risk_tolerance=user_prefs["risk_tolerance"],
            universes=user_prefs["universes"],
            watchlist=[],
            run_id=ai_run_id,
            expertise_level=user_prefs["expertise_level"],
        )
        update_ai_run_status(ai_run_id, "complete")
    except Exception:
        update_ai_run_status(ai_run_id, "failed")
        raise

    print("\n" + "\n")
    print("FINAL RESULT:")
    print("\n")
    print(f"Status: {result['status']}")
    print(f"Run ID: {result.get('run_id', 'N/A')}")
    print(f"Top 5 Assets:")
    for i, asset in enumerate(result['final_rankings'], 1):
        print(f"  {i}. {asset['ticker']}: {asset['unified_score']:.0f} (Quant: {asset['quant_score']}, Sentiment: {asset['sentiment_score']})")


if __name__ == "__main__":
    main()

