# Testing

Two tiers of automated tests guard the platform:

- **smoke**, a thin slice through every feature, run on every push;
- **core**, the deciding rule of every feature, run on every pull request.

| Tier | Backend | Frontend | Runs |
|---|---|---|---|
| smoke | 70 in 62 files (one test each) | 187 in 19 files | every push to any branch |
| core | 397 in 28 files | 235 in 12 files | every pull request |

Counts are as `pytest` and `vitest` report them, with parametrised cases counted
individually. Both tiers run offline: no test in them needs the database, an API key or
an LLM. The CI workflow is `.github/workflows/tests.yml`.

## Running them

**Backend** (from `backend/`):

```bash
source venv/bin/activate
pip install -r requirements-dev.txt   # first time only
pytest -m smoke                       # every feature once
pytest -m core                        # the merge gate
```

**Frontend** (from `frontend/`):

```bash
npm run test:smoke
npm run test:core
```

## Smoke

Smoke answers "does every feature still do its one obvious thing", in seconds.

- **Backend:** exactly **one** happy-path test in each of 62 test files, marked
  `@pytest.mark.smoke` on the test itself. The marker's comment names why that test
  was picked.
- **Frontend:** one small file per feature area, listed in
  `frontend/vitest.smoke.config.ts`. The areas are dashboard widgets, setup guide,
  onboarding questionnaire, learning roadmap, badges, research sentiment, funds,
  discovery, profile history, loading screen, settings, Compare, Market News, the
  spotlight tour, analysis notifications, purchasing power, the Settings risk card,
  account status and the lesson video. Fact-sheet uploads are covered by their six
  backend smoke tests.

Smoke does not answer "are the numbers right"; that is core.

## Core

A test is core when its failure means a user sees a wrong number, a wrong
recommendation, or a guard that did not fire. The tier is balanced **per feature**:
every feature contributes the tests that assert its deciding rule.

- **Backend:** marked per class or per test with `@pytest.mark.core`, or with a
  module-level `pytestmark = pytest.mark.core` where the whole file is the rule.
- **Frontend:** listed file by file in `frontend/vitest.core.config.ts`, because Vitest
  selects files.

The frontend core runs in a few seconds and the backend core in under a minute.

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

## Adding a test

Put it in the file that owns the module. If it asserts its feature's deciding rule,
mark it (or its class) `@pytest.mark.core` and say why in the commit message; keep
each feature's core to its deciding rule, not its whole file. A new backend test file
gets exactly one `smoke` test, the plainest happy path, picked in the same commit; if
you rename a smoke test, keep the marker on it.

## What the assertions mean

Three kinds, and the distinction matters when one goes red:

- **Invariants**: properties the design promises for any input. Ranking terms stay
  within their bounds, `profile_fit` only ever demotes, and a sentiment tier's
  influence does not depend on its article count. A failure here is a real defect.

- **Pinned values**: the arithmetic today's constants produce. A failure means a
  threshold moved. That is not automatically wrong, but it must be deliberate,
  because these numbers are the feed order users see. Update the expectation in
  the same commit that changes the constant.

- **Regression guards**: named for bugs this project has already fixed once.
  `score_universe` must keep ranking low volatility as high stability, and
  `risk_tolerance` must be compared against exactly one normalised spelling (six
  spellings once left personalisation silently off for about 39% of profiles).

## Determinism

Every env-tunable constant is pinned to its documented default in
`backend/tests/conftest.py` before the modules are imported. `ranking.py`,
`quant_analyst.py` and `ss_aggregation.py` all read their thresholds via
`os.getenv` at import time, and `langgraph_orchestrator` calls `load_dotenv()`,
so without that pinning a value added to `backend/.env` would shift every
expectation and the failures would look like real regressions.

If a default legitimately changes, update `conftest.py` and the failing
expectations will show exactly which behaviour moved.
