# ImpactAlphaSwarm

**See the evidence, understand it, decide for yourself.**

AlphaSwarm is an educational transparency platform for first-time South African
investors. Institutional investors don't only have more data than everyone else:
they have analysts who tell them what it means. Most of that data is public. What a
retail investor lacks is someone to say which of it matters, how its parts fit
together, and what it means for their own circumstances.

AlphaSwarm fills that gap. It gathers the evidence on US stocks and on South
African unit trusts and ETFs, explains it in plain language at the user's level,
shows how each explanation was reached, and teaches the user to read the evidence
themselves. Its role is the explaining half of an analyst's job, without the
recommending half.

Under the hood, a multi-agent pipeline (sentiment, quantitative and asset-discovery
agents orchestrated with LangGraph) runs nightly and ranks stocks against a
disclosed four-factor Signal Scorecard. Every output keeps its evidence beside it:
the news and social posts that were read, the quantitative percentiles, the insider
and institutional filings, and a written reasoning trace that is checked against
the figures it cites before it is shown. The platform is also open about its own
limits: where each figure comes from, how fresh it is, and what is not live.

AlphaSwarm informs; it does not advise. It makes no buy, hold or sell calls, no AI
selects funds, and the investment decision always remains with the user.

**Live site:** https://impact-alpha-swarm.vercel.app/

**Marking guide:** [`MARKING_GUIDE.md`](MARKING_GUIDE.md) maps each item on the
Iteration 4 coding marksheet to where it is in the code and why it was built that way.

## What's in the app

Every page follows the same pattern: the plain answer first, then the evidence
behind it, then how it was worked out.

| Area | What it does | Flag |
|---|---|---|
| **Dashboard** | A widget deck each user arranges: shortlist, watchlist, sentiment, quant, whale, funds, market news and learning widgets | — |
| **Stocks** | The latest run's ranked shortlist per investment universe, scored on the Signal Scorecard, with every other stock the run scored | — |
| **Stock page** | Tabs for Overview ("why it ranks here"), Sentiment (day-by-day chart, day summaries, the news and social evidence), Quant, Big investors (13F), Insider trading (Form 4) and Market news; prices in rand; a "How is this calculated?" methodology dialog | Some tabs need history/trace flags |
| **Funds** | SA unit trusts and JSE-listed ETFs from published fact sheets, matched to the onboarding profile by fixed rules on ASISA categories, with the reason each fund is in or out | `FUNDS_ENABLED` |
| **My funds** | Upload a fact-sheet PDF; Gemini reads it, every field it is unsure of is flagged with the page it came from for the user to confirm or correct, and the fund is saved privately (never to the shared catalogue or matching) | `FUND_UPLOADS_ENABLED` |
| **Compare** | Two or three stocks or funds side by side, with an optional written comparison that names no winner | `COMPARE_ENABLED` |
| **Market News** | World and market news tagged to investment universes by Jev, with a per-sector AI overview | `MACRO_NEWS_ENABLED` |
| **Whale Watching** | Institutional holdings and insider dealings, each shown with its date and context | — |
| **Watchlist** | Saved stocks with price, 14-day change and sparkline | — |
| **Learning Centre** | A roadmap and lesson library with quizzes, XP and badges; "Learn as you explore" links lessons into each page | — |
| **Financial Tools** | Growth, goal and tax-free savings planners, each with a today's-money figure | — |
| **Ask AlphaSwarm** | Questions about the user's own data, on its own page and as a floating panel | — |
| **Admin** | Users, reports, learning content, badges and the funds catalogue | — |

**Scope, stated plainly:** the stock analysis covers discretionary US equities only.
The funds catalogue is a deliberately narrow set of SA funds, entered by an
administrator from each fund's published fact sheet and carrying that sheet's date.
Crypto-assets are out of scope.

The rest of this file is a step-by-step guide to running the whole stack locally
(backend + frontend).

## Prerequisites

### System Requirements
- **Python**: 3.12 (the Cloud Run image is `python:3.12-slim`)
- **Node.js**: 20.19+ or 22.12+ (required by Vite 8)
- **npm**: Included with Node.js

