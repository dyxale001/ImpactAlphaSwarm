# Testing

Automated unit tests covering the scoring and ranking core, the Ask AlphaSwarm
guards, the funds catalogue and the frontend calculations. The suite is split
into **tiers** (below) so that the part which gates a merge is small and fast,
and the part which needs a real database is named rather than hidden.

Counts as collected on `chore/test-tiers-iteration4` (the UI audit branch at
`6426289` plus the tiers, 2026-10-19); parametrised cases counted individually,
which is what `pytest` and `vitest` report:

| Tier | Backend | Frontend | Runs |
|---|---|---|---|
| smoke | 70 in 62 files (one test each) | 187 in 19 files | every push to any branch |
| core | 397 in 28 files (marked per test) | 235 in 12 files | every pull request (`.github/workflows/tests.yml`) |
| full, offline | 2,682 in 62 files (core included) | 1,219 in 79 files | every push to `main`, and nightly |
| live | 318 in 7 files | — | locally only, needs `backend/.env` |
| everything | 3,000 in 69 files | 1,219 in 79 files | |

Counted as `def test_` functions instead, the backend is 2,283 tests, of which
333 are core and 62 are smoke. Say which basis you are using when you quote a number.

## Running them

**Backend** (from `backend/`):

```bash
source venv/bin/activate
pip install -r requirements-dev.txt   # first time only
pytest
```

**Frontend** (from `frontend/`):

```bash
npm test          # single run
npm run test:watch
```

## Tiers

**smoke** — a thin slice through *every* feature, in seconds. Backend: exactly **one**
happy-path test in each offline test file, marked `@pytest.mark.smoke` on the test itself
(a file's smoke pick is named in the marker's comment). Frontend: one small file per
feature area, listed in `frontend/vitest.smoke.config.ts`: dashboard widgets, setup guide,
onboarding questionnaire, learning roadmap, badges, research sentiment, funds, discovery,
profile history, loading screen, settings, Compare, Market News, the spotlight tour,
analysis notifications, purchasing power, the Settings risk card, account status and the
lesson video. Fact-sheet uploads have no frontend smoke file, because their only frontend
file holds 169 cases; their six backend smoke tests cover them. Smoke answers "does every
feature still do its one obvious thing"; it does not answer "are the numbers right" — that
is core.

**core** — a test is core when its failure means a user sees a wrong number, a
wrong recommendation, or a guard that did not fire. The tier is balanced **per feature**:
every feature puts in the tests that assert its deciding rule, and the rest of its tests
stay in full. Backend core is therefore marked per class or per test with
`@pytest.mark.core`, or with a module-level `pytestmark = pytest.mark.core` where the
whole file is the rule. Frontend core is listed file by file in
`frontend/vitest.core.config.ts`, because Vitest selects files. The frontend core runs in
a few seconds. The backend core takes about 40 s, and about 30 s of that is one test,
`test_funds_isolation.py`'s AST scan of `src/api.py`. The scan calls
`ast.get_source_segment` once per `if`, re-splitting the whole file each time, so it gets
slower as `api.py` grows; it is also the file's smoke pick. Making it fast is a change to
the test body, so it is left for its own commit.

Core per feature, backend and frontend together (cases on 2026-10-19):

| Feature | Core tests | Cases |
|---|---|---|
| Quant analysis, ranking, rand prices, Quant trace | `TestScoreUniverse`; `TestRankTerms`, `TestProfileFit`; `test_zar_prices.py`; the Quant trace `TestGuard` | 67 |
| Sentiment | `TestAggregateSigned`, `TestBlendSentiment`; `test_scoring.py`, `test_nlp_budget.py`, `test_sentiment_card_truth.py` | 55 |
| Whale watching | `test_insider_window.py`, `test_whale_display_truth.py`; the insider and institutional summary guards; `whaleFormat.test.ts` | 43 |
| Market News | the tagging rule, the overview guard and tip filtering in `test_macro_news.py`; `macroNews.test.ts` | 30 |
| Investment Comparison | the stock comparison `TestGuard`; the fund comparison `TestPlacing`; `compareFunds.test.ts` | 47 |
| Fact-sheet uploads | the flagged-value, review-token, saved and refused classes of `test_funds_upload_service.py`; reader-to-reader privacy and catalogue isolation; the reader's `TestReview` | 50 |
| Funds catalogue and matching | six matcher classes (worked cases, the ceiling, bracket lowering, eligibility, trackers, missing answers); `test_funds_isolation.py`; rand cents and unlisted prices; the fund trace `TestPlacing` | 42 |
| Discovery and reasoning-trace style | `TestClassificationChain`, `TestUniverses`; `test_gr_reasoningtracestyle.py` | 20 |
| Ask AlphaSwarm | `test_ask_output_validator.py` | 49 |
| Accounts, sign-in and access | the access rules in `test_account_status.py`; the US-listing `TestTheFilter`; `validation.test.ts` | 58 |
| Admin console | `test_non_admin_is_rejected` | 7 |
| Onboarding, investor profile and Settings | `scoringEngine.test.ts`, `riskProfileReasoning.test.ts` | 51 |
| Spotlight tour | `spotlightTourService.test.ts` (eligibility, failing closed) | 11 |
| Dashboard and run status | `staleness.test.ts` | 20 |
| Financial tools | `tfsaPlanner.test.ts`, `purchasingPower.test.ts` | 57 |
| Learning Centre | `learningRoadmap.test.ts`, `learningExpertise.test.ts` | 25 |

