# AlphaSwarm: Business Analysis & Innovation Document

## 1. Project Overview & Business Value
AlphaSwarm is a multi-agent system designed to automate advanced financial research and democratize complex analysis for retail investors. 

* **The Core Problem:** Retail investors face "Analysis Paralysis" due to fragmented financial data and emotional decision-making driven by social media hype.
* **The Solution:** AlphaSwarm acts as an AI "Investment Committee" that systemizes analytical stages, centralizes market data/sentiment, and maps recommendations to personal risk profiles.
* **Key Value Proposition:** Explainable AI (XAI). AlphaSwarm avoids the "black box" approach by providing explicit "Reasoning Traces" and a Unified Confidence Score (0-100%) to explain exactly how the AI arrived at its conclusions.

## 2. Target Users (Personas)
* **Thabo Ndawula (The "Analysis Paralysis" User):** A 21-year-old tech-savvy software developer. He understands trading concepts but is overwhelmed by conflicting technical indicators and sentiment. AlphaSwarm provides him with cognitive offloading and clear reasoning to execute trades confidently.
* **Betty Jane (The "No Analysis" User):** A 45-year-old small business owner. She finds the stock market intimidating and lacks the time to learn financial jargon. AlphaSwarm provides her with a guided, simplified entry point, managing the heavy lifting in the background.

---

## 3. System Architecture & Tech Stack

### 3.1 Presentation Layer (Frontend)
Designed for accessibility across all devices, prioritizing a sleek, data-rich user experience.

### 3.2 Business Layer (Backend & Integrations)
* **Node.js:** High-performance API gateway handling REST API requests and sustaining live WebSocket connections for real-time data streaming.
* **LangChain:** Connects LLMs (OpenAI/Gemini) to external data, manages prompts, and handles RAG pipelines.
* **LangGraph:** Serves as the central "Logic Orchestrator," allowing multiple sub-agents to collaborate, share state, and resolve conflicting signals.
* **LangSmith:** Traces execution logic to monitor how agents reach conclusions and prevents AI hallucinations.

### 3.3 Data Layer (Database & Market Intelligence)
* **Supabase:** The primary database for user accounts, portfolio states, and trade records. It also provides a ready-made vector database for text embeddings and integrated WebSocket subscriptions for real-time dashboard updates.
* **YFinance:** Retrieves structured historical and live OHLCV (Open, High, Low, Close, Volume) market data.
* **PRAW & Telethon:** Scrapes unstructured social sentiment data from Reddit ($WSB, r/investing) and Telegram channels.
* **Pandas & TA-Lib:** A mathematical engine used by the Quant Agent to clean data and calculate complex technical indicators (RSI, MACD).
* **Python (VADER/Transformers):** The core NLP engines used by the Sentiment Agent to classify text.
* **Demo Trading API:** Open-source platform (e.g., Alpaca/CCXT) to facilitate risk-free paper trading simulations.

---

## 4. Multi-Agent System (MAS) Workflow

### 4.1 The Orchestrator Agent (Supervisor)
* Receives user requests and delegates tasks concurrently to the Sentiment and Quant agents.
* Applies a "Hype Check": a cross-analysis that compares social momentum against actual market fundamentals to flag artificially inflated assets.
* Resolves contradictions between agents, applies the user's personal Risk Profile, and synthesizes a final Confidence Score and Reasoning Trace.

### 4.2 Sentiment Scout (Qualitative Agent)
* **Process:** Scrapes social sources -> Preprocesses text -> Runs NLP Scoring -> Validates data volume -> Aggregates to a Confidence Score.
* Analyzes market "vibes" and returns structured bullish/bearish scores.

### 4.3 Quant Analyst (Quantitative Agent)
* **Process:** Fetches OHLCV Data -> Computes RSI & MACD -> Requests extended history -> Computes Risk Metrics (Sharpe Ratio, Beta, Volatility) -> Validates metrics -> Returns Quant Score.
* Analyzes the "hard numbers" and fundamental indicators.

---

## 5. System Workflows & Use Cases

### Core Use Cases
1. **Register/Authenticate User:** Users create profiles mapping to a Supabase UUID.
2. **Configure Risk Profile:** Users define their investment capital, sector universe, and risk appetite (Conservative, Moderate, Aggressive).
3. **Request Asset Analysis:** User enters a ticker; Orchestrator triggers agents to fetch and synthesize data.
4. **View Combined Recommendation:** System displays the Confidence Score, suggested allocation, and hype check alerts.
5. **View AI Reasoning Trace:** User drills down into the precise logic, viewing the top influential sources and technical metric breakdowns.
6. **Generate Portfolio Suggestion:** System recommends a diversified asset allocation based strictly on the user's configured Risk Profile.
7. **Run Paper Trade Simulation:** User tests the recommendation in a risk-free environment, tracking virtual ROI over time.
8. **View Dashboard:** The central hub rendering active recommendations, watchlists, and portfolio performance.

### Lifecycle State Machines
To assist with state management and backend architecture, here are the expected lifecycle states for core entities:
* **Retail Investor Session:** Unauthenticated -> Configuring -> Pending -> Reviewing -> Evaluating -> Executing -> Ended
* **Paper Trade Entity:** Unconfigured -> Drafting -> Pending -> Simulating -> Closing -> Closed
* **Quant Agent:** Idle -> Fetching -> Computing -> Assessing -> Validating -> Scoring -> Completed
* **Sentiment Agent:** Idle -> Fetching -> Processing -> Scoring -> Validating -> Aggregating -> Completed
* **Watchlist Item:** Unassigned -> Monitored -> Promoted (to simulation) OR Discarded

---

## 6. Project & Business Objectives
* **Democratize Research:** Reduce the information asymmetry between retail and institutional investors.
* **Mitigate Hype Risk:** Protect users from "pump and dump" schemes via the automated Hype Check.
* **Promote Financial Literacy:** Turn raw market noise into educational, actionable insights.
* **Deliver Explainable AI:** Ensure all AI outputs are transparent, accountable, and tied to verifiable market data.