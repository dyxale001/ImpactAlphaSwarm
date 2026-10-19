# Testing

Automated unit tests covering the scoring and ranking core, the Ask AlphaSwarm
guards, the funds catalogue and the frontend calculations. The suite is split
into **tiers** (below) so that the part which gates a merge is small and fast,
and the part which needs a real database is named rather than hidden.

Counts as collected on `main` at `258c72d` (2026-09-14); parametrised cases
counted individually, which is what `pytest` and `vitest` report:

| Tier | Backend | Frontend | Runs |
|---|---|---|---|
| smoke | 47 in 40 files (one test each) | 127 in 11 files | every push to any branch |
| core | 431 in 12 files | 129 in 5 files | every pull request (`.github/workflows/tests.yml`) |
| full, offline | 1,562 in 40 files (core included) | 506 in 27 files | every push to `main`, and nightly |
| live | 318 in 7 files | — | locally only, needs `backend/.env` |
| everything | 1,880 in 47 files | 506 in 27 files | |

Counted as `def test_` functions instead, the backend is 1,588 tests, of which
345 are core and 40 are smoke. Say which basis you are using when you quote a number.

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
(the only per-test marker in the suite; a file's smoke pick is named in the marker's
comment). Frontend: one small file per feature area, listed in
`frontend/vitest.smoke.config.ts` — dashboard widgets, onboarding tour and questionnaire,
learning roadmap, badges, research sentiment, funds, discovery, profile history, loading
screen, settings. Frontend files are table-driven, so this tier ends up about the size of
the frontend core; it is different content, not less of it. Smoke answers "does every
feature still do its one obvious thing"; it does not answer "are the numbers right" — that
is core.

**core** — a test is core when its failure means a user sees a wrong number, a
wrong recommendation, or a guard that did not fire. Money-path maths, ranking,
personalisation and the LLM guards. Deliberately *not* core: the orchestration
phase plumbing and the risk-scale label normaliser (`test_orchestration.py`,
`test_funds_risk_scale.py`) — structural and wording tests whose user-facing
consequence, no fund above its ceiling, is asserted in the matcher file. Marked file-by-file with
`pytestmark = pytest.mark.core` (backend) and listed in
`frontend/vitest.core.config.ts` (frontend). Runs in under twenty seconds.

| Purpose | Backend file(s) | Frontend file(s) |
|---|---|---|
| Quant indicator maths, universe scoring | `test_quant_analyst.py` | `scoringEngine.test.ts` |
| Ranking terms, profile fit, stability, convergence | `test_ranking.py` | |
| Sentiment aggregation and blending; GCP scoring; NLP budget | `test_ss_aggregation.py`, `test_scoring.py`, `test_nlp_budget.py` | |
| Reasoning-trace style by expertise level | `test_gr_reasoningtracestyle.py` | `learningRoadmap.test.ts` |
| Rand prices | `test_zar_prices.py`, `test_funds_prices.py` | |
| Fund matching to the risk profile (incl. the bracket ceiling); funds isolated behind the flag | `test_funds_matcher.py`, `test_funds_isolation.py` | `tfsaPlanner.test.ts`, `compoundInterest.test.ts` |
| Ask AlphaSwarm output validator; API search guard | `test_ask_output_validator.py`, `test_api_search_guard.py` | `validation.test.ts` |

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

Adding a test: put it in the file that owns the module. It inherits the file's
tier (core / live are per file). Promote a whole file to core only when it meets
the rule above, and say why in the commit message. The only per-test marker is
`smoke`: one per file, the plainest happy path; if you add a new test file, pick
its smoke test in the same commit, and if you rename a smoke test keep the marker
on it.

Known state on `main` at `258c72d`: one offline test fails,
`test_fund_seed_loader.py::TestTheSeedIsWellFormed::test_every_fact_sheet_has_a_manager_url_and_a_date`
(a fact sheet in the seed has an empty manager URL). It is data, not code, and
it is not core.

## What is covered

| Suite | Module | Tests |
|---|---|---|
| `backend/tests/test_funds_repository.py` | `src/funds/repository.py`, `validators.py` | 132 |
| `backend/tests/test_quant_analyst.py` | `src/agents/quant_analyst.py` | 106 |
| `backend/tests/test_asset_discovery.py` | `src/agents/asset_discovery.py` | 106 |
| `backend/tests/test_ranking.py` | `src/orchestration/ranking.py` | 102 |
| `backend/tests/test_funds_risk_scale.py` | `src/funds/risk_scale.py` | 72 |
| `backend/tests/test_supabase_repositories.py` | `src/utils/supabase_client.py` | 66 |
| `backend/tests/test_funds_copy.py` | `src/funds/copy.py` | 50 |
| `backend/tests/test_ss_aggregation.py` | `src/utils/ss_aggregation.py` | 49 |
| `backend/tests/test_funds_routes.py` | `src/funds/routes.py`, `service.py` | 45 |
| `backend/tests/test_funds_common_core.py` | migration 025's snapshot columns | 41 |
| `backend/tests/test_funds_matcher.py` | `src/funds/matcher.py` | 37 |
| `backend/tests/test_funds_admin_routes.py` | `src/funds/admin_routes.py` | 36 |
| `backend/tests/test_funds_explain.py` | `src/funds/explain.py` | 32 |
| `backend/tests/test_fund_seed_loader.py` | `scripts/load_fund_seed.py` | 29 |
| `backend/tests/test_api_search_guard.py` | asset-search exchange guard | 28 |
| `backend/tests/test_funds_documents.py` | `src/funds/documents.py` — the fetch allowlist | 26 |
| `backend/tests/test_funds_asisa.py` | `src/funds/asisa.py` | 26 |
| `backend/tests/test_funds_text_archive.py` | archiving a sheet's text (migration 026) | 24 |
| `backend/tests/test_funds_isolation.py` | funds stay out of the pipeline | 9 |
| `backend/tests/test_funds_config.py` | `src/funds/config.py` | 7 |
| `frontend/src/utils/fundsCopy.test.ts` | funds copy + forbidden-term scan | 35 |
| `frontend/src/utils/validation.test.ts` | email + password rules | 32 |
| `frontend/src/utils/scoringEngine.test.ts` | onboarding psychometrics | 31 |
| `frontend/src/utils/goals.test.ts` | onboarding goals + horizon | 28 |
| `frontend/src/utils/staleness.test.ts` | nightly-run staleness | 20 |
| `frontend/src/utils/stringFormatters.test.ts` | display formatting | 18 |
| `frontend/src/utils/fundsCommonCore.test.ts` | common-core field display | 17 |
| `frontend/src/utils/discovery.test.ts` | discovery provenance copy | 11 |
| `frontend/src/utils/profileHistory.test.ts` | archiving previous survey answers | 10 |

Suites under ten tests are omitted; the totals above are the full run.

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
