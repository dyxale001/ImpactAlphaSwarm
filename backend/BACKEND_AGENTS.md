# AlphaSwarm — Backend Agents: Architecture & Execution Blueprint

Complete reference for the three-part AI brain infrastructure, four execution phases, agent responsibilities, packages, and external APIs.

---

## The AI "Brain" Infrastructure

The system relies on a three-part LangChain ecosystem to manage agents and ensure high-quality, traceable outputs:

### 1. **LangChain** (The Toolkit)
- Purpose: connect AI to external APIs and handle linear data ingestion and prompt execution.
- Role: abstracts integrations with yfinance, PRAW (Reddit), and Telethon (Telegram).
- Key packages: `langchain`, `langchain-community`, specific integrators for APIs.

### 2. **LangGraph** (The Logic Orchestrator)
- Purpose: act as central supervisor managing a state machine where sub-agents collaborate, share data, and loop to resolve conflicting signals.
- Role: coordinates Quant Analyst and Sentiment Scout in parallel, waits for both outputs, then triggers Synthesizer.
- Key packages: `langgraph`, `langgraph-core`.

### 3. **LangSmith** (The Auditor)
- Purpose: track execution, manage token costs, prevent hallucinations, and **record exact agent reasoning steps**.
- Role: generate transparent "Reasoning Traces" for end users; enable introspection of how AI arrived at recommendations.
- Key packages: `langsmith` SDK; configure tracing via LangSmith dashboard or local logs.

---

## Phase 1: Session Initialization & Data Scoping (The Funnel Entry)

**Goal:** Filter the entire stock market down to a tight pool of 20–30 highly relevant assets before analysis begins. This prevents overload and cures "analysis paralysis."

**Steps:**
1. User Constraints: Retail investor logs into Vue.js frontend and defines:
   - Available capital
   - Risk tolerance (Conservative, Moderate, Aggressive)
   - Preferred Investment Universes (e.g., Tech, Green Energy, AI & Robotics)

2. Supabase Query: Orchestrator queries Supabase database (containing seeded master list of 50 assets by sector) and fetches only tickers matching user's selected universes.

3. Watchlist Injection: Any tickers user manually saved to their Watchlist are appended to the pool.

**Output:** Curated pool of 20–30 tickers ready for parallel analysis.

---

## Phase 2: The Agentic Swarm Execution (Parallel Processing)

LangGraph dispatches two specialized sub-agents simultaneously on the curated pool.

### Agent 1: **Quant Analyst** (Quantitative Fundamentals)

**Data Ingestion:**
- Fetch 30-day historical OHLCV (Open, High, Low, Close, Volume) via `yfinance`.
- Timeframe rationale: long enough to calculate momentum, short enough to avoid irrelevant historical noise.

**Processing:**
- Clean data with `pandas`.
- Compute technical indicators using `TA-Lib` or `pandas_ta`:
  - RSI (Relative Strength Index)
  - MACD (Moving Average Convergence Divergence)
  - Sharpe Ratio (risk-adjusted returns)
  - Beta (volatility vs market)
  - Volatility (standard deviation of returns)

**Output:**
- Raw Quant Score (0–100) for each of the 20–30 assets.
- Granular per-metric values stored in `quant_metrics` table.

**Key Packages:** `yfinance`, `pandas`, `numpy`, `TA-Lib` (or `pandas_ta`), `scipy`, optional `statsmodels`.

---

### Agent 2: **Sentiment Scout** (Qualitative Market Mood)

**Data Ingestion:**
- Scrape Reddit (`r/wallstreetbets`, `r/investing`) using `praw`.
- Scrape finance-focused Telegram channels using `telethon`.
- Targeting 24–72 hour window to capture current market hype without old-news bias.

**Processing:**
- Clean text (deduplication, spam filtering, tokenization).
- Pass through NLP engines:
  - **VADER** (rule-based sentiment polarity).
  - **Transformers** (e.g., distilBERT) for classification accuracy and confidence scores.
- Classify tone as bullish or bearish.

**Output:**
- Raw Sentiment Score (0–100) for each asset.
- Top impactful posts and their sentiment contributions stored in `sentiment_cache`.

**Key Packages:** `praw`, `telethon`, `vaderSentiment`, `transformers`, `torch` (optional for local inference), `nltk`/`spacy` (optional preprocessing).

---

## Phase 3: The Orchestrator Synthesis (Filtering for the Top 5)

LangGraph receives raw scores from both agents and applies strict business logic.

### Step 1: **The Hype Check** (Validation)