### Required Accounts & API Keys
- **Supabase** (database + auth): https://supabase.com
- **Groq API key** (LLM reasoning, Ask AlphaSwarm, summaries): https://console.groq.com
- **Finnhub API key** (company and market news, insider dealings): https://finnhub.io

### Optional
- **Google Cloud Natural Language API key**: a second sentiment signal alongside VADER (production only)
- **Google Cloud project with Vertex AI**: Gemini reads uploaded fact sheets (My funds)
- **OpenRouter key for Jev**: tags Market News stories to investment universes
- **Marketaux**: supplemental tier-1 news, https://www.marketaux.com
- **SerpApi**: live educational search for Ask AlphaSwarm, https://serpapi.com
- **LangSmith**: tracing, https://smith.langchain.com

---

## Project Structure

```
ImpactAlphaSwarm/
├── backend/
│   ├── src/
│   │   ├── api.py                    # FastAPI app and core endpoints; mounts the feature routers
│   │   ├── agents/                   # sentiment_scout, quant_analyst, asset_discovery, gcp_nlp
│   │   ├── orchestration/            # LangGraph orchestrator + unified ranking
│   │   ├── funds/                    # catalogue, matcher, fact-sheet archive, uploads read by Gemini
│   │   ├── compare/                  # Compare page's written stock and fund comparisons
│   │   ├── macro/                    # Market News: collector, Jev tagger, sector digests
│   │   ├── quant/                    # Quant tab: price/RSI window and reasoning trace
│   │   └── utils/                    # Supabase client, sentiment modules, whale watching, traces
│   ├── migrations/                   # 001-039, applied in the Supabase SQL editor
│   ├── data/funds/                   # transcribed fact-sheet seed for the funds catalogue
│   ├── scripts/                      # ranking reports, fund seed loader, fact-sheet accuracy checks
│   ├── tests/                        # pytest suite
│   ├── Dockerfile                    # Cloud Run image (gunicorn + uvicorn worker)
│   ├── main.py                       # CLI entry point for a local orchestrator run
│   ├── requirements.txt              # Python dependencies
│   ├── requirements-dev.txt          # Test-only dependencies
│   ├── .env.example                  # Every backend variable, with notes
│   └── .env                          # Environment variables (create this)
├── frontend/
│   ├── src/
│   │   ├── components/               # React components, grouped by feature
│   │   ├── pages/                    # Routed pages (one per area above, plus auth and admin)
│   │   ├── dashboard/                # Widget registry and layout schema
│   │   ├── hooks/                    # Data-fetching and state hooks
│   │   ├── services/                 # Backend API + Supabase access
│   │   ├── store/                    # Zustand stores
│   │   ├── utils/                    # Pure logic (unit-tested)
│   │   ├── lib/, types/, data/       # Helpers, shared types, static content and copy
│   │   ├── index.css                 # Design tokens and shared platform classes
│   │   └── App.tsx                   # Routes
│   ├── package.json                  # Node dependencies
│   ├── vite.config.ts                # Vite configuration
│   ├── vitest.config.ts              # Test configuration
│   ├── .env.example                  # Frontend variables
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

`backend/migrations/` holds the schema changes made since the base tables, from 001
to 039. Open the Supabase **SQL editor** and run every file in filename order. They
are additive and idempotent, so re-running one is safe.

Two quirks in the numbering: some numbers name two files (019, 020, 024, 025, 031,
037 and 038), and 033 and 034 are unused. Run both files of a pair; the order within
a pair doesn't matter.

Many migrations back a feature flag and are only needed once that flag is on; the
backend never touches their tables before then. Apply them **before** switching the
flag on:

| Flag | Migrations |
|---|---|
| `SOCIAL_HISTORY_ENABLED` | 019_social_sentiment_daily_v3, 020_social_daily_seed_replaces, 023 |
| `NEWS_HISTORY_ENABLED` | 021 |
| `DAY_SUMMARY_ENABLED` | 022 |
| `FUNDS_ENABLED` | 024_funds, 025_fund_snapshot_common_core, 026, 037_asisa_2025_categories, 038_fund_snapshot_section_dates, then load the seed |
| `QUANT_TRACE_ENABLED` | 027 |
| `WHALE_INSTITUTIONS_TRACE_ENABLED` | 028 |
| `WHALE_INSIDER_TRACE_ENABLED` | 029 |
| `MACRO_NEWS_ENABLED` | 031_macro_news |
| `COMPARE_TRACE_ENABLED` | 035, and 036 for funds |
| `FUND_UPLOADS_ENABLED` | 039 |

The funds page needs its tables **and** a loaded seed to show anything
(`backend/scripts/load_fund_seed.py`).

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
- Fact-sheet reading (google-genai, pypdf, python-multipart)

### Step 2.4: Create Backend Environment File

Copy `backend/.env.example` to `backend/.env`. It lists every variable, ordered by
what it costs to leave one out, with a note on each. The minimum to run locally:

```env
# === Required: the process raises at import without these ===
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# === Required in practice: no key means no LLM output, and no error ===
GROQ_API_KEY=your_groq_api_key_here