Deliberately left in full: indicator micro-tests, convergence and the stability pass,
the rest of each guard file (prompts, templates, services, caching), the Ask routing
evaluation, the upload structural scans, `compoundInterest.test.ts`, `fundsCopy.test.ts`,
`fundUploads.test.ts`, `compareStocks.test.ts`, and the fetching, scheduling and seeding
files. They run on every push to `main` and nightly; they just do not gate a pull request.

**full** — everything else that runs offline: the characterisation tests that
pinned the September OOP refactor (see the design notes in the knowledge base),
sentiment ingestion, funds data model and routes, repositories, parsers, copy.
Selected as `-m "not live"`.

**live** — the seven `test_ask_*` request-level files. They call
`api.ask_alphaswarm()` end to end, and `_resolve_asset()` in `src/api.py` reads
the real `assets` table through the Supabase client, so they pass only with a
real `SUPABASE_URL` in `backend/.env` (the `conftest.py` placeholders point at
`localhost:54321`, which refuses the connection). Their docstrings say "no live
Supabase calls"; that is not currently true, and until the asset lookup is
faked they cannot run in CI. Marked `pytestmark = pytest.mark.live`.

What a live run reaches, besides the read-only `assets`, `ai_runs`, `learning_articles`
and funds tables:
- No test writes to the database. The `ask_query_logs` insert is faked everywhere.
- About fifteen tests make real Groq calls, and a few make real SerpApi calls (a
  quota-limited key). This is because `_get_ask_intent_client` and
  `_get_ask_narration_client` are not faked in every test. Faking both, and unsetting
  `SERPAPI_API_KEY`, in an autouse fixture would stop that.

Result on 2026-10-19: 317 of 318. `test_ask_learning.py::test_unrelated_token_does_not_get_a_fabricated_typo_match`
fails because the live `assets` table now holds ABCL, the only ticker one edit from
"ABCD", so the unique one-edit typo rule resolves it. The data moved under the test, not the code.

```bash
# backend, from backend/
pytest -m smoke                      # every feature once, seconds
pytest -m core                       # the merge gate
pytest -m "not live"                 # the offline full tier (what CI runs on main / nightly)
pytest -m live                       # needs backend/.env
pytest                               # everything

# frontend, from frontend/
npm run test:smoke
npm run test:core
npm run test:full                    # same as npm test
```

Adding a test: put it in the file that owns the module. It is full unless it asserts
its feature's deciding rule, in which case mark it (or its class) `@pytest.mark.core`
and say why in the commit message; keep each feature's core to its deciding rule, not
its whole file. `live` stays per file. Every test file has exactly one `smoke` test, the
plainest happy path: if you add a new test file, pick its smoke test in the same commit,
and if you rename a smoke test keep the marker on it.

Known state on 2026-10-19: every offline test passes (2,682 of 2,682; the seed
manager-URL failure noted at `258c72d` no longer occurs).
`test_funds_admin_routes.py::TestTheStalenessOrdering::test_the_oldest_sheet_comes_first_and_no_sheet_beats_it`
used to date its "current" sheet `2026-09-01`, so it failed from 2026-10-16 when that
sheet aged past the 45-day threshold. It now uses a date relative to today. The route
under test reads the real clock, so any fixture it judges for freshness must too.