Cross-reference social sentiment against fundamental data. If an asset:
- Has high sentiment (e.g., ≥ 80) **and**
- Has weak quant metrics (e.g., poor MACD, high volatility, low Beta stability, quant score ≤ 40)

**Action:** Identify as artificial hype → apply hype penalty (e.g., reduce final score by 20–30 points).

**Purpose:** Protect users from pump-and-dump schemes and overhyped memes.

---

### Step 2: **The Risk Profile Engine** (Personalization)

Apply user's defined risk tolerance across all 20–30 assets:

- **Conservative users:**
  - Penalize high-Beta (volatile) assets.
  - Reward stability and steady Sharpe Ratio.
  - Downweight high-sentiment outliers.

- **Moderate users:**
  - Balanced weighting between momentum and stability.
  - Accept moderate volatility if backed by quant.

- **Aggressive users:**
  - Reward high momentum (MACD crossovers, trending sentiment).
  - Tolerate high Beta if supported by strong quant + sentiment alignment.

---

### Step 3: **Ranking & Slicing**

1. Combine adjusted Quant Score, Sentiment Score, and risk-adjusted penalties into a single **Unified Confidence Score** (0–100) per asset.
2. Sort all 20–30 assets in descending order by Unified Score.
3. **Python slice:** `top_5_assets = ranked_assets[:5]`.
4. Persist results in `final_rankings` table with full reasoning trace.

---

## Phase 4: Explainable AI (XAI) & Output Delivery

**Goal:** Transform complex data into clear, actionable format for beginner investors.

### The Dashboard
- Display Top 5 assets ranked by Unified Confidence Score.
- Show per-asset reasoning traces.

### Reasoning Traces (Powered by LangSmith)
- Orchestrator exports execution logs from LangSmith.
- For each Top 5 asset, generate plain-English explanation including:
  - Specific technical signals (e.g., "MACD bullish crossover detected").
  - Social trends (e.g., "80% bullish sentiment on Reddit, 200+ posts in 48h").
  - Risk profile alignment (e.g., "Conservative: penalized for 1.8 Beta, but stable Sharpe Ratio mitigates risk").
  - Final decision statement (e.g., "High Confidence: strong momentum backed by fundamentals").

**Example reasoning trace (JSON):**
```json
{
  "ticker": "NVDA",
  "quant_score": 78,
  "sentiment_score": 85,
  "adjustments": {
    "hype_penalty": -5,
    "risk_penalty": -8
  },
  "unified_score": 75,
  "key_metrics": {
    "rsi": 68,
    "macd_signal": "bullish_crossover",
    "sharpe_ratio": 1.45,
    "beta": 1.2
  },
  "reasoning": "Strong quantitative indicators with bullish momentum. Sentiment is high but validated by technical fundamentals. Slight risk penalty applied for Beta > 1.0, acceptable for Moderate profile.",
  "decision": "High Confidence: bullish momentum backed by MACD crossover and stable Sharpe Ratio, moderate social validation."
}
```

### Paper Trading Simulation
- User can instantly transition recommendations into risk-free environment.
- Execute simulated trades via integrated Demo Trading API (e.g., Alpaca paper trading).
- Persist simulated trades and P&L in `paper_trades` table for learning and backtesting.

---

## The Logic Orchestrator (Coordinator Role)

**Responsibilities:**
- Kick off analysis runs and fetch user constraints from Supabase.
- Assemble ticker pool (20–30 assets) from universes + watchlist.
- Dispatch Quant Analyst and Sentiment Scout agents in parallel via LangGraph.
- Monitor execution and wait for both outputs.
- Trigger Synthesizer to combine scores and apply business logic.
- Persist final rankings and reasoning traces.
- Deliver results to frontend via REST API or WebSocket.

**Key Packages:** `fastapi`, `uvicorn`, `langgraph`, `langchain`, `langsmith`, HTTP client (`httpx` / `requests`).

**External Services:** Supabase (DB + Auth), LangGraph, LangSmith (logging & tracing).

---

## Infrastructure & Deployment

### Orchestration & Job Queue
- Use LangGraph state machine to manage agent flow.
- Optional: Celery + Redis for background workers if agents require separate processes.
- All agents and orchestrator can run synchronously or be wrapped in async workers.

