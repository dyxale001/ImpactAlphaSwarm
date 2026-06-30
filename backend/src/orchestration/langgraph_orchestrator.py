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
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
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


def generate_reasoning_trace(
    ticker: str,
    quant_data: dict,
    sentiment_data: dict,
    adjustments: dict,
    risk_tolerance: str,
    expertise_level: str,
) -> str:
    if not groq_llm:
        return f"Quant Score: {quant_data.get('raw_quant_score', 'N/A')}, Sentiment: {sentiment_data.get('sentiment_score', 'N/A')}"

    try:
        audience_guidance = {
            "novice": "Write in plain English for a retail investor who is new to investing. Avoid jargon, define any technical term briefly, and focus on the bottom line.",
            "intermediate": "Write for a retail investor who understands basic investing terms. Use some market language, but keep it clear and practical.",
            "advanced": "Write for an experienced retail investor. You may use technical market language, but keep the explanation concise and grounded in the metrics.",
        }

        audience_note = audience_guidance.get(expertise_level, audience_guidance["novice"])

        prompt = f"""Generate a concise 1-2 sentence investment reasoning for {ticker} based on:

    Audience guidance:
    - Expertise level: {expertise_level}
    - Instruction: {audience_note}

Technical Signals:
- RSI: {quant_data.get('rsi', 'N/A')}
- MACD Signal: {quant_data.get('macd', 'N/A')}
- Sharpe Ratio: {quant_data.get('sharpe_ratio', 'N/A')}
- Beta: {quant_data.get('beta', 'N/A'):.2f}

Market Sentiment (news weighted higher than social):
- Sentiment Score: {sentiment_data.get('sentiment_score', 'N/A')}/100
- News Sentiment: {sentiment_data.get('news_sentiment_score', 'N/A')}/100 from {sentiment_data.get('news_count', 0)} trusted-source articles ({sentiment_data.get('news_bullish', 0)} positive, {sentiment_data.get('news_bearish', 0)} negative)
- Social Sentiment: {sentiment_data.get('social_sentiment_score', 'N/A')}/100 from {sentiment_data.get('mention_count', 0)} posts ({sentiment_data.get('bullish_posts', 0)} bullish, {sentiment_data.get('bearish_posts', 0)} bearish)

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
        base_reasoning = f"Strong fundamentals (Quant: {quant_data.get('raw_quant_score', 'N/A')}) with market sentiment support (Sentiment: {sentiment_data.get('sentiment_score', 'N/A')})."
        if expertise_level == "novice":
            return f"This stock looks solid because the numbers are decent and the market mood is supportive. {base_reasoning}"
        if expertise_level == "intermediate":
            return base_reasoning
        return f"{base_reasoning} The score reflects both the technical setup and sentiment inputs."


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


def scope_tickers(universes: list[str], watchlist: list[str] | None = None) -> list[str]:
    """Resolve a user's investment universes (+ watchlist) to a capped, deduped
    ticker list. Shared by the per-user graph and the batched daily run."""
    from ..utils.supabase_client import get_assets_by_universes

    tickers = get_assets_by_universes(universes)
    tickers.extend(watchlist or [])
    return list(set(tickers))[:30]


def phase_1_initialize(state: AnalysisState) -> dict[str, Any]:
    print("- Phase 1: Initializing session and scoping data...")

    tickers = scope_tickers(state["universes"], state["watchlist"])

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
        # Include the Marketaux tier-1 top-up on user-initiated refreshes too. The
        # ~100 calls/day budget is comfortable for this; each refresh is one batched,
        # paginated query (MARKETAUX_MAX_PAGES). (Revisit if refresh volume grows --
        # e.g. cache per day or lower the page count.)
        sentiment_results = analyze_sentiment_tickers(state["tickers"], include_marketaux=True)
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


def synthesize_rankings(
    tickers: list[str],
    quant_results: dict[str, dict],
    sentiment_results: dict[str, dict],
    risk_tolerance: str,
    expertise_level: str,
) -> tuple[list[dict], dict[str, dict]]:
    """Apply per-user business logic (hype/risk penalties, ranking, and the LLM
    reasoning trace for the top 5) on top of already-gathered quant + sentiment
    signals. Shared by the per-user graph (phase 3) and the batched daily run, so
    the raw signals can be gathered once and personalized many times."""
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

    top_5 = sorted(unified_scores.values(), key=lambda x: x["unified_score"], reverse=True)[:5]

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
    )

    print("Generated Top 5 rankings")
    for i, asset in enumerate(top_5, 1):
        print(f"    {i}. {asset['ticker']}: {asset['unified_score']:.0f}")

    tracer = get_tracer()
    if tracer:
        tracer.add_aggregates(top_5, unified_scores)
        tracer.log_step(
            "phase_3_synthesis",
            {
                "top_5": [asset["ticker"] for asset in top_5],
                "unified_scores": {t: unified_scores[t]["unified_score"] for t in unified_scores},
            },
        )

    return {"final_rankings": top_5, "status": "synthesized"}


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
    # Persist top-5 to Supabase (ensure this runs before returning)
    try:
        save_res = save_top_assets(
            run_id=state["run_id"],
            user_id=state["user_id"],
            top_5=state["final_rankings"],
            quant_results=state.get("quant_results", {}),
            sentiment_results=state.get("sentiment_results", {}),
        )
        logger.info(f"Saved top-5 to Supabase: {save_res.get('status')}")
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
    try:
        # Enable the Marketaux tier-1 top-up here too -- one batched, paginated
        # query for the whole union of tickers (cheaper than per-user refreshes,
        # which also include it via phase_2_sentiment_scout).
        sentiment_results = analyze_sentiment_tickers(union, include_marketaux=True)
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
