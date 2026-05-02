"""
AlphaSwarm LangGraph Orchestrator

This module implements the four-phase analysis pipeline using LangGraph state machine:
1. Phase 1: Session Initialization & Data Scoping
2. Phase 2: Agentic Swarm Execution (Quant Analyst + Sentiment Scout in parallel)
3. Phase 3: Orchestrator Synthesis (Hype Check + Risk Engine + Ranking)
4. Phase 4: Explainable AI & Output Delivery

Purpose: Orchestrate a two-agent analysis pipeline (Quant Analyst + Sentiment Scout),
synthesize results, apply user risk preferences, and deliver a Top 5 ranked list with
full reasoning traces.
"""

from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Any

from quant_analyst import analyze_tickers as analyze_quant_tickers
from sentiment_scout import analyze_tickers as analyze_sentiment_tickers

import json


# 1. DEFINE STATE SCHEMA
class AnalysisState(TypedDict):
    """
    Shared state dictionary flowing through the LangGraph state machine.
    Contains all inputs, intermediate results, and final outputs.
    """
    user_id: str
    risk_tolerance: str  # "Conservative", "Moderate", "Aggressive"
    universes: list[str]  # ["Tech", "Green Energy"]
    watchlist: list[str]  # user's saved tickers
    tickers: list[str]  # 20–30 curated tickers
    
    # Phase 2 outputs
    quant_results: dict[str, dict]  # {ticker: {rsi, macd, sharpe, beta, volatility, score}}
    sentiment_results: dict[str, dict]  # {ticker: {sentiment_score, top_posts}}
    
    # Phase 3 outputs
    final_rankings: list[dict]  # Top 5 assets with unified scores and reasoning
    
    # Metadata
    run_id: str
    status: str  # "initialized", "quant_done", "sentiment_done", "synthesized"


# 2. PHASE 1: SESSION INITIALIZATION & DATA SCOPING
def phase_1_initialize(state: AnalysisState) -> dict[str, Any]:
    """
    Phase 1: Session Initialization & Data Scoping (The Funnel Entry)
    
    Purpose: Narrow down the stock universe to 20–30 relevant tickers.
    - User constraints are already in state (risk_tolerance, universes).
    - Assemble ticker pool from universes + watchlist (simulated here).
    - In production: query Supabase for tickers matching universes.
    
    Output: Curated pool of 20–30 tickers ready for parallel analysis.
    """
    print("- Phase 1: Initializing session and scoping data...")
    
    # MOCK: Simulate fetching tickers from universes
    ticker_pool = {
        "Tech": ["NVDA", "MSFT", "AAPL", "TSLA", "META"],
        "Green Energy": ["NEE", "ICLN", "PLUG", "RUN"],
        "AI & Robotics": ["UPST", "CRSP", "ROBO", "ARKQ"]
    }
    
    # Build pool from selected universes
    tickers = []
    for universe in state["universes"]:
        if universe in ticker_pool:
            tickers.extend(ticker_pool[universe])
    
    # Append watchlist
    tickers.extend(state["watchlist"])
    
    # Remove duplicates and limit to 20–30
    tickers = list(set(tickers))[:30]
    
    print(f"  ✓ Curated {len(tickers)} tickers for analysis")
    return {
        "tickers": tickers,
        "status": "initialized",
        "quant_results": {},
        "sentiment_results": {}
    }


# 3. PHASE 2A: QUANT ANALYST (Runs in Parallel)
def phase_2_quant_analyst(state: AnalysisState) -> dict[str, Any]:
    """
    Phase 2A: Quant Analyst Agent (Quantitative Fundamentals)
    
    Purpose: Analyze fundamental market data and technical metrics.
    - Fetch 30-day OHLCV for each ticker (yfinance).
    - Compute indicators (RSI, MACD, Sharpe, Beta, Volatility).
    - Produce Raw Quant Score (0–100).
    
    Integration: Uses the quant_analyst module for real market data analysis.
    """
    print("- Phase 2A: Quant Analyst analyzing market data...")
    
    try:        
        # Batch analyze all tickers with real data
        quant_results = analyze_quant_tickers(state["tickers"])
        
        print(f"  ✓ Computed metrics for {len(quant_results)} assets")
        return {"quant_results": quant_results}
    
    except ImportError:
        print("  ⚠ quant_analyst module not found; falling back to mock data")
        # Fallback to mock data if module unavailable
        quant_results = {}
        for ticker in state["tickers"]:
            mock_quant = {
                "ticker": ticker,
                "rsi": 65 + hash(ticker) % 20,
                "macd": "bullish_crossover" if hash(ticker) % 2 == 0 else "bearish",
                "sharpe_ratio": round(0.5 + (hash(ticker) % 10) / 10, 2),
                "beta": round(0.8 + (hash(ticker) % 10) / 10, 2),
                "volatility": round(0.15 + (hash(ticker) % 10) / 100, 3),
                "raw_quant_score": 50 + (hash(ticker) % 40)
            }
            quant_results[ticker] = mock_quant
        print(f"  ✓ Generated mock metrics for {len(quant_results)} assets")
        return {"quant_results": quant_results}


