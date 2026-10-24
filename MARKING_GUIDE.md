# Marking guide

This file maps each item on the INF4027W **Coding Presentation Iteration 4 marksheet**
to the code that addresses it. Each entry points to a file and line, with a short
note on why it was built that way. Paths are relative to the repository root.

For what AlphaSwarm is and how to run it, see [README.md](README.md). For what the
test suites cover, see [TESTING.md](TESTING.md).

## At a glance

| # | Marksheet item | Marks | Start here |
|---|---|---|---|
| 1 | [Technology used](#1-technology-used) | 4 | `backend/requirements.txt`, `frontend/package.json`, `backend/Dockerfile` |
| 2 | [Database](#2-database) | 4 | `backend/src/utils/supabase_client.py`, `backend/migrations/` |
| 3 | [Coding structure](#3-coding-structure) | 4 | `backend/src/funds/` (router → service → repository) |
| 4 | [Object-oriented concepts](#4-object-oriented-concepts) | 8 | `backend/src/orchestration/`, `backend/src/agents/quant_analyst.py` |
| 5 | [Data validation, controls and security](#5-data-validation-controls-and-security) | 4 | `backend/src/api.py:6630`, `backend/src/funds/upload_service.py` |
| 6 | [Key features work correctly (MVP)](#6-key-features-work-correctly-mvp) | 8 | The feature table below |
| 7 | [User interface](#7-user-interface) | 4 | `frontend/src/index.css`, `frontend/src/components/` |
| 8 | [Ease of navigation](#8-ease-of-navigation) | 4 | `frontend/src/data/appNavigation.ts` |
| 9 | [APIs](#9-apis) | 4 | `backend/src/utils/llm_client.py`, `backend/src/utils/ss_news.py` |
| 10 | [Integration, scalability, maintainability, separation of concerns](#10-integration-scalability-maintainability-and-separation-of-concerns) | 4 | `backend/src/orchestration/langgraph_orchestrator.py` |
| 11 | [Sophistication and complexity](#11-sophistication-and-complexity) | 4 | The pipeline and the checked AI text |
| 12 | [Overall evidence of effort](#12-overall-evidence-of-effort) | 4 | Git history, tests, migrations |

[Changes since the Iteration 2 code review](#changes-since-the-iteration-2-code-review) lists how each
point raised in that review was addressed. [Known trade-offs](#known-trade-offs) states the limits that
remain and why they stand.

---

## 1. Technology used

*Appropriateness of the technology; practicality, costs, scalability.*

| Layer | Choice | Why it fits |
|---|---|---|
| Backend API | Python 3.12, FastAPI, gunicorn + uvicorn (`backend/Dockerfile:3`) | Python carries the data and AI libraries the analysis needs; FastAPI gives typed request models and generated API docs at `/docs` |
| Agent orchestration | LangGraph 1.1 (`backend/requirements.txt:15`) | The analysis is a graph of phases with a parallel fan-out; LangGraph models that directly (see §10) |
| Data and indicators | pandas, numpy, scipy, pandas-ta-classic, yfinance | Standard, free tooling for price windows, RSI, MACD, beta and Sharpe |
| Sentiment | VADER plus Google Cloud Natural Language | VADER is free and local; GCP adds a second signal on the posts that matter most, under a monthly budget |
| LLM | Groq (`openai/gpt-oss-20b`, `backend/src/utils/llm_client.py:24`) | Fast and free-tier friendly; the model is swappable from the environment without a deploy |
| Document reading | Gemini on Vertex AI (`backend/src/funds/reading.py:50-51`) | Reads PDF fact sheets with structured output; about 2 US cents an upload |
| Database, auth, storage | Supabase (Postgres) | One platform supplies authentication, a relational database and file storage (see §2) |
| Frontend | React 19, TypeScript, Vite 8, Tailwind 4, Zustand, Recharts (`frontend/package.json`) | Typed components, a fast build, and one design system in CSS tokens |
| Hosting | Vercel (frontend), Google Cloud Run (backend), Cloud Scheduler (jobs) | Push-to-deploy frontend; a container backend that scales to zero; scheduled batch jobs instead of a server running all day |

**Cost is designed in, not left to chance:**
- The nightly batch analyses each ticker once for all users, then personalises per user
  (`backend/src/orchestration/langgraph_orchestrator.py:1336`).
- AI text is generated once and stored, so each paragraph is paid for once. Closed days are never
  regenerated (`backend/src/utils/day_summary.py:21-28`, enforced in SQL at
  `backend/migrations/022_sentiment_day_summary.sql:128`).
- Only the top five ranked assets get an LLM-written trace (`REASONING_TRACE_TOP_N`,
  `langgraph_orchestrator.py:466`).
- `backend/.env.example` records the cost reasoning per service: GCP NLP at about $35 a month for
  40,000 units, the Marketaux free plan at about 100 calls a day, and uploads at about 2 US cents each.
- Every paid feature sits behind a flag that defaults to off, so cost is opt-in.

## 2. Database

*Appropriateness, connection, structure.*

**Why Supabase/Postgres.** The data is relational: users own runs, runs own recommendations,
recommendations reference assets, and funds own fact-sheet snapshots. Postgres enforces that with
foreign keys and check constraints. Supabase adds the authentication and file storage the app needs
(private fact-sheet archive, badge icons) on the same platform.

**Connection.**
- **Backend:** one client built from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It fails
  fast if either is missing (`backend/src/utils/supabase_client.py:53-59`).
- **Frontend:** a separate client with the public anon key only (`frontend/src/lib/supabase.ts:3-10`),
  which throws if its variables are missing.
- **Data access** goes through repository classes (`supabase_client.py:282`, see §4). Pages and
  components never query tables directly; they use services and hooks in `frontend/src/services/`.

**Structure.** The schema changes are in `backend/migrations/` (001–039). They are additive and
idempotent, so each can be re-run safely. Examples worth opening:
- **`024_funds.sql`:** unique ISINs (`:106`), check constraints on vehicle, risk (1–5), source and
  review status (`:107`, `:152-155`), a cascading foreign key from snapshots to funds (`:126`), and
  indexes (`:112-113`, `:160-161`).
- **`039_uploaded_funds.sql`:** per-user rows that cascade with the user (`:33`), a partial unique
  index on `(user_id, isin)` (`:52-53`), a cache keyed by document hash (`:105`), and a usage table
  that counts uploads in the database rather than in memory (`:109-119`).
- **`016_nlp_budget.sql`:** the shared monthly spend ledger. `reserve_nlp_units` takes a row lock
  (`:60-63`) so concurrent containers can't overspend.
- **`021` and `022`:** upserts that are safe to repeat. A day's row is only replaced by one built
  from at least as much evidence, and a closed day is never rewritten.
- **Row level security** is enabled on the backend-owned tables with no browser policy, so only the
  backend's service role can read or write them. A test enforces this for the upload tables
  (`backend/tests/test_funds_upload_isolation.py:360-368`).
- **The per-user run lock** is an atomic conditional update (`AiRunRepository.acquire`,
  `supabase_client.py:558`). It stops a user from starting two analyses at once, and a lock left by
  a crashed run expires.

## 3. Coding structure

*Framework used (e.g. MVC); best practices.*

The backend follows a **router → service → repository** layering, the web-API equivalent of MVC:

| Layer | Example | Responsibility |
|---|---|---|
| Router (controller) | `backend/src/funds/routes.py:43` | HTTP only: parse the request, call the service, shape the response |
| Service | `backend/src/funds/service.py:28` | Business rules, with its collaborators injected |
| Repository | `backend/src/funds/repository.py:70` | Database access, behind the shared `Repository` base class |
| Config | `backend/src/funds/config.py` | Settings and feature flags from the environment |

The same shape repeats in `backend/src/macro/` (routes → `service.py:57` → `repository.py:17`),
`backend/src/compare/` and `backend/src/quant/`. Each feature package exposes a `mount_*` function,
and `backend/src/api.py:188-251` mounts it only when its flag is on.

The frontend separates `pages/` (routes), `components/` (grouped by feature), `hooks/` (data
fetching and state), `services/` (backend and Supabase access), `store/` (Zustand), `utils/` (pure,
unit-tested logic) and `data/` (copy and configuration).

**Practices:**
- Type hints and docstrings throughout the backend. The module docstrings explain the reasoning, for
  example `backend/src/orchestration/ranking.py:1-60` and `backend/src/agents/quant_analyst.py:1-63`.
- TypeScript strict mode on the frontend.
- No hard-coded hosts: every backend URL is built from `VITE_API_BASE` (typed at
  `frontend/src/vite-env.d.ts:6`), and every key and flag comes from the environment.
- Feature flags fail closed: anything other than `"true"` is off (`backend/src/funds/config.py:18-31`).
- 3,000 backend tests (pytest) and 1,222 frontend tests (Vitest), none of which need an LLM or a
  live API key.

## 4. Object-oriented concepts

*Classes; encapsulation.* The analysis pipeline was rebuilt around class hierarchies with explicit
inheritance (PR #38, branch `refactor/pipeline-oop`); the Learning Centre and admin CMS followed in
PR #39. The strongest examples:

**Inheritance and polymorphism**
- **Pipeline phases.** `Phase(ABC)` (`backend/src/orchestration/langgraph_orchestrator.py:639`)
  declares an abstract `run`. Five subclasses override it: `InitializePhase` `:663`, `QuantPhase`
  `:712`, `SentimentPhase` `:758`, `SynthesizePhase` `:793` and `OutputPhase` `:837`.
  `build_graph(phases: dict[str, Phase])` (`:1225`) adds each to the graph without knowing its
  concrete type.
- **Ranking factors, three levels deep.**
  - Abstract base: `RankingFactor(ABC)` (`backend/src/orchestration/ranking.py:257`).
  - Abstract middle class: `FlooredFactor` (`:271`). Its `score` is a template method that calls the
    abstract `raw` and `default_floor`.
  - Concrete leaves: `SignalStrength`, `Convergence`, `DataSufficiency` and `ProfileFit`
    (`:300-454`).
  - `AssetRanker` (`:581`) works only with the base type.
- **Quant indicators.**
  - `Indicator(ABC)` (`backend/src/agents/quant_analyst.py:107`) has a template `compute` and an
    abstract `_compute`.
  - `ReturnsIndicator` (`:163`) specialises it for return-based measures.
  - The leaves are `RSI`, `MACD`, `SharpeRatio`, `Volatility`, `Beta` and `TrailingReturn`.
- **Data access.** `Repository(ABC)` (`backend/src/utils/supabase_client.py:282`) is the base for
  nine repositories in that file. It is also extended across packages: `FundRepository`
  (`backend/src/funds/repository.py:70`) and `UploadedFundRepository` (`backend/src/funds/uploads.py:33`).
- **Sources, in three levels.** `MentionSource(ABC)` (`backend/src/utils/ss_base.py:30`) has two
  abstract children:
  - `NewsSource` (`backend/src/utils/ss_news.py:33`), with leaves `FinnhubSource` and `MarketauxSource`.
  - `SocialSource` (`backend/src/utils/ss_social.py:55`), with the leaf `StockTwitsSource`.
- **Subclasses that extend rather than replace.** The "What's driving the sentiment" feature reuses
  the day-summary classes:
  - It subclasses the builder, repository, generator and service
    (`backend/src/utils/day_drivers.py:57`, `:225`, `:238`, `:266`).
  - It overrides only class attributes and the methods that differ, and calls `super().__init__`.

**Design patterns**
- **Strategy.** The news strategies: `NewsStrategy(ABC)` (`backend/src/utils/ss_news.py:353`) has
  three implementations, chosen by mode (`:436-459`). The sentiment models: `SentimentModel(ABC)`
  (`backend/src/utils/ss_scoring.py:26`) is implemented by VADER and GCP.
- **Template method.** `ReadThroughCache.serve` (`backend/src/utils/ww_store.py:99`) fixes the
  algorithm (fresh cache → fetch → serve the stale copy on failure). Its subclasses supply the TTL
  and the row shape.
- **Chain and pipeline.**
  - `ValidatorChain` (`backend/src/funds/validators.py:873`) runs 14 `RowValidator` subclasses.
  - `FundMatcher` (`backend/src/funds/matcher.py:288`) applies `MatchRule` subclasses in order
    (`:82` onwards), passing a frozen `MatchState` between them.
- **Factory.** `SourceFactory.from_config` (`backend/src/agents/asset_discovery.py:610`) builds the
  discovery sources. `Gate(ABC)` (`:651`) defines the gates a candidate stock must pass.
- **Swappable stores, each with a test double.** `TraceStore(ABC)` (`backend/src/utils/traces.py:98`)
  has file and in-memory versions. `BudgetStore(ABC)` (`backend/src/agents/nlp_budget.py:32`) has
  Supabase and file versions.

**Encapsulation and composition**
- Private state behind read-only properties: `TickerScoper` (`langgraph_orchestrator.py:469`) and
  `ZarPriceConverter` (`supabase_client.py:108`), which hides two private TTL caches.
- **Constructor injection with production defaults.** `SentimentScout()` runs in production and
  `SentimentScout(fake)` in a test. Examples:
  - `backend/src/agents/sentiment_scout.py:71-103`
  - `QuantAnalyst` (`quant_analyst.py:667`)
  - `FundCatalogueService` (`backend/src/funds/service.py:28`)
- Immutable configuration objects (frozen dataclasses with `from_env`), e.g. `backend/src/compare/config.py:15`.
- Tests subclass the abstractions to prove they extend: `backend/tests/test_asset_discovery.py:586`
  (`AlwaysRejects(Gate)`) and `backend/tests/test_funds_matcher.py:528` (`NoTrackersRule(MatchRule)`).

**Frontend.** React components are functions by design: React 19 recommends hooks over class
components. Classes are used where they fit:
- `AskAlphaSwarmService` (`frontend/src/services/ask/AskAlphaSwarmService.ts:38`) keeps its token
  handling private. It throws three `Error` subclasses that the hook handles polymorphically.
- `LearningQuizEngine` and `LearningCentreRepository` (`frontend/src/services/supabase/learningService.ts:49`, `:152`).
- `DashboardLayoutRepository` (`frontend/src/services/supabase/dashboardLayoutService.ts:12`).

## 5. Data validation, controls and security

**Authentication and authorisation**
- **Every protected endpoint checks the bearer token with Supabase Auth.** It then refuses
  deactivated accounts (`_get_user_id_from_bearer`, `backend/src/api.py:6630-6658`). The feature
  packages reuse it as a FastAPI dependency (`backend/src/funds/routes.py:60`).
- **Where admins and users are told apart:**
  - Backend: `backend/src/api.py:6669`, inside `_require_admin` (`:6660`). Admin endpoints call it and
    return 403 to anyone else.
  - Frontend: `frontend/src/components/AdminRoute.tsx:15`, nested inside `ProtectedRoute` in
    `frontend/src/App.tsx`.
- **The user id always comes from the token, never from a request parameter,** so one user can't
  request another's data (`backend/src/funds/routes.py:67-69`). Tests check that one reader can't
  see another's uploads (`backend/tests/test_funds_upload_isolation.py`).
- **Scheduled endpoints need a shared secret,** compared in constant time with
  `secrets.compare_digest` (`backend/src/api.py:6526`). They return 503 when no secret is configured.

**Input validation**
- Pydantic request models and bounds on every write endpoint, e.g. `backend/src/funds/upload_routes.py:44-62`.
- Fund data passes a chain of validators before it is stored, for example on ISINs, allocations
  that must sum correctly, and fee ranges (`backend/src/funds/validators.py:1-18`, `:873`, `:918`).
  The same validators serve the seed loader, the admin API and user uploads.
- **Uploaded PDFs** (`backend/src/funds/upload_service.py:171-195`) are checked before any model call:
  size, the `%PDF-` signature, encryption, damage and page count. Each reader may upload 10 a day,
  counted in the database. The count fails closed: if it can't be read, the upload is refused.
- **The review step can't be skipped or forged.** The upload's reading is signed with an HMAC token
  (`upload_service.py:91-121`, verified with `hmac.compare_digest`). Saving rejects a token that is
  expired, belongs to another user, or still has flagged fields unreviewed.
- **Fact-sheet links** must be https and on an allowlisted host. The hostname is matched exactly,
  and every redirect is re-checked (`backend/src/funds/documents.py:144-198`).
- **Frontend forms** validate email, password strength (with a live checklist) and onboarding goals
  (`frontend/src/utils/validation.ts`, `frontend/src/components/AuthLayout.tsx:110-140`).

**Controls on AI output.** Generated text is checked before anyone sees it:
- **Numbers.** Every number in a paragraph must appear in the facts it was given:
  - `TraceGuard` (`backend/src/quant/trace.py:252`)
  - `CopyGuard` (`backend/src/funds/explain.py:248`)
  - `ComparisonGuard` (`backend/src/compare/trace.py:330`)
  - `_check_numerical_claims` for Ask (`backend/src/utils/ask_output_validator.py:212`)
- **Wording.** Advice and forecasting words are refused (`FORBIDDEN_PATTERNS`, `backend/src/quant/trace.py:67`).
- **Fallback.** A paragraph that fails either check is replaced by a template built from the same
  facts and labelled as such.
- **Ask AlphaSwarm screens each question in stages:**
  1. A rate limit.
  2. A personal-finance gate.
  3. An advice and prediction blocklist (`backend/src/api.py:755`).
  4. An LLM intent classifier (`:1289`).

  Its web search is restricted to an allowlist of educational domains, and every result is re-checked
  after the search (`backend/src/utils/educational_retrieval.py:91`, `:215`, `:1016-1022`).

**Secrets.** All keys come from the environment, and `.env` files are git-ignored. The browser only
ever holds the public anon key; the service role key and every third-party key stay on the server.

## 6. Key features work correctly (MVP)

Run the app as described in the README, or use the deployed site. Areas marked "flag" need their
switch on (see the README's "What's in the app" table).

| Feature | Frontend | Backend | Tests |
|---|---|---|---|
| Onboarding and risk profile | `frontend/src/pages/Onboarding.tsx` | profile stored in `user_analysis` | `frontend/src/utils/riskProfileReasoning.test.ts` |
| Nightly multi-agent analysis and ranked stocks | `frontend/src/pages/Assets.tsx` | `backend/src/orchestration/` | `backend/tests/test_orchestration.py`, `test_ranking*.py` |
| Stock page with evidence tabs | `frontend/src/pages/AssetDetailsPage.tsx` | `backend/src/api.py`, `backend/src/quant/` | `backend/tests/test_quant_*.py` |
| Funds catalogue and profile matching (flag) | `frontend/src/pages/Funds.tsx` | `backend/src/funds/matcher.py` | `backend/tests/test_funds_matcher.py` |
| Fact-sheet upload with human review (flag) | `frontend/src/components/funds/` | `backend/src/funds/upload_service.py`, `reading.py` | `backend/tests/test_funds_upload*.py` |
| Compare (flag) | `frontend/src/pages/Compare.tsx` | `backend/src/compare/` | `backend/tests/test_compare*.py` |
| Market News (flag) | `frontend/src/pages/MarketNews.tsx` | `backend/src/macro/` | `backend/tests/test_macro*.py` |
| Whale Watching | `frontend/src/pages/WhaleWatching.tsx` | `backend/src/utils/whale_watching.py` | `backend/tests/test_whale*.py` |
| Watchlist | `frontend/src/pages/Watchlist.tsx` | `WatchlistRepository` | `backend/tests/test_run_daily_watchlist.py` |
| Learning Centre, quizzes, XP, badges | `frontend/src/pages/Learning.tsx` | `learning_*` tables | `frontend/src/components/learning/*.test.ts` |
| Financial Tools | `frontend/src/pages/FinancialTools.tsx` | (client-side maths) | `frontend/src/utils/compoundInterest.test.ts`, `tfsaPlanner.test.ts` |
| Ask AlphaSwarm | `frontend/src/pages/Ask.tsx` | `backend/src/api.py` (`/api/ask`) | `backend/tests/test_ask*.py` |
| Admin: users, reports, learning content, funds | `frontend/src/pages/Admin*.tsx` | `backend/src/api.py:6672-7233`, `backend/src/funds/admin_routes.py` | `backend/tests/test_funds_admin_routes.py` |

## 7. User interface

- **One design system.** Colour, type and spacing tokens are defined once in
  `frontend/src/index.css`, with shared platform classes (`.as-card`, `.as-inset`, `.as-tabs`,
  `.as-btn-*`, `.as-select`) from line 245 onwards. Every page uses the same tokens and components.
- **A fixed type scale** (12/14/16/20/24/32/40px) and sentence-case labels across all pages.
- **Explanation built into the layout.** Each analytic output follows the same pattern: the plain
  answer first, then the evidence, then how it was worked out. AI-written text always sits in the
  same marked box, with a note that it can be wrong. The methodology dialog
  (`frontend/src/components/howItWorks/MethodologyDialog.tsx`) explains each score with worked
  visuals.
- **Responsive.** On phones, tab rows become pill grids, wide tables become stacked rows, and the
  Ask panel becomes a full-screen sheet sized above the keyboard.
- **Accessibility.** Native form controls are kept where they help (mobile pickers, keyboard
  access), with about 670 `aria-` attributes across the components and pages.

## 8. Ease of navigation

- **One source of truth for navigation.** `frontend/src/data/appNavigation.ts` defines every entry
  and its group:
  - Explore: Stocks, Funds, Market News, Whale Watching.
  - Your tools: Watchlist, Compare, Financial Tools.
  - Learn: Learning.
  - Pinned at the foot: Ask AlphaSwarm and Settings.

  `groupNavigation` (`:33`) builds the sidebar and the phone menu from the same list
  (`frontend/src/components/layout/AppLayout.tsx:59`). Entries for features that are switched off
  are hidden automatically.
- **A welcome tour** (`frontend/src/components/onboarding/UserSpotlightTour.tsx`) walks new users
  through the sidebar in the same order.
- **Every page has the same help.** An "About this page" dialog
  (`frontend/src/components/guidance/`) and a "Learn as you explore" book button list the lessons
  for that page.
- **Consistent wayfinding.** Detail pages have a back link to the list they came from. The stock
  page's tabs keep the URL, and the news and social evidence pages are reachable directly by URL.

## 9. APIs

*Appropriateness; scalability, cost, maintainability, security; how they are called; fallbacks.*

| API | Used for | Called from | Limits and cost control | When it fails |
|---|---|---|---|---|
| Groq | Reasoning traces, summaries, Ask | `backend/src/utils/llm_client.py:22-92` | Separate keys per feature, so one feature can't use up another's rate limit; per-reader daily caps | Missing key returns no client, and callers use a template built from the same facts (`langgraph_orchestrator.py:172-180`) |
| Finnhub | Company news, insider dealings, market news | `backend/src/utils/ss_news.py:52`, `ww_sources.py:198` | Process-wide rate limiter (`ss_base.py:15`); 48-hour Postgres cache | Serves the cache; a refused call is retried once, then the pass stops |
| Marketaux | Extra news from top-tier outlets | `backend/src/utils/ss_news.py:217` | Nightly batch only; page cap; cached | Blank key leaves Finnhub on its own |
| Google Cloud NL | Second sentiment signal | `backend/src/agents/gcp_nlp.py` | Monthly budget ledger in Postgres; only the top posts are scored | Retries on 429/5xx; falls back to VADER alone |
| StockTwits | Social posts | `backend/src/utils/ss_social.py:65` | Minimum interval between calls; page caps; time budget | The walk ends early and the run continues |
| yfinance | Prices, history, currency rates, 13F holdings | `backend/src/agents/quant_analyst.py`, `supabase_client.py:167-223` | Currency rates cached 15 minutes, price windows 12 hours, holdings 7 days | Price shown in its own currency if no rate; stale cache served |
| Gemini (Vertex AI) | Reading uploaded fact sheets | `backend/src/funds/reading.py:571` | No API key (service account); 10 per reader a day; same PDF never read twice | Three retries with backoff; a friendly error to the reader |
| Jev (OpenRouter) | Tagging market news to sectors | `backend/src/macro/jev_client.py:61` | Limited concurrency; cost logged per pull | Stories are stored untagged and retried next pull |
| SerpApi | Educational answers in Ask | `backend/src/utils/educational_retrieval.py:985` | Local reference cache first; allowlisted domains | An honest "not covered" answer |

**The backend's own API** is FastAPI (`backend/src/api.py:53`) with generated OpenAPI docs at `/docs`.
Feature routers are mounted under their own prefixes (`/api/fund-catalogue`, `/api/fund-uploads`,
`/api/compare`, `/api/macro`).

**How the frontend calls it:**
- Typed service modules in `frontend/src/services/api/` build each URL from `VITE_API_BASE`, e.g.
  `analysis.ts:9`.
- Each call sends the user's Supabase access token as a bearer header.

## 10. Integration, scalability, maintainability and separation of concerns

- **The agents are integrated through one typed graph.**
  - `AnalysisState(TypedDict)` (`backend/src/orchestration/langgraph_orchestrator.py:423`) is the
    shared state, and each phase returns only the keys it changes.
  - The graph (`:1225-1245`) runs initialise, then the quant and sentiment phases **in parallel**,
    then synthesis, then output.
  - The gathering phases degrade rather than fail, so one missing source thins a run instead of
    stopping it.
- **LLM calls are spread across accounts.** `ReasoningTracePool` (`:332`) runs them in parallel
  lanes across several Groq accounts.
- **One batch, many users.** `run_daily_batch` (`:1336`) gathers signals once for the union of all
  users' tickers, then personalises per user, with each user's failure isolated. Cloud Scheduler runs
  it, along with four other jobs (README, "Deployment").
- **Features are isolated.** Funds, uploads, Compare and Market News are only imported and mounted
  when their flag is on (`backend/src/api.py:188-251`). Tests enforce the isolation
  (`backend/tests/test_funds_isolation.py`, `test_funds_upload_isolation.py`).
- **Built for Cloud Run.**
  - Heavy modules load lazily, so the container starts quickly.
  - Shared state that must survive across instances lives in Postgres: the run lock, the NLP budget,
    the upload counts and the caches.
  - At startup, runs left half-finished by a crashed container are marked failed.
- **Each AI feature is split into the same layers:** evidence → guard → prompt builder → template →
  generator → repository → service (`backend/src/compare/trace.py`, `backend/src/quant/trace.py`).
  Changing a prompt never touches storage, and changing storage never touches a prompt.
- **Pure logic is kept apart from I/O.** `ranking.py` has no database, network or LLM access, and
  `MarketDataSource` (`quant_analyst.py:360`) is the only part of the quant module that touches the
  network.

## 11. Sophistication and complexity

- **A multi-agent pipeline with parallel phases.** Sentiment, quant and discovery agents feed a
  four-factor **Signal Scorecard**: signal strength × agreement between sentiment and quant × data
  sufficiency × fit with the user's profile (`backend/src/orchestration/ranking.py`). Each factor is
  disclosed to the user.
- **Sentiment from several sources.** News is weighted by source reliability tier and recency.
  Social posts are scored by VADER and GCP and blended. Both are kept as day-by-day history with
  generated day summaries.
- **An asset-discovery agent** finds new stocks for each user's investment universes. Candidates go
  through sources, then validation gates, then classifiers (`backend/src/agents/asset_discovery.py`).
- **AI text that is checked against its own evidence** before display (§5), with a deterministic
  fallback. This is how the platform explains outputs with AI without presenting unverified figures.
- **Fact-sheet reading with a human in the loop** (`backend/src/funds/reading.py:1-27`):
  1. Gemini transcribes the PDF to a schema.
  2. Every quoted line is checked against the PDF's own text (`quote_found`, `:315`).
  3. Each field is sorted into confirmed, check or missing, and nothing is saved until a person has
     resolved every flagged field.
- **Market news tagged by a decision model.** Jev tags each story to investment universes, and
  per-sector AI overviews are generated from the tagged stories (`backend/src/macro/`).
- **Rand pricing throughout.** US prices and history are converted at the day's rate, and the rate
  is stated wherever a converted figure appears.

## 12. Overall evidence of effort

- **History:** 525 commits and 69 merged pull requests since 28 April 2026, from all four members
  (`git shortlog -sn --no-merges`).
- **Tests:** 3,000 backend tests across 69 files and 1,222 frontend tests across 80 files.
- **Schema:** 44 migration files, numbered 001–039, each with a header explaining its reasoning.
- **Documentation in the code:** module docstrings explain why, not only what.
  `backend/.env.example` documents every setting with its cost and failure mode.
- **Iteration on feedback:** see the next section.

---

## Changes since the Iteration 2 code review

| Point raised | What changed | Where |
|---|---|---|
| Use more explicit OOP (inheritance, not only composition) | The pipeline, ranking, indicators, discovery, sources and data access were rebuilt as class hierarchies | §4; PR #38 |
| Hard-coded API URLs | None remain. The frontend builds every URL from `VITE_API_BASE`; the backend reads every host and key from the environment | `frontend/src/services/api/*.ts`, `backend/.env.example` |
| Hard-coded values such as XP settings | XP per difficulty level is read from the `learning_difficulty_xp` table, so an admin can change it without a deploy. Thresholds and weights are environment settings with documented defaults | `frontend/src/services/supabase/learningService.ts:155-176` |
| Clarify the server-side / client-side split | The server holds every secret and third-party key, runs the agents and every LLM call, and writes past row level security with the service role. The client holds only the anon key, renders, and calls the API with the user's token | §2, §5 |
| Explain the security measures | §5 of this guide lists each control with its location | §5 |
| How AI influences accuracy | AI output is checked against its evidence before display, falls back to deterministic text, and never selects funds or makes recommendations | §5, §11 |

## Known trade-offs

These limits are deliberate or known, each with the reason it stands.


- **The frontend is mostly function components.** That is idiomatic React 19. Classes are used for
  services and repositories where they add value (§4).
- **Some free data sources are unofficial.** yfinance and StockTwits have no service agreement. Every
  call is cached and degrades to the last good copy, and the code is written so that a licensed
  feed can replace either source behind the same interface.
- **Some limits are kept per container.** The Ask rate limit and the Compare daily cap are held in
  memory, so with several containers the effective limit is higher. The upload limit, which
  protects a paid service, is counted in the database instead.
- **The base tables predate the migrations folder.** The migrations hold every change made since
  then (README, "Apply the Migrations").
