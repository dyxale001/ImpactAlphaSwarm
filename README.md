# ImpactAlphaSwarm

AlphaSwarm is a financial-transparency platform for retail investors. A multi-agent
pipeline (sentiment, quantitative, and asset-discovery agents orchestrated with
LangGraph) runs nightly, ranks assets against a disclosed four-factor Signal
Scorecard, and presents the underlying evidence: the news and social posts that
were read, the quantitative percentiles, insider and institutional activity, and a
reasoning trace. It informs; it does not give investment advice.

**Live site:** https://impact-alpha-swarm.vercel.app/

The rest of this file is a step-by-step guide to running the whole stack locally
(backend + frontend).

## Prerequisites

### System Requirements
- **Python**: 3.12 (the Cloud Run image is `python:3.12-slim`)
- **Node.js**: 20.19+ or 22.12+ (required by Vite 8)
- **npm**: Included with Node.js

### Required Accounts & API Keys
- **Supabase** (database + auth): https://supabase.com
- **Groq API key** (LLM reasoning): https://console.groq.com
- **Google Cloud Natural Language API key** (sentiment, alongside VADER)
- **Finnhub API key** (company news + insider dealings): https://finnhub.io
- **Optional**: Marketaux (supplemental tier-1 news): https://www.marketaux.com
- **Optional**: LangSmith for tracing: https://smith.langchain.com

---

## Project Structure

```
ImpactAlphaSwarm/
├── backend/
│   ├── src/
│   │   ├── api.py                    # FastAPI endpoints (analysis, assets, whales, admin)
│   │   ├── agents/                   # sentiment_scout, quant_analyst, asset_discovery, gcp_nlp
│   │   ├── orchestration/            # LangGraph orchestrator + unified ranking
│   │   └── utils/                    # Supabase client, sentiment modules, whale watching, traces
│   ├── migrations/                   # 001-014, applied in the Supabase SQL editor
│   ├── scripts/                      # ranking shadow / stability reports
│   ├── tests/                        # pytest suite
│   ├── Dockerfile                    # Cloud Run image (gunicorn + uvicorn worker)
│   ├── main.py                       # CLI entry point for a local orchestrator run
│   ├── requirements.txt              # Python dependencies
│   ├── requirements-dev.txt          # Test-only dependencies
│   └── .env                          # Environment variables (create this)
├── frontend/
│   ├── src/
│   │   ├── components/               # React components, grouped by feature
│   │   ├── pages/                    # Routed pages (dashboard, learning, whale watching, admin)
│   │   ├── hooks/                    # Data-fetching and state hooks
│   │   ├── services/                 # Backend API + Supabase access
│   │   ├── store/                    # Zustand stores
│   │   ├── utils/                    # Pure logic (unit-tested)
│   │   ├── lib/, types/, data/       # Helpers, shared types, static content
│   │   └── App.tsx                   # Main app component
│   ├── package.json                  # Node dependencies
│   ├── vite.config.ts                # Vite configuration
│   ├── vitest.config.ts              # Test configuration
│   └── .env                          # Environment variables (create this)
├── TESTING.md                        # What the test suites cover
└── README.md
```

---

## Phase 1: Supabase Setup

### Step 1.1: Get Credentials

From your Supabase project:

1. **Project URL**: Go to Settings → API → Project URL
   - Save this as `SUPABASE_URL`

2. **Service Role Key**: Go to Settings → API → Service Role (under "API Keys")
   - Save this as `SUPABASE_SERVICE_ROLE_KEY`

3. **Anon Key**: Go to Settings → API → Anon public (under "API Keys")
   - Save this as `VITE_SUPABASE_ANON_KEY`

### Step 1.2: Apply the Migrations

`backend/migrations/` holds the schema changes made since the base tables, in
numbered order (001 through 014): news and social sentiment columns, the quant
sub-dimensions, the whale-watching and news caches, asset discovery, entity
descriptions, and the unified ranking tables.

Open the Supabase **SQL editor** and run each file in order. They are additive and
idempotent, so re-running one is safe.

---

## Phase 2: Backend Setup

### Step 2.1: Navigate to Backend Directory

```bash
cd backend
```

### Step 2.2: Create Python Virtual Environment

```bash
python -m venv venv
```

Activate the virtual environment:

**macOS/Linux:**
```bash
source venv/bin/activate
```

**Windows:**
```bash
venv\Scripts\activate
```

### Step 2.3: Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- FastAPI, Uvicorn & Gunicorn (web server)
- LangGraph, LangChain & LangSmith (AI orchestration and tracing)
- Supabase Python client
- Data libraries (pandas, numpy, scipy, yfinance, pandas-ta-classic)
- Sentiment and LLM clients (vaderSentiment, groq)

### Step 2.4: Create Backend Environment File

Create a `.env` file in the backend directory (`backend/.env.example` has the full
list with notes on the tuning variables):

```env
# === Supabase Configuration ===
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# === LLM Provider ===
GROQ_API_KEY=your_groq_api_key_here

# === Sentiment Sources ===
GOOGLE_NLP_API_KEY=your_google_nlp_key_here
FINNHUB_API_KEY=your_finnhub_key_here
MARKETAUX_API_KEY=                      # optional; falls back to Finnhub only

# === Nightly Scheduled Run ===
DAILY_RUN_SECRET=your_daily_run_secret  # openssl rand -hex 32; unset disables the endpoint
DAILY_ACTIVE_DAYS=7

# === CORS Configuration ===
API_CORS_ORIGINS=http://localhost:5173

# === Optional: LangSmith Tracing ===
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=AlphaSwarm
LANGSMITH_TRACING=true
```