# 3. PHASE 2B: SENTIMENT SCOUT (Runs in Parallel)
def phase_2_sentiment_scout(state: AnalysisState) -> dict[str, Any]:
    """
    Phase 2B: Sentiment Scout Agent (Qualitative Market Mood)
    
    Purpose: Capture social signals and market mood from social platforms.
    - Scrape Reddit (praw) and Telegram (telethon) for mentions (24–72h).
    - Clean text and apply NLP (VADER + Transformers).
    - Produce Raw Sentiment Score (0–100).
    
    In production: Replace mock data with real social scraping.
    """
    print("- Phase 2B: Sentiment Scout scraping social signals...")
    
    try:
        sentiment_results = analyze_sentiment_tickers(state["tickers"])
    except ImportError:
        print("  ⚠ sentiment_scout module not found; falling back to mock data")
        sentiment_results = {}
        for ticker in state["tickers"]:
            mock_sentiment = {
                "ticker": ticker,
                "sentiment_score": 40 + (hash(ticker) % 50),  # 40–90 range
                "bullish_posts": (hash(ticker) % 20) + 5,
                "bearish_posts": (hash(ticker) % 15),
                "top_posts": [
                    f"Mock post 1: '{ticker} looking strong'",
                    f"Mock post 2: '{ticker} potential pump'"
                ]
            }
            sentiment_results[ticker] = mock_sentiment
    
    print(f"  ✓ Analyzed sentiment for {len(sentiment_results)} assets")
    return {"sentiment_results": sentiment_results}


# 4. PHASE 3: ORCHESTRATOR SYNTHESIS
def phase_3_synthesizer(state: AnalysisState) -> dict[str, Any]:
    """
    Phase 3: Orchestrator Synthesis (Filtering for the Top 5)
    
    Purpose: Combine agent outputs, validate, personalize, and rank.
    
    Steps:
    1. Hype Check (Validation): If sentiment >> quant - apply hype penalty
    2. Risk Profile Engine (Personalization): Adjust based on user risk tolerance
    3. Ranking & Slicing: Compute Unified Score and select Top 5
    
    Key logic:
    - Hype Check: if sentiment ≥ 75 and quant ≤ 40 - potential pump-and-dump
    - Risk Profile:
        - Conservative: penalize high-Beta assets
        - Moderate: balanced weighting
        - Aggressive: reward momentum
    - Unified Score = (quant_score * 0.5) + (sentiment_score * 0.5) + adjustments
    """
    print("- Phase 3: Synthesizing results and applying business logic...")
    
    unified_scores = {}
    
    for ticker in state["tickers"]:
        quant = state["quant_results"].get(ticker, {})
        sentiment = state["sentiment_results"].get(ticker, {})
        
        quant_score = quant.get("raw_quant_score", 50)
        sentiment_score = sentiment.get("sentiment_score", 50)
        
        # STEP 1: HYPE CHECK (Validation), if sentiment is high and quant is weak
        hype_penalty = 0
        if sentiment_score >= 75 and quant_score <= 40:
            hype_penalty = -25
            print(f"    ⚠ {ticker}: Potential hype detected (high sentiment, weak quant)")
        
        # STEP 2: RISK PROFILE ENGINE (Personalization)
        risk_penalty = 0
        beta = quant.get("beta", 1.0)
        
        if state["risk_tolerance"] == "Conservative":
            # Penalize high volatility
            if beta > 1.2:
                risk_penalty = -15
        elif state["risk_tolerance"] == "Aggressive":
            # Reward strong momentum if backed by fundamentals
            if sentiment_score > 70 and quant_score > 60:
                risk_penalty = +5
        
        # STEP 3: COMPUTE UNIFIED CONFIDENCE SCORE
        unified_score = (quant_score * 0.5 + sentiment_score * 0.5 + hype_penalty + risk_penalty)
        unified_score = max(0, min(100, unified_score))  # Clamp to 0–100 range
        
        unified_scores[ticker] = {
            "ticker": ticker,
            "quant_score": quant_score,
            "sentiment_score": sentiment_score,
            "adjustments": {
                "hype_penalty": hype_penalty,
                "risk_penalty": risk_penalty
            },
            "unified_score": unified_score,
            "beta": beta,
            "reasoning": f"Quant: {quant_score}, Sentiment: {sentiment_score}, adjustments: {hype_penalty + risk_penalty}"
        }
    
    # STEP 4: SORT AND SLICE TOP 5
    top_5 = sorted(unified_scores.values(), key=lambda x: x["unified_score"], reverse=True)[:5]
    
    print(f"  ✓ Generated Top 5 rankings")
    for i, asset in enumerate(top_5, 1):
        print(f"    {i}. {asset['ticker']}: {asset['unified_score']:.0f}")

    return {"final_rankings": top_5, "status": "synthesized"}