## What is covered

| Suite | Module | Cases |
|---|---|---|
| `backend/tests/test_ask_routing_eval.py` | Ask routing and resolution, frozen offline eval (`src/api.py`) | 223 |
| `backend/tests/test_funds_upload_isolation.py` | uploaded funds stay private and out of the catalogue | 205 |
| `backend/tests/test_asset_discovery.py` | `src/agents/asset_discovery.py` | 176 |
| `backend/tests/test_funds_repository.py` | `src/funds/repository.py`, `validators.py` | 132 |
| `backend/tests/test_quant_analyst.py` | `src/agents/quant_analyst.py` | 106 |
| `backend/tests/test_funds_risk_scale.py` | `src/funds/risk_scale.py` | 105 |
| `backend/tests/test_ranking.py` | `src/orchestration/ranking.py` | 102 |
| `backend/tests/test_compare_trace.py` | `src/compare/trace.py` | 86 |
| `backend/tests/test_supabase_repositories.py` | `src/utils/supabase_client.py` | 75 |
| `backend/tests/test_quant_trace.py` | `src/quant/trace.py` | 62 |
| `backend/tests/test_funds_admin_routes.py` | `src/funds/admin_routes.py` | 55 |
| `backend/tests/test_orchestration.py` | `src/orchestration/langgraph_orchestrator.py` | 54 |
| `backend/tests/test_funds_copy.py` | `src/funds/copy.py` | 51 |
| `backend/tests/test_funds_upload_service.py` | `src/funds/upload_service.py`, `upload_routes.py` | 50 |
| `backend/tests/test_macro_news.py` | `src/macro/` | 50 |
| `backend/tests/test_ask_output_validator.py` | `src/utils/ask_output_validator.py` | 49 |
| `backend/tests/test_ss_aggregation.py` | `src/utils/ss_aggregation.py` | 49 |
| `backend/tests/test_compare_funds_trace.py` | `src/compare/funds_trace.py` | 47 |
| `backend/tests/test_funds_routes.py` | `src/funds/routes.py`, `service.py` | 47 |
| `backend/tests/test_day_summary.py` | `src/utils/day_summary.py` | 46 |
| `backend/tests/test_funds_common_core.py` | migration 025's snapshot columns | 46 |
| `backend/tests/test_institutional_trace.py` | `src/utils/ww_trace.py` | 45 |
| `backend/tests/test_funds_matcher.py` | `src/funds/matcher.py` | 44 |
| `backend/tests/test_quant_history.py` | `src/quant/history.py` | 43 |
| `backend/tests/test_social_daily.py` | `src/utils/ss_daily.py` | 41 |
| `backend/tests/test_fund_trace.py` | `src/funds/trace.py` | 40 |
| `frontend/src/utils/fundUploads.test.ts` | fact-sheet upload review and save | 169 |
| `frontend/src/utils/fundsCopy.test.ts` | funds copy + forbidden-term scan | 56 |
| `frontend/src/services/supabase/learningService.test.ts` | Learning Centre data access | 37 |
| `frontend/src/utils/tfsaPlanner.test.ts` | TFSA planner | 34 |
| `frontend/src/utils/validation.test.ts` | email + password rules | 32 |
| `frontend/src/utils/scoringEngine.test.ts` | onboarding psychometrics | 31 |
| `frontend/src/utils/goals.test.ts` | onboarding goals + horizon | 31 |
| `frontend/src/components/guidance/AboutThisPage.test.ts` | per-page guidance | 28 |
| `frontend/src/utils/compareStocks.test.ts` | Compare page, stocks | 27 |
| `frontend/src/components/research/quantSeries.test.ts` | Quant tab chart series | 27 |
| `frontend/src/components/learning/ResourceViewerModal.test.ts` | learning resource viewer | 27 |
| `frontend/src/dashboard/layoutSchema.test.ts` | dashboard layout schema | 26 |
| `frontend/src/components/funds/fundTiles.test.ts` | funds grid tiles | 25 |
| `frontend/src/utils/learningBadgeMilestones.test.ts` | learning badges | 25 |
| `frontend/src/utils/purchasingPower.test.ts` | purchasing power | 23 |
| `frontend/src/utils/compoundInterest.test.ts` | compound interest calculator | 21 |
| `frontend/src/utils/staleness.test.ts` | nightly-run staleness | 20 |
| `frontend/src/utils/riskProfileReasoning.test.ts` | saved risk reasoning | 20 |