# === Pipeline flags: keep these four as production runs them ===
DISCOVERY_ENABLED=true
DISCOVERY_SHADOW_MODE=false
UNIFIED_RANKING_ENABLED=true
UNIFIED_RANKING_SHADOW=false

# === CORS ===
API_CORS_ORIGINS=http://localhost:5173

# === Data sources (each degrades quietly when blank) ===
FINNHUB_API_KEY=your_finnhub_key_here
MARKETAUX_API_KEY=                      # leave blank locally
GOOGLE_NLP_API_KEY=                     # leave blank locally: VADER only
```

**Replace the placeholder values with your actual credentials.**

The four pipeline flags default to the legacy path in code, so leaving them out runs
a different ranking from production. The feature flags (funds, uploads, compare,
market news, the sentiment history and the traces) default to off; see the table
under Step 1.2 and the notes in `.env.example`.

**Fact-sheet uploads** use Gemini on Vertex AI, with no API key. Set
`FUND_UPLOADS_ENABLED=true` (alongside `FUNDS_ENABLED=true`), `GOOGLE_CLOUD_PROJECT`
and `GOOGLE_CLOUD_LOCATION=eu`, then authenticate locally with:

```bash
gcloud auth application-default login
```

`FUND_EXTRACT_MODEL` defaults to `gemini-3.8-flash`. In production the Cloud Run
service account provides the credentials.

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

Copy `frontend/.env.example` to `frontend/.env`:

```env
# === Supabase Configuration ===
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# === Backend API Configuration ===
VITE_API_BASE=http://localhost:8000