### Database Tables (Supabase Postgres)
- `users`: Supabase auth.
- `universes`: Investment categories (e.g., Tech, Green Energy).
- `tickers`: Master list of 50 assets with sector/universe mappings.
- `watchlists`: User-saved tickers.
- `analysis_runs`: Track each analysis session (run_id, user_id, status, created_at).
- `quant_metrics`: Quant analyst outputs (run_id, ticker, RSI, MACD, Sharpe, Beta, Volatility, raw_quant_score).
- `sentiment_cache`: Sentiment scout outputs (run_id, ticker, sentiment_score, top_posts jsonb).
- `final_rankings`: Synthesizer results (run_id, ticker, unified_score, rank, reasoning_trace jsonb).
- `paper_trades`: Simulated trades (user_id, run_id, ticker, quantity, price, executed_at, pnl).

### API Endpoints (Backend)
- `POST /api/analysis/start`: { user_id, capital, risk_tolerance, universes } → returns run_id.
- `GET /api/analysis/status/{run_id}`: Check progress and worker states.
- `GET /api/analysis/result/{run_id}`: Fetch Top 5 + reasoning traces.
- `GET /api/watchlist/{user_id}`: Retrieve user watchlist.
- `POST /api/paper-trade`: Execute simulated trade against demo API.
- WebSocket or SSE for real-time progress updates.

---

## Environment Variables (Server-Side Secrets)

**Database & Auth:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (keep secret; never expose to frontend)

**Social APIs:**
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`

**AI & Orchestration:**
- `LANGSMITH_API_KEY`
- `LANGCHAIN_API_KEY` (if using hosted LangChain)

**Demo Trading:**
- `DEMO_TRADING_API_KEY` (e.g., Alpaca paper trading token)

**Storage:** Keep real secrets in `backend/.env.local` (gitignored) or deployment platform's secret manager.

---

## External APIs & Data Sources Summary

1. **Supabase**: Primary DB, user profiles, universes, watchlists.
2. **yfinance**: Free OHLCV market data (good for prototyping; premium options: IEX, Alpha Vantage, Polygon).
3. **Reddit API (praw)**: Social signal source for r/wallstreetbets, r/investing, etc.
4. **Telegram API (telethon)**: Finance-focused channel sentiment.
5. **Hugging Face Inference API** or local `transformers`: NLP classification for sentiment (hosted reduces infra cost).
6. **LangSmith Dashboard**: Tracing, logging, and reasoning audit trail.
7. **Demo Trading APIs**: Alpaca paper trading or internal simulator for risk-free trades.

---

## Packages Quick-Reference (Python)

**Core & API:**
- `fastapi`, `uvicorn` (API server)
- `httpx`, `requests` (HTTP)
- `supabase-py` (Supabase client)

**AI / LangChain Ecosystem:**
- `langchain`, `langchain-community` (toolkit)
- `langgraph`, `langgraph-core` (orchestration)
- `langsmith` (auditing & tracing)

**Market Data:**
- `yfinance` (free OHLCV)
- optional: `alpha_vantage`, `polygon-api-client` (premium)

**Technical Analysis:**
- `pandas_ta` or `ta-lib` (indicators; `ta-lib` requires system libs)
- `pandas`, `numpy`, `scipy`, optional `statsmodels` (calculations)

**NLP & Sentiment:**
- `vaderSentiment` (rule-based polarity)
- `transformers`, `torch` (local inference; optional for CPU-only)
- `nltk`, `spacy` (optional preprocessing)

**Social APIs:**
- `praw` (Reddit)
- `telethon` (Telegram)

**Orchestration & Jobs (optional):**
- `celery`, `dramatiq`, or `rq` (background jobs)
- `redis` (broker/cache)

---

## Key Design Principles

1. **Tight Scoping:** Filter 50 assets → 20–30 → Top 5 to prevent analysis paralysis.
2. **Parallel Execution:** LangGraph runs Quant and Sentiment simultaneously.
3. **Validation & Risk:** Hype Check prevents pump-and-dump; Risk Engine personalizes for user profile.
4. **Explainability:** LangSmith logs every step; reasoning traces are generated from audit trail, not post-hoc.
5. **Low Friction:** Paper trading allows instant simulation without real capital or friction.

---

## Next Steps for Implementation

1. Set up Supabase tables (schemas provided above).
2. Implement LangGraph state graph (Phase 1 → Phase 2 parallel agents → Phase 3 synthesis → Phase 4 output).
3. Build Quant Analyst worker (yfinance → indicators → score).
4. Build Sentiment Scout worker (praw + telethon → VADER + Transformers → score).
5. Build Synthesizer logic (Hype Check + Risk Engine + Unified Score + Top 5 slice).
6. Wire API endpoints and WebSocket for real-time progress.
7. Integrate LangSmith for tracing and reasoning trace generation.
8. Add demo trading API integration.
9. Deploy with Docker; store secrets in CI/deployment platform.