**Replace the placeholder values with your actual credentials.**

Feature flags default to off, so a fresh `.env` runs the legacy path. Set
`DISCOVERY_ENABLED=true` to run the discovery agent in the nightly batch, and
`UNIFIED_RANKING_ENABLED=true` (with `UNIFIED_RANKING_SHADOW=false`) to let the
four-factor Signal Scorecard order the feed rather than only record it.

---

## Phase 3: Frontend Setup

### Step 3.1: Navigate to Frontend Directory

From the project root (open a **new terminal**):

```bash
cd frontend
```

### Step 3.2: Install Node Dependencies

```bash
npm install
```

This installs React 19, Vite, TypeScript, Tailwind CSS, Zustand, Recharts, and all
other frontend dependencies.

### Step 3.3: Create Frontend Environment File

Create a `.env` file in the frontend directory (use `frontend/.env.example` for the
structure):

```env
# === Supabase Configuration ===
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# === Backend API Configuration ===
VITE_API_BASE=http://localhost:8000

# === Optional ===
VITE_UNIFIED_SCORECARD=false            # "true" renders the Signal Scorecard panel
```

**Use the same Supabase URL as the backend.**

---

## Phase 4: Running the Application

### Step 4.1: Start Backend Server

In **Terminal 1**, from the backend directory:

```bash
# Ensure virtual environment is activated
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Start the FastAPI server
uvicorn src.api:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

✓ API is now running at `http://localhost:8000`
✓ Interactive API docs at `http://localhost:8000/docs`

To run the orchestrator once from the command line instead of through the API:

```bash
python main.py
```

### Step 4.2: Start Frontend Development Server

In **Terminal 2**, from the frontend directory:

```bash
npm run dev
```

Expected output:
```
  VITE v8.0.10  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

✓ Frontend is now running at `http://localhost:5173`

---

## Phase 5: Verify Everything Works

1. **Open Frontend**: http://localhost:5173
2. **View API Docs**: http://localhost:8000/docs
3. **Check Console**: Look for any errors in terminal or browser console
4. **Test API Endpoint**:
   ```bash
   curl http://localhost:8000/docs
   ```

---

## Running the Tests

Neither suite touches the network, the database, or an LLM, and both run in a few
seconds. See `TESTING.md` for what is covered and why.

**Backend** (from `backend/`):
```bash
pip install -r requirements-dev.txt   # first time only
pytest
```

**Frontend** (from `frontend/`):
```bash
npm test          # single run
npm run test:watch
```

---

## Deployment

- **Frontend**: Vercel, deployed automatically on push to `main`, and served at
  https://impact-alpha-swarm.vercel.app/. The `VITE_*` variables above are set as
  Vercel environment variables.
- **Backend**: Google Cloud Run, built from `backend/Dockerfile` (gunicorn with a
  uvicorn worker, bound to the injected `$PORT`). Set the backend `.env` values as
  Cloud Run environment variables, and include the deployed frontend origin in
  `API_CORS_ORIGINS`.
- **Nightly run**: Cloud Scheduler calls `POST /api/analysis/run-daily` at 22:00 UTC,
  just after the NYSE close, sending `DAILY_RUN_SECRET` in the `X-Daily-Run-Secret`
  header. The endpoint returns 503 if that secret is not configured and 401 if the
  header does not match.

---

## Environment Variables Quick Reference

### Backend `.env`
```
SUPABASE_URL                    → Supabase project URL
SUPABASE_SERVICE_ROLE_KEY       → Supabase service role key
GROQ_API_KEY                    → Groq API key (LLM reasoning)
GOOGLE_NLP_API_KEY              → Google Cloud Natural Language API key
FINNHUB_API_KEY                 → Finnhub key (news + insider dealings)
API_CORS_ORIGINS                → Allowed frontend origins (localhost:5173 locally)
DAILY_RUN_SECRET                → Shared secret for the nightly run endpoint
MARKETAUX_API_KEY               → (Optional) supplemental tier-1 news
LANGSMITH_API_KEY               → (Optional) LangSmith API key
LANGSMITH_PROJECT               → (Optional) LangSmith project name
DISCOVERY_ENABLED               → (Optional) run the discovery agent, default false
UNIFIED_RANKING_ENABLED         → (Optional) four-factor ordering, default false
UNIFIED_RANKING_SHADOW          → (Optional) record without reordering, default true
FUNDS_ENABLED                   → (Optional) serve the funds catalogue, default false
FUND_TRACES_ENABLED             → (Optional) LLM fund explanations, default false
```

Further tuning variables (discovery thresholds, news weighting, quant window,
ranking weights) are documented inline in `backend/.env.example`.

### Frontend `.env`
```
VITE_SUPABASE_URL               → Supabase project URL (same as backend)
VITE_SUPABASE_ANON_KEY          → Supabase anon key
VITE_API_BASE                   → Backend URL (localhost:8000 locally)
VITE_UNIFIED_SCORECARD          → (Optional) "true" renders the Signal Scorecard panel
VITE_FUNDS_ENABLED              → (Optional) "true" shows the Funds page and nav entry
```

---

**Last Updated**: August 10, 2026
**Project**: ImpactAlphaSwarm - Information Systems Honours Project
**Stack**: Python FastAPI + LangGraph + React + TypeScript + Supabase
