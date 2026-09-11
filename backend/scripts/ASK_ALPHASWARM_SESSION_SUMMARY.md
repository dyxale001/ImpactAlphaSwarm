# Ask AlphaSwarm — How It Works, and What Got Tested/Fixed

Branch: `ask-alphaswarm-page` (not merged to `main`). Backend: `backend/src/api.py` +
`backend/src/utils/educational_retrieval.py`. Nothing in this session has been
committed or pushed.

## 1. How the chatbot works

### Request pipeline (`ask_alphaswarm` → `_ask_alphaswarm_impl` in `api.py`)

Every question runs through deterministic (no-LLM) gates first, in this order,
before ever reaching the one LLM call that classifies intent:

1. **Personal-finance gate** (`_ASK_PERSONAL_FINANCE_PATTERN`) — catches Roth
   IRA/401(k)/TFSA/retirement-annuity/tax/portfolio-allocation questions framed
   around the user's own circumstances. Returns
   `_ASK_PERSONAL_FINANCE_BOUNDARY_MESSAGE`, refuses to give personalised advice.
2. **Advice blocklist** (`_ask_blocklist_hit`) — literal phrase match ("should i
   buy", "will it go up", etc.). Returns `_ASK_NO_ADVICE_MESSAGE`.
3. **Out-of-scope gate** (`_ASK_OUT_OF_SCOPE_PATTERN`) — banking/consumer topics
   unrelated to markets (checking accounts, mortgage rates). Returns
   `_ASK_OUT_OF_SCOPE_MESSAGE`.
4. **Conversational reference resolution** — rewrites "its RSI"/"what about
   that" using frontend-supplied context (`active_asset`, `compare_assets`,
   `recent_metric`), or asks for clarification if genuinely ambiguous.
5. **Multi-intent decomposition** — deterministically splits compound questions
   ("what is an ETF and what is GOOGL's RSI") without an LLM.
6. **Asset-specific metric shortcut** — "what is GOOGL's beta?" resolved
   directly against AlphaSwarm's own stored analysis data.
