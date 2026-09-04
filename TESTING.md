# Testing

Automated unit tests covering the scoring and ranking core, and the funds
catalogue. **1056 backend tests and 104 frontend tests**, both suites run in a
few seconds combined, and neither touches the network, the database, or an LLM.

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

## What is covered

| Suite | Module | Tests |
|---|---|---|
| `backend/tests/test_ranking.py` | `src/orchestration/ranking.py` | 102 |
| `backend/tests/test_quant_analyst.py` | `src/agents/quant_analyst.py` | 106 |
| `backend/tests/test_ss_aggregation.py` | `src/utils/ss_aggregation.py` | 49 |
| `backend/tests/test_funds_repository.py` | `src/funds/repository.py`, `validators.py` | 123 |
| `backend/tests/test_funds_risk_scale.py` | `src/funds/risk_scale.py` | 59 |
| `backend/tests/test_funds_copy.py` | `src/funds/copy.py` | 50 |
| `backend/tests/test_funds_matcher.py` | `src/funds/matcher.py` | 37 |
| `backend/tests/test_funds_explain.py` | `src/funds/explain.py` | 32 |
| `backend/tests/test_funds_routes.py` | `src/funds/routes.py`, `service.py` | 29 |
| `backend/tests/test_api_search_guard.py` | asset-search exchange guard | 28 |
| `backend/tests/test_funds_asisa.py` | `src/funds/asisa.py` | 24 |
| `backend/tests/test_funds_isolation.py` | funds stay out of the pipeline | 9 |
| `backend/tests/test_funds_config.py` | `src/funds/config.py` | 7 |
| `frontend/src/utils/scoringEngine.test.ts` | onboarding psychometrics | 31 |
| `frontend/src/utils/validation.test.ts` | email + password rules | 24 |
| `frontend/src/utils/staleness.test.ts` | nightly-run staleness | 20 |
| `frontend/src/utils/stringFormatters.test.ts` | display formatting | 18 |
| `frontend/src/utils/discovery.test.ts` | discovery provenance copy | 11 |

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