# === Optional features (each also needs its backend flag) ===
VITE_FUNDS_ENABLED=false                # Funds page; backend FUNDS_ENABLED
VITE_FUND_UPLOADS_ENABLED=false         # My funds tab; backend FUND_UPLOADS_ENABLED
VITE_COMPARE_ENABLED=false              # Compare page; backend COMPARE_TRACE_ENABLED for the written comparison
VITE_MACRO_NEWS_ENABLED=false           # Market News page; backend MACRO_NEWS_ENABLED
VITE_UNIFIED_SCORECARD=true             # Signal Scorecard panel (production runs it on)
```

**Use the same Supabase URL as the backend.** The `VITE_*` values are read at build
time, so restart `npm run dev` after changing one.

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

Neither suite touches the network, the database, or an LLM, and both run in
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
- **Scheduled jobs**: Cloud Scheduler calls these endpoints, each sending
  `DAILY_RUN_SECRET` in the `X-Daily-Run-Secret` header. An endpoint returns 503 if
  the secret is not configured and 401 if the header does not match. Raise each job's
  attempt deadline well above the 180-second default.

| Endpoint | When | What it does |
|---|---|---|
| `POST /api/analysis/run-daily` | 22:00 UTC | The nightly batch, just after the NYSE close |
| `POST /api/social/backfill` | 23:00 UTC | Seeds social history for tickers discovered that night |
| `POST /api/sentiment/summaries` | 00:30 UTC | Settles the day summaries for the day that just closed |
| `POST /api/social/tick` | 09:35 and 13:35 America/New_York, Mon–Fri | Intraday sentiment top-up |
| `POST /api/macro/pull` | Three times a day | Pulls, scores and tags Market News stories |

---

## Environment Variables Quick Reference

### Backend `.env`
```
SUPABASE_URL                    → Supabase project URL
SUPABASE_SERVICE_ROLE_KEY       → Supabase service role key
GROQ_API_KEY                    → Groq API key (GROQ_API_KEY2-7 optionally split the load)
FINNHUB_API_KEY                 → Finnhub key (news + insider dealings)
API_CORS_ORIGINS                → Allowed frontend origins (localhost:5173 locally)
DISCOVERY_ENABLED               → Run the discovery agent (production: true)
DISCOVERY_SHADOW_MODE           → Record discovery without using it (production: false)
UNIFIED_RANKING_ENABLED         → Signal Scorecard ordering (production: true)
UNIFIED_RANKING_SHADOW          → Record without reordering (production: false)
DAILY_RUN_SECRET                → (Production) shared secret for the scheduled endpoints
GOOGLE_NLP_API_KEY              → (Optional) Google Cloud Natural Language API key
MARKETAUX_API_KEY               → (Optional) supplemental tier-1 news
SERPAPI_API_KEY                 → (Optional) live educational search for Ask AlphaSwarm
LANGSMITH_API_KEY               → (Optional) LangSmith API key
LANGSMITH_PROJECT               → (Optional) LangSmith project name
SOCIAL_HISTORY_ENABLED          → (Optional) social sentiment history chart
NEWS_HISTORY_ENABLED            → (Optional) news line on the sentiment chart
DAY_SUMMARY_ENABLED             → (Optional) generated day summaries on the chart
SOCIAL_TICK_ENABLED             → (Optional) intraday social top-up
NEWS_TICK_ENABLED               → (Optional) intraday news top-up
QUANT_HISTORY_ENABLED           → (Optional) Quant tab price/RSI window over 1M-5Y
QUANT_TRACE_ENABLED             → (Optional) Quant tab reasoning trace (needs history)
WHALE_INSTITUTIONS_TRACE_ENABLED → (Optional) Big investors AI summary
WHALE_INSIDER_TRACE_ENABLED     → (Optional) Insider trading AI summary
COMPARE_TRACE_ENABLED           → (Optional) Compare page's written comparison
FUNDS_ENABLED                   → (Optional) serve the funds catalogue
FUND_UPLOADS_ENABLED            → (Optional) fact-sheet uploads (needs FUNDS_ENABLED)
GOOGLE_CLOUD_PROJECT            → (Uploads) GCP project for Gemini on Vertex AI
GOOGLE_CLOUD_LOCATION           → (Uploads) Vertex AI location, eu
FUND_EXTRACT_MODEL              → (Uploads) Gemini model, default gemini-3.8-flash
MACRO_NEWS_ENABLED              → (Optional) Market News
TYPESAFE_API_KEY_OPENROUTER     → (Market News) Jev via OpenRouter, tags stories
```

All flags default to off. Further tuning variables (ranking weights, discovery
thresholds, news weighting, cache ages, upload limits) have the intended defaults in
code; `backend/.env.example` documents them.

### Frontend `.env`
```
VITE_SUPABASE_URL               → Supabase project URL (same as backend)
VITE_SUPABASE_ANON_KEY          → Supabase anon key
VITE_API_BASE                   → Backend URL (localhost:8000 locally)
VITE_UNIFIED_SCORECARD          → (Optional) "true" renders the Signal Scorecard panel
VITE_FUNDS_ENABLED              → (Optional) "true" shows the Funds page and nav entry
VITE_FUND_UPLOADS_ENABLED       → (Optional) "true" shows the My funds tab
VITE_COMPARE_ENABLED            → (Optional) "true" shows the Compare page
VITE_MACRO_NEWS_ENABLED         → (Optional) "true" shows the Market News page
```

---

**Last Updated**: October 24, 2026
**Project**: ImpactAlphaSwarm - Information Systems Honours Project
**Stack**: Python FastAPI + LangGraph + React + TypeScript + Supabase + Gemini on Vertex AI