7. **Intent classification** — the **one** Groq call in the normal path,
   classifying into `ASSET_SEARCH`, `USER_DATA_SEARCH`, `ANALYSIS_EXPLANATION`,
   `CONTEXT_SYNTHESIS`, `LEARNING_QUESTION`, `PLATFORM_QUESTION`,
   `UNSUPPORTED_FINANCIAL_ADVICE`, or `UNKNOWN` (8 intents, not "5" — a
   figure quoted at one point this session that didn't match the code).
8. **Retrieval + narration** per intent, with at most **1 repair call** on
   validation failure (2 Groq calls total, never a 3rd).

### `LEARNING_QUESTION` retrieval hierarchy (`_ask_learning_question`)

Checked in order, each step only reached if the previous one had nothing:

1. **`_ASK_GLOSSARY`** — pure in-memory dict of terms AlphaSwarm itself
   computes (beta, RSI, MACD, Sharpe, whale watching, Signal Scorecard
   factors, ...). No network call.
2. **Learning Centre** (`_ask_learning_centre_lookup`) — queries Supabase's
   real `learning_articles` table (11 real articles — see below), matched by
   distinctive-word overlap with a title-match tiebreak.
3. **Broad beginner overview** — "I don't understand investing, where do I
   start?" pulls a curated multi-source overview instead of one glossary hit.
4. **Local reference cache** (`educational_retrieval._LOCAL_REFERENCE_CACHE`)
   — ~46 hand-verified entries, each independently fetched and confirmed live
   this session, from: CFPB, Investor.gov/SEC, SARB, FSCA, FCA (UK), SARS,
   OCC, Cboe, futuresfundamentals.org (CME), OpenStax.
5. **Acronym clarification** — an unresolved 2–5 letter acronym (e.g. "RSA",
   "TER") gets "what does X refer to in this context?" instead of a guess.
6. **Live search** (SerpApi, `SERPAPI_API_KEY`) — only as a last resort for
   terms the cache has nothing on, domain-restricted to the same approved
   list, cache-checked-first so the free-tier quota isn't spent on terms
   already answered locally.
7. **Honest "not covered"** — never fabricated.

### `PLATFORM_QUESTION` (how AlphaSwarm itself works)

Keyword-dispatched (`_platform_question_answer`) to one of: ranking formula,
description provenance (yfinance, not AI-generated — commit `2682294`),
live-retrieval status (reads `SERPAPI_API_KEY` at answer time), data sources
(yfinance/Finnhub/StockTwits/Groq), AI model, or "not a broker" — falling back
to the ranking-formula text only if nothing more specific matches.

## 2. Bugs found and fixed this session

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | "What is RSA?" confidently answered "a security company" | Live web search ran *before* the acronym-clarification check | Reordered: local cache → acronym gate → live search |
| 2 | Every `PLATFORM_QUESTION` returned the same ranking-formula paragraph | Single hardcoded string, question text never read | Keyword-routed dispatch to 6 distinct answers |
| 3 | "Which fund should I put my TFSA into?" got the generic advice refusal | Blocklist ("should i put") ran before the personal-finance gate | Reordered gate priority; added `tfsa`, `retirement annuity`, possessive `my tax`/`my portfolio allocation` keywords |
| 4 | "How does a DCF work?" matched an unrelated Learning Centre article | `len(w) > 3` filter silently dropped 3-letter acronyms (DCF) from scoring | Lowered cutoff to `>= 3`, expanded stopword list |
| 5 | "What is risk?"/"What is a portfolio?" matched the wrong article despite real dedicated articles existing ("Risk vs Reward", "Asset Allocation and Portfolio Construction") | First-match tie-break ignored which article's *title* actually named the term | Added a title-match tiebreak |
| 6 | "Can AlphaSwarm place a trade for me?" got the ranking formula | No dispatch entry existed for trading/brokerage questions | Added `_PLATFORM_NOT_A_BROKER` |

All verified via direct function calls and the real end-to-end pipeline
(mocked auth/rate-limit only — real Groq, real Supabase, real SerpApi).

## 3. Test suite — `backend/scripts/ask_scope_coverage.py`

A 60-case live test suite (real Groq + real Supabase + real SerpApi, no
mocking of the logic under test), covering 12 scope categories plus
cross-cutting boundary checks, run via
`cd backend && ./venv/Scripts/python.exe scripts/ask_scope_coverage.py`.
Full raw output: `backend/scripts/ask_scope_coverage_report.txt`.

### Final result: **60/60 (100%) — PASS**

| Category | Positive | Negative | Boundary | Overall |
|---|---|---|---|---|
| 1. Platform overview | 4/4 | 1/1 | – | 5/5 |
| 2. Signal Scorecard | 5/5 | 1/1 | – | 6/6 |
| 3. Quant analysis | 5/5 | 1/1 | 1/1 | 7/7 |
| 4. Sentiment analysis | 3/3 | 1/1 | – | 4/4 |
| 5. Whale Watching | 3/3 | 1/1 | – | 4/4 |
| 6. Asset discovery | 3/3 | – | – | 3/3 |
| 7. Dashboard/ranked assets | 3/3 | 1/1 | – | 4/4 |
| 8. Onboarding/investor profile | 2/2 | 1/1 | – | 3/3 |
| 9. Asset Library/watchlist | 3/3 | – | – | 3/3 |
| 10. Learning Centre | 4/4 | 1/1 | – | 5/5 |
| 11. Funds section | 3/3 | 1/1 | – | 4/4 |
| 12. Methodology | 4/4 | 1/1 | – | 5/5 |
| cross-cutting | 1/1 | 6/6 | – | 7/7 |
| **TOTAL** | **43/43** | **16/16** | **1/1** | **60/60** |

**Score progression across fixes:** 50/60 → 53/60 → 57/60 → **60/60**. Each
step closed a real product bug — no test criteria were loosened to force a
pass; every "failure" that turned out to be a scoring bug in the harness
itself (4 cases: apostrophe-encoding mismatch, missing clarification-phrase
recognition, two outdated expectations for capability the product gained
mid-session) was root-caused and documented in the script's own comments.

### Test categories, in detail

**Positive cases** (should answer, and does) span: platform identity, Signal
Scorecard's four factors, quant metrics (MACD, Sharpe, volatility, RSI/beta
bands), sentiment methodology, Whale Watching, asset-discovery mechanics,
dashboard/ranking cadence, onboarding paths, watchlist behaviour (including a
real `USER_DATA_SEARCH` hit on "what's on my watchlist?"), Learning Centre
concepts (diversification, compound interest — sourced from the real 11-article
table), Funds/ASISA, and methodology (ranking, LLM, descriptions, "why can't
you tell me what to buy").

**Negative cases**, covering all 4 boundary types:
- *Advice refusal*: "Should I buy Apple right now?", "Is Apple a good
  investment?", "Which of the top-5 should I buy first?"
- *Personal-finance gate*: TFSA questions, "help me with my tax on ETF
  gains", risk-questionnaire → allocation advice
- *Out-of-scope / honest decline*: Sortino ratio, covered calls (both now
  correctly consult a real source and honestly say it doesn't cover the
  question, rather than refusing outright or fabricating)
- *Ambiguous acronym*: "What is RSA?", "Explain TER." — both now correctly
  ask which meaning is intended instead of guessing

**Boundary case**: "What is beta?" confirmed to resolve from
`_ASK_GLOSSARY` (AlphaSwarm computes it) rather than external search.

### 3 targeted checks (from a separate spec, re-verified against actual
code/env rather than assumed)

1. **Ranking-flag gate** — `UNIFIED_RANKING_ENABLED=true` in this env; the
   response does describe the four-factor formula (consistent), though the
   text is a static string that doesn't actually *read* the flag — a latent
   risk if the flag were ever `false`, flagged but not fixed (out of scope).
2. **Description provenance** — correctly attributes descriptions to
   yfinance, explicitly not AI-generated (matches commit `2682294`).
3. **Live-retrieval claim** — correctly reflects that live search is
   currently active, reading the *actual* env var (`SERPAPI_API_KEY`) rather
   than the two stale var names (`SEARCH_PROVIDER_URL`/`_API_KEY`) an earlier
   task brief named, which don't exist in this codebase anymore (renamed
   earlier this session when the search provider was switched to SerpApi).

## 4. Regression safety net

`backend/tests/test_ask_learning.py`: **104/104 passing**, including 18 new
tests added this session (acronym-ordering regressions, PLATFORM_QUESTION
dispatch, gate-ordering). Full backend suite (`pytest -q`): same 10
pre-existing failures throughout this entire session (orchestration/
save-top-assets/ss-aggregation — unrelated to Ask AlphaSwarm), zero new
regressions from any change made.

## 5. Known, un-fixed limitations (documented, not hidden)

- `_PLATFORM_METHODOLOGY`'s ranking-flag blindness (above).
- A coverage-threshold edge case in `_ask_learning_centre_lookup`: "How does
  the JSE work?" requires *both* "jse" and "work" to hit 60% coverage and
  currently falls through to "not covered" — a pre-existing design
  characteristic, not something broken this session.
- The local educational cache (~46 entries) still doesn't cover most of
  derivatives/valuation/fundamental-analysis depth — closing that further
  means either more manual source-verification work or accepting live
  search's SerpApi free-tier quota (100/month) as the real ceiling.