Cases as collected on 2026-10-19. Backend suites under 40 cases and frontend suites
under 20 are omitted; the tier table at the top has the full totals.

The target is the pure logic that decides what a user is shown and in what
order: the four ranking terms and their composition, the two-stage quant
percentile engine, the tier/recency sentiment blend, and the onboarding survey
that produces a user's risk tolerance. Components, pages and hooks are
deliberately out of scope — they are expensive to test and the risk in them is
lower.

The funds catalogue extends that scope in two places, for reasons specific to it.
Its **API routes** are tested (`test_funds_routes.py`) because the matching
rules, the fact-sheet data and the wording are only correct *together*: a route
returning the right funds in the wrong shape, or a reason sentence that lost its
disclaimer, is the failure that matters and no unit test sees it. The tests use
the real service over a fake Supabase client, so nothing reaches a network. Its
**database access** is tested (`test_funds_repository.py`) because a repository
that silently returns nothing looks exactly like a catalogue that is empty.

Two funds suites defend properties rather than behaviour, and are worth knowing
about before changing anything nearby. `test_funds_copy.py` scans every
user-facing string for wording that would turn information into financial
advice. `test_funds_isolation.py` fails if the nightly pipeline ever imports the
funds package — a fund has no social coverage, so the sentiment phase would hand
it a neutral score that convergence reads as conflict, and it would be demoted
rather than simply unscored.

## What the assertions mean

Three kinds, and the distinction matters when one goes red:

- **Invariants** — properties the design promises for any input: terms stay
  within their bounds, `profile_fit` only ever demotes, the stability pass never
  drops a candidate, a tier's influence does not depend on its article count. A
  failure here is a real defect.

- **Pinned values** — the arithmetic today's constants produce. A failure means a
  threshold moved. That is not automatically wrong, but it must be deliberate,
  because these numbers are the feed order users see. Update the expectation in
  the same commit that changes the constant.

- **Regression guards** — named for bugs this project has already paid for once.
  A negative beta must never be labelled "low" (observed live on DUK at −0.29);
  `risk_tolerance` must be compared against exactly one normalised spelling (six
  spellings once left personalisation silently dead for ~39% of profiles);
  `compute_raw_metrics` must use the shared SPY series rather than downloading
  the benchmark once per ticker; and `score_universe` must keep ranking low
  volatility as high stability — the two-stage engine that PR #16 silently
  reverted on main, which took three days and a manual code review to notice.

A handful of tests are marked `PINNED BEHAVIOUR` or `PINNED DEFECT`. Those record
what the code does today where it is arguably wrong, with the reasoning in a
comment. They are documentation, not endorsement — see the notes below.

## Determinism

Every env-tunable constant is pinned to its documented default in
`backend/tests/conftest.py` before the modules are imported. `ranking.py`,
`quant_analyst.py` and `ss_aggregation.py` all read their thresholds via
`os.getenv` at import time, and `langgraph_orchestrator` calls `load_dotenv()`,
so without that pinning a value added to `backend/.env` would shift every
expectation in the suite and the failures would look like real regressions.

If a default legitimately changes, update `conftest.py` and the failing
expectations will show exactly which behaviour moved.

## Known issues these tests document but do not fix

Each is pinned by a test with a comment explaining it. None is urgent; all are
behaviour changes that deserve their own commit.

1. `formatNumberWithSpaces(0)` returns `''`, because the guard is
   `if (!value)` and `0` is falsy. A genuine zero renders as a blank field.
2. `validatePassword` accepts special characters only from
   `!@#$%^&*(),.?":{}|<>` — hyphen, underscore, plus and the bracket family are
   rejected, which is a real source of signup friction.
3. `determinePsychometrics` returns `Conservative` when any answer is
   non-numeric, because `NaN` fails both band comparisons. It fails safe, but
   silently.
4. `_recency_weight` fails open at `1.0` for a `Z`-suffixed timestamp, since
   `datetime.fromisoformat` rejects `Z` before Python 3.11. The live path is safe
   because `created_at` is written with `datetime.isoformat()` (which emits
   `+00:00`), but a raw Supabase JSON timestamp wired in directly would silently
   disable recency decay.
5. `calculate_macd` labels an exactly-flat histogram `bearish_crossover`, since
   the test is `hist > 0`. Worth knowing before that string is shown to a user as
   an explanation.