# 5. PHASE 4: OUTPUT DELIVERY (XAI)
def phase_4_output(state: AnalysisState) -> dict[str, Any]:
    """
    Phase 4: Explainable AI & Output Delivery
    
    Purpose: Format final rankings with reasoning traces and deliver to frontend.
    - Format final rankings with full transparency.
    - Include reasoning traces (generated from execution audit trail).
    - Ready for REST API or WebSocket delivery to frontend.
    
    Reasoning trace example:
    {
        "ticker": "NVDA",
        "quant_score": 78,
        "sentiment_score": 85,
        "adjustments": { "hype_penalty": -5, "risk_penalty": -8 },
        "unified_score": 75,
        "key_metrics": { "rsi": 68, "macd_signal": "bullish_crossover", ... },
        "reasoning": "Strong quantitative indicators with bullish momentum...",
        "decision": "High Confidence: bullish momentum backed by MACD crossover..."
    }
    """
    print("- Phase 4: Formatting output with reasoning traces...")
    
    output = {
        "run_id": state["run_id"],
        "user_id": state["user_id"],
        "risk_tolerance": state["risk_tolerance"],
        "top_5": state["final_rankings"]
    }
    
    # In production: send to frontend via REST API or WebSocket
    print("  ✓ Output ready for frontend:")
    print(json.dumps(output, indent=2))
    
    print("  ✓ Output formatted and ready")
    return {"status": "complete"}


# 6. BUILD LANGGRAPH STATE MACHINE
def build_graph():
    """
    Construct the LangGraph state machine.
    
    Flow:
    START - Phase 1 (init) 
            ↓
            ├→ Phase 2A (quant) ↓
            └→ Phase 2B (sentiment) ↓
            Phase 3 (synthesis)
            ↓
            Phase 4 (output)
            ↓
            END
    
    Key feature: Phase 2A and 2B run in parallel; Phase 3 waits for both.
    """
    graph = StateGraph(AnalysisState)
    
    # Add nodes (Phase 1, Phase 2a, Phase 2b, Phase 3, Phase 4)
    graph.add_node("phase_1_init", phase_1_initialize)
    graph.add_node("phase_2_quant", phase_2_quant_analyst)
    graph.add_node("phase_2_sentiment", phase_2_sentiment_scout)
    graph.add_node("phase_3_synthesis", phase_3_synthesizer)
    graph.add_node("phase_4_output", phase_4_output)
    
    # Define edges (flow control)
    graph.add_edge(START, "phase_1_init")  # Entry point: START - Phase 1
    graph.add_edge("phase_1_init", "phase_2_quant")  # Phase 1 - Quant Analyst
    graph.add_edge("phase_1_init", "phase_2_sentiment")  # Phase 1 - Sentiment Scout (PARALLEL)
    
    # Wait for both Phase 2 agents to complete before proceeding
    graph.add_edge("phase_2_quant", "phase_3_synthesis")
    graph.add_edge("phase_2_sentiment", "phase_3_synthesis")
    
    # Phase 3 - Phase 4 - Exit
    graph.add_edge("phase_3_synthesis", "phase_4_output")
    graph.add_edge("phase_4_output", END)
    
    return graph.compile()


# 7. RUN THE GRAPH
def run_analysis(user_id: str, risk_tolerance: str, universes: list[str], watchlist: list[str], run_id: str = "run_001"):
    """
    Execute the analysis pipeline.
    
    Args:
        user_id: User identifier
        risk_tolerance: "Conservative", "Moderate", or "Aggressive"
        universes: List of investment universes (e.g., ["Tech", "AI & Robotics"])
        watchlist: User's manually saved tickers
        run_id: Unique analysis run identifier
    
    Returns:
        Final state with Top 5 rankings and all analysis results
    """
    # Initialize state
    initial_state = {
        "user_id": user_id,
        "risk_tolerance": risk_tolerance,
        "universes": universes,
        "watchlist": watchlist,
        "tickers": [],
        "quant_results": {},
        "sentiment_results": {},
        "final_rankings": [],
        "run_id": run_id,
        "status": "pending"
    }
    
    # Compile and run graph
    app = build_graph()
    result = app.invoke(initial_state)
    
    return result


if __name__ == "__main__":
    print("AlphaSwarm LangGraph Orchestrator - Full Pipeline Demo\n")
    
    # Run example analysis
    result = run_analysis(
        user_id="user_123",
        risk_tolerance="Aggressive",
        universes=["Tech", "AI & Robotics", "Green Energy"],
        watchlist=["AI", "PLTR"],
        run_id="run_001"
    )
    
    print("\n" + "\n")
    print("FINAL RESULT:")
    print("\n")
    print(f"Status: {result['status']}")
    print(f"Top 5 Assets:")
    for i, asset in enumerate(result['final_rankings'], 1):
        print(f"  {i}. {asset['ticker']}: {asset['unified_score']:.0f} (Quant: {asset['quant_score']}, Sentiment: {asset['sentiment_score']})")