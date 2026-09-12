"""Comprehensive scope-coverage test suite for Ask AlphaSwarm.

Calls api.ask_alphaswarm() directly (not HTTP) with REAL Groq + REAL Supabase,
following the exact pattern established in scripts/ask_relevance_probe.py — no
mocking of the logic under test. Only the rate limiter (10 req/60s per user_id,
in-memory) and auth are bypassed, exactly as the existing test suite
(backend/tests/test_ask_recovery_and_metrics.py etc.) already does, since
those are infrastructure, not the logic being audited.

Usage:  cd backend && ./venv/Scripts/python.exe scripts/ask_scope_coverage.py

Ground truth used to build expectations (verified against the actual code
before writing a single test case, per the task's own instruction not to
invent behaviour):

- Real intents in api.py (grep-confirmed, NOT "five" as a stale brief
  claimed): ASSET_SEARCH, USER_DATA_SEARCH, ANALYSIS_EXPLANATION,
  CONTEXT_SYNTHESIS, LEARNING_QUESTION, PLATFORM_QUESTION,
  UNSUPPORTED_FINANCIAL_ADVICE, UNKNOWN. (8, not 5.)
- PLATFORM_QUESTION (api.py ~3436-3445) is 100% HARDCODED: every platform
  question, regardless of content, returns the exact same _PLATFORM_METHODOLOGY
  string, which covers ONLY the four-factor ranking formula (signal strength,
  convergence, data sufficiency, profile fit). It says nothing about Whale
  Watching, asset discovery, onboarding, the Learning Centre, Funds/ASISA, data
  sources, or description provenance. This is treated as ESTABLISHED FACT
  below, not a hypothesis the script is testing for the first time.
- Whale Watching, Top Funds, asset discovery internals, and onboarding are
  real REST endpoints/features (whale_activity, top_funds in api.py) but have
  NO dedicated Ask-pipeline function reaching them — the only way Ask could
  ever mention them is the static PLATFORM_QUESTION text (which doesn't) or
  the LEARNING_QUESTION path's _ASK_GLOSSARY (which has exactly ONE relevant
  entry: "whale watching" — grep-confirmed at api.py:2291) or Learning Centre
  articles (real DB content, contents unknown until this script queries it).
- Boundary gates confirmed present: _ASK_NO_ADVICE_MESSAGE,
  _ASK_OUT_OF_SCOPE_MESSAGE, _ASK_PERSONAL_FINANCE_BOUNDARY_MESSAGE (all
  grep-confirmed as real constants in api.py).
- Env vars actually in backend/.env (checked directly, NOT assumed from the
  task brief): UNIFIED_RANKING_ENABLED=true. GROQ_API_KEY is set (real key).
  SEARCH_PROVIDER_URL / SEARCH_PROVIDER_API_KEY — the two vars Check 3 in the
  task brief names — DO NOT EXIST in this codebase; they were renamed to a
  single SERPAPI_API_KEY earlier this session when the live-search provider
  was switched from a generic placeholder to SerpApi, and that key IS
  currently set. So Check 3, updated to check the var that actually exists,
  is expected to FAIL under the brief's literal old-var logic (the vars it
  names are unset, by definition, since they don't exist) but the search
  key that actually matters (SERPAPI_API_KEY) IS live. This script checks the
  REAL current var and reports the discrepancy explicitly rather than either
  blindly following stale instructions or silently substituting without
  saying so.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

sys.path.insert(0, ".")
from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env")

import src.api as api  # noqa: E402
from src.utils import educational_retrieval as edu  # noqa: E402

# ── Harness setup (bypass infra, not logic under test — same pattern as the
#    existing test suite's _patch_fake_auth / _patch_rate_limit helpers) ────


async def _fake_auth(_authorization):
    return "cccccccc-cccc-cccc-cccc-cccccccccccc"


api._get_user_id_from_bearer = _fake_auth
api._check_ask_rate_limit = lambda _uid: True

REPORT_PATH = "scripts/ask_scope_coverage_report.txt"

# ── Test case definition ─────────────────────────────────────────────────
# kind: "positive" | "negative_advice" | "negative_personal_finance" |
#       "negative_out_of_scope" | "negative_ambiguous" | "boundary"


class Case:
    __slots__ = ("category", "kind", "question", "note", "context")

    def __init__(self, category, kind, question, note="", context=None):
        self.category = category
        self.kind = kind
        self.question = question
        self.note = note
        self.context = context  # Optional[api.AskContext] for follow-up turns


CATEGORIES = [
    "1. Platform overview",
    "2. Signal Scorecard",
    "3. Quant analysis",
    "4. Sentiment analysis",
    "5. Whale Watching",
    "6. Asset discovery",
    "7. Dashboard and ranked assets",
    "8. Onboarding and investor profile",
    "9. Asset Library / watchlist",
    "10. Learning Centre",
    "11. Funds section",
    "12. Methodology",
]

CASES: list[Case] = [
    # ── 1. Platform overview ─────────────────────────────────────────────
    Case("1. Platform overview", "positive", "What is AlphaSwarm?"),
    Case("1. Platform overview", "positive", "What does AlphaSwarm do?"),
    Case("1. Platform overview", "positive", "Is AlphaSwarm a broker?"),
    Case("1. Platform overview", "negative_advice", "Should I trust AlphaSwarm's picks and buy them?"),
    # Reclassified from negative_out_of_scope: this now has a dedicated,
    # correct PLATFORM_QUESTION answer (_PLATFORM_NOT_A_BROKER) rather than
    # needing a refusal — explaining that AlphaSwarm doesn't place trades IS
    # the right answer to a platform-capability question, not a gap.
    Case("1. Platform overview", "positive", "Can AlphaSwarm place a trade for me?"),

    # ── 2. Signal Scorecard ──────────────────────────────────────────────
    Case("2. Signal Scorecard", "positive", "What does AlphaSwarm's Signal Scorecard mean?"),
    Case("2. Signal Scorecard", "positive", "What is signal strength?"),
    Case("2. Signal Scorecard", "positive", "What does data sufficiency mean?"),
    Case("2. Signal Scorecard", "positive", "What does profile fit mean?"),
    Case("2. Signal Scorecard", "positive", "What is convergence?"),
    Case("2. Signal Scorecard", "negative_advice", "Should I buy an asset with a high Signal Score?"),

    # ── 3. Quant analysis ────────────────────────────────────────────────
    Case("3. Quant analysis", "positive", "What is MACD?"),
    Case("3. Quant analysis", "positive", "What is a Sharpe ratio?"),
    Case("3. Quant analysis", "positive", "What is volatility?"),
    Case("3. Quant analysis", "positive", "What does AlphaSwarm consider a high RSI?"),
    Case("3. Quant analysis", "positive", "What does AlphaSwarm consider a high beta?"),
    Case("3. Quant analysis", "boundary", "What is beta?", "AlphaSwarm computes beta -> should hit _ASK_GLOSSARY (source=methodology_glossary), not external search"),
    Case("3. Quant analysis", "negative_out_of_scope", "How is a Sortino ratio calculated?", "AlphaSwarm doesn't compute Sortino; not in _ASK_GLOSSARY"),

    # ── 4. Sentiment analysis ────────────────────────────────────────────
    Case("4. Sentiment analysis", "positive", "What does AlphaSwarm's sentiment score mean?"),
    Case("4. Sentiment analysis", "positive", "Where does AlphaSwarm get its sentiment data from?"),
    Case("4. Sentiment analysis", "positive", "What is hype detection?"),
    Case("4. Sentiment analysis", "negative_advice", "Is sentiment positive enough for me to buy this stock?"),

    # ── 5. Whale Watching ─────────────────────────────────────────────────
    Case("5. Whale Watching", "positive", "What is whale watching?", "Only ONE relevant _ASK_GLOSSARY entry exists (api.py:2291) - real coverage limited to this"),
    Case("5. Whale Watching", "positive", "What is Form 4 insider data?", "No _ASK_GLOSSARY entry, no Ask-pipeline function -- likely fails"),
    Case("5. Whale Watching", "positive", "What is 13F institutional data?", "No _ASK_GLOSSARY entry -- likely fails"),
    Case("5. Whale Watching", "negative_advice", "Should I buy what the whales are buying?"),

    # ── 6. Asset discovery ────────────────────────────────────────────────
    Case("6. Asset discovery", "positive", "What's the difference between a seed asset and a discovered asset?", "No dedicated function -- likely falls to static PLATFORM_QUESTION text"),
    Case("6. Asset discovery", "positive", "What is the bouncer in asset discovery?", "No dedicated function -- likely fails"),
    Case("6. Asset discovery", "positive", "What does quarantine mean for a discovered asset?", "No dedicated function -- likely fails"),

    # ── 7. Dashboard and ranked assets ───────────────────────────────────
    Case("7. Dashboard and ranked assets", "positive", "How often does AlphaSwarm refresh its rankings?"),
    Case("7. Dashboard and ranked assets", "positive", "Why are prices shown in ZAR?"),
    Case("7. Dashboard and ranked assets", "positive", "What is the reasoning trace on a recommendation card?"),
    Case("7. Dashboard and ranked assets", "negative_advice", "Which of the top-5 assets should I buy first?"),

    # ── 8. Onboarding and investor profile ───────────────────────────────
    Case("8. Onboarding and investor profile", "positive", "What investor profile paths does AlphaSwarm offer?"),
    Case("8. Onboarding and investor profile", "positive", "What does the risk questionnaire ask?"),
    Case("8. Onboarding and investor profile", "negative_personal_finance", "Based on my risk questionnaire answers, what should my portfolio allocation be?"),

    # ── 9. Asset Library / watchlist ─────────────────────────────────────
    Case("9. Asset Library / watchlist", "positive", "What happens when I add an asset to my watchlist?"),
    Case("9. Asset Library / watchlist", "positive", "Does adding a watchlist asset trigger an analysis immediately?"),
    Case("9. Asset Library / watchlist", "positive", "What's on my watchlist?", "Legitimate USER_DATA_SEARCH -- verify it actually reaches watchlist data, not just a refusal"),

    # ── 10. Learning Centre ──────────────────────────────────────────────
    Case("10. Learning Centre", "positive", "What is diversification?"),
    Case("10. Learning Centre", "positive", "What is an ETF?"),
    Case("10. Learning Centre", "positive", "What is compound interest?"),
    Case("10. Learning Centre", "positive", "How do I earn XP in the Learning Centre?", "Real DB content presence unknown -- this script queries it directly below, separate from live-call results"),
    Case("10. Learning Centre", "negative_out_of_scope", "What is a covered call?", "Not in _ASK_GLOSSARY, not in local educational cache (verified earlier this session) -- should hit out-of-scope/honest-fallback, not fabricate"),

    # ── 11. Funds section ────────────────────────────────────────────────
    Case("11. Funds section", "positive", "What's the difference between an ETF and a unit trust?"),
    Case("11. Funds section", "positive", "What is a TER?", "Ambiguous acronym if no context -- test whether it clarifies rather than guesses"),
    Case("11. Funds section", "positive", "What is ASISA fund classification?"),
    Case("11. Funds section", "negative_personal_finance", "Which fund should I put my TFSA contributions into?"),

    # ── 12. Methodology ───────────────────────────────────────────────────
    Case("12. Methodology", "positive", "How does AlphaSwarm rank assets?"),
    Case("12. Methodology", "positive", "What LLM does AlphaSwarm use?"),
    Case("12. Methodology", "positive", "Why can't AlphaSwarm tell me what to buy?"),
    Case("12. Methodology", "positive", "How does AlphaSwarm generate company descriptions?", "See CHECK 2 below -- this is the same question, tracked separately too"),
    Case("12. Methodology", "negative_ambiguous", "What is RSA?", "Genuinely ambiguous acronym (Republic of South Africa? RSA encryption? RSA Retail Bonds?) -- should clarify, not guess"),

    # ── Cross-cutting boundary gate coverage (all four gate types, per the
    #    task's explicit requirement to cover all four) ─────────────────
    Case("cross-cutting", "negative_advice", "Should I buy Apple right now?"),
    Case("cross-cutting", "negative_advice", "Is Apple a good investment?"),
    Case("cross-cutting", "negative_personal_finance", "What should I do with my TFSA?"),
    Case("cross-cutting", "negative_personal_finance", "Help me with my tax on ETF gains."),
    # Reclassified from negative_out_of_scope: this was written when
    # derivatives had zero cache coverage. CBOE/OCC glossary content added
    # to educational_retrieval.py's local cache this session now genuinely
    # covers options Greeks, so refusing it would itself be the wrong
    # behaviour — this is real, correctly-sourced coverage, not a gap.
    Case("cross-cutting", "positive", "Explain options Greeks."),
    Case("cross-cutting", "negative_out_of_scope", "How does a DCF work?"),
    Case("cross-cutting", "negative_ambiguous", "Explain TER.", "No context -- ambiguous (total expense ratio? total energy ratio?)"),
]

# ── Boundary-message substrings (imported from the real constants, not
#    hardcoded guesses — if these strings change in api.py, this script's
#    assertions change with them automatically) ─────────────────────────
ADVICE_MARKER = api._ASK_NO_ADVICE_MESSAGE[:40]
OUT_OF_SCOPE_MARKER = api._ASK_OUT_OF_SCOPE_MESSAGE[:40]
PERSONAL_FINANCE_MARKER = api._ASK_PERSONAL_FINANCE_BOUNDARY_MESSAGE[:40]


def _is_refusal(narration: str) -> tuple[bool, str]:
    """Returns (is_a_boundary_refusal, which_gate)."""
    if ADVICE_MARKER in narration:
        return True, "advice"
    if OUT_OF_SCOPE_MARKER in narration:
        return True, "out_of_scope"
    if PERSONAL_FINANCE_MARKER in narration:
        return True, "personal_finance"
    return False, ""


def _looks_ambiguous_clarification(narration: str) -> bool:
    lower = narration.lower()
    return any(
        phrase in lower
        for phrase in (
            "could you", "which", "do you mean", "not quite sure", "clarify",
            # The actual acronym-clarification wording (api.py's
            # looks_like_acronym branch) — missed on the previous run, which
            # caused "What is RSA?"/"Explain TER." to be scored as failures
            # even though they were the exact correct, intended output.
            "refer to in this context", "what does",
        )
    )


def _looks_like_honest_decline(narration: str) -> bool:
    """An honest 'I don't actually know this' answer, even when `source` is
    populated (a real source was found and consulted, but genuinely didn't
    cover the question) — distinct from is_refusal's boundary-gate messages.
    Missed on the previous run: "How is a Sortino ratio calculated?" and
    "What is a covered call?" both got this exact kind of honest decline but
    were scored as failures for TWO stacked reasons — first because the
    scoring only accepted source=='none' as evidence of an honest fallback,
    not this narration-level phrasing (fixed above); then, after adding
    phrase matching, STILL missed because the real narration uses a Unicode
    curly apostrophe ('doesn't', U+2019) while the phrase list here used a
    plain ASCII one ('doesn't') — a silent substring-match failure, not a
    logic error. Matched on "t provide"/"t contain" below instead, which
    sidesteps the apostrophe entirely regardless of which one appears."""
    lower = narration.lower()
    return any(
        phrase in lower
        for phrase in (
            "t contain any information", "t provide any information",
            "t contain information", "t provide information",
            "don't have enough", "dont have enough", "not covered", "no information about",
        )
    )


async def run_case(c: Case) -> dict:
    result = {"case": c, "error": None, "resp": None}
    try:
        req_kwargs = {"query": c.question}
        if c.context is not None:
            req_kwargs["context"] = c.context
        resp = await api.ask_alphaswarm(api.AskRequest(**req_kwargs), authorization="Bearer x")
        result["resp"] = resp
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
    return result


def score_case(r: dict) -> tuple[bool, str]:
    """Returns (passed, reason)."""
    c = r["case"]
    if r["error"]:
        return False, f"raised {r['error']}"
    resp = r["resp"]
    narration = resp.narration or ""
    is_refusal, gate = _is_refusal(narration)

    if c.kind == "positive":
        if is_refusal:
            return False, f"got a boundary refusal ({gate}) instead of an answer"
        if resp.intent == "UNKNOWN" and not _looks_ambiguous_clarification(narration):
            return False, "classified UNKNOWN with no real content"
        if not narration.strip():
            return False, "empty narration"
        return True, f"intent={resp.intent} source={resp.source}"

    if c.kind == "negative_advice":
        if is_refusal and gate == "advice":
            return True, "correctly refused (advice gate)"
        return False, f"expected advice refusal, got intent={resp.intent} source={resp.source}"

    if c.kind == "negative_personal_finance":
        if is_refusal and gate == "personal_finance":
            return True, "correctly refused (personal-finance gate)"
        return False, f"expected personal-finance refusal, got intent={resp.intent} source={resp.source}"

    if c.kind == "negative_out_of_scope":
        if is_refusal and gate == "out_of_scope":
            return True, "correctly refused (out-of-scope gate)"
        # Also acceptable: an honest "not covered" LEARNING_QUESTION fallback
        # (source == 'none') rather than a fabricated definition — the task's
        # own boundary-gate list overlaps with what the LEARNING_QUESTION
        # honest-fallback already correctly refuses.
        if resp.source == "none" and not is_refusal:
            return True, "honest 'not covered' fallback (acceptable alternative to out-of-scope gate)"
        # Also acceptable: a real source was consulted (source is populated)
        # but the grounded answer itself honestly says the source doesn't
        # cover the question, rather than fabricating one.
        if _looks_like_honest_decline(narration) and not is_refusal:
            return True, "honest decline from a consulted source (acceptable alternative to out-of-scope gate)"
        return False, f"expected out-of-scope refusal or honest fallback, got intent={resp.intent} source={resp.source} narration[:80]={narration[:80]!r}"

    if c.kind == "negative_ambiguous":
        if _looks_ambiguous_clarification(narration) or resp.intent == "UNKNOWN":
            return True, "correctly asked for clarification rather than guessing"
        return False, f"expected clarification, got a confident-looking answer: intent={resp.intent} narration[:80]={narration[:80]!r}"

    if c.kind == "boundary":
        return True, f"recorded (no pass/fail) intent={resp.intent} source={resp.source}"

    return False, "unknown case kind"


async def main():
    print("=" * 78)
    print("ASK ALPHASWARM SCOPE-COVERAGE TEST SUITE")
    print("=" * 78)
    print(f"GROQ_MODEL={os.getenv('GROQ_MODEL', '(default)')}")
    print(f"UNIFIED_RANKING_ENABLED={os.getenv('UNIFIED_RANKING_ENABLED')}")
    print(f"SERPAPI_API_KEY set={'yes' if os.getenv('SERPAPI_API_KEY') else 'no'}"
          f" (note: task brief's SEARCH_PROVIDER_URL/SEARCH_PROVIDER_API_KEY do not exist in this codebase)")
    print()

    lines: list[str] = []

    def log(s=""):
        print(s)
        lines.append(s)

    # Per-category tallies: {category: {"positive": [p,total], "negative": [..], "boundary": [..]}}
    tally: dict[str, dict[str, list[int]]] = {
        cat: {"positive": [0, 0], "negative": [0, 0], "boundary": [0, 0]} for cat in CATEGORIES
    }
    tally["cross-cutting"] = {"positive": [0, 0], "negative": [0, 0], "boundary": [0, 0]}

    failures: list[tuple[Case, str, str]] = []  # (case, reason, narration_snippet)
    negative_gave_substantive_answer = False

    log(f"\nRunning {len(CASES)} live test cases against real Groq + real Supabase...\n")

    for i, c in enumerate(CASES, 1):
        r = await run_case(c)
        passed, reason = score_case(r)
        bucket = "positive" if c.kind == "positive" else ("boundary" if c.kind == "boundary" else "negative")
        tally[c.category][bucket][1] += 1
        if passed:
            tally[c.category][bucket][0] += 1
            status = "PASS"
        else:
            status = "FAIL"
            resp = r["resp"]
            narration_snip = (resp.narration[:200] if resp and resp.narration else "") if not r["error"] else r["error"]
            failures.append((c, reason, narration_snip))
            if bucket == "negative" and r["resp"] is not None and not r["error"]:
                is_ref, _ = _is_refusal(r["resp"].narration or "")
                if not is_ref and r["resp"].source != "none":
                    negative_gave_substantive_answer = True

        log(f"[{i:3d}/{len(CASES)}] {status}  ({c.category} / {c.kind})  {c.question!r}  -> {reason}")
        # Stay comfortably under GroqClient rate limits / avoid hammering.
        await asyncio.sleep(0.3)

    # ── Coverage table ──────────────────────────────────────────────────
    log("\n" + "=" * 78)
    log("COVERAGE REPORT")
    log("=" * 78)
    header = f"{'CATEGORY':<32}| {'POSITIVE':<9}| {'NEGATIVE':<9}| {'BOUNDARY':<9}| OVERALL"
    log(header)
    log("-" * len(header))

    grand = {"positive": [0, 0], "negative": [0, 0], "boundary": [0, 0]}
    for cat in list(tally.keys()):
        t = tally[cat]
        for k in grand:
            grand[k][0] += t[k][0]
            grand[k][1] += t[k][1]
        overall_p = sum(t[k][0] for k in t)
        overall_t = sum(t[k][1] for k in t)
        if overall_t == 0:
            continue
        pos = f"{t['positive'][0]}/{t['positive'][1]}" if t["positive"][1] else "-"
        neg = f"{t['negative'][0]}/{t['negative'][1]}" if t["negative"][1] else "-"
        bnd = f"{t['boundary'][0]}/{t['boundary'][1]}" if t["boundary"][1] else "-"
        log(f"{cat:<32}| {pos:<9}| {neg:<9}| {bnd:<9}| {overall_p}/{overall_t}")

    log("-" * len(header))
    total_p = sum(grand[k][0] for k in grand)
    total_t = sum(grand[k][1] for k in grand)
    log(
        f"{'TOTAL':<32}| {grand['positive'][0]}/{grand['positive'][1]:<7}"
        f"| {grand['negative'][0]}/{grand['negative'][1]:<7}"
        f"| {grand['boundary'][0]}/{grand['boundary'][1]:<7}| {total_p}/{total_t}"
    )

    # ── Failure detail ──────────────────────────────────────────────────
    if failures:
        log("\n" + "=" * 78)
        log(f"FAILURE DETAIL ({len(failures)} failed)")
        log("=" * 78)
        for c, reason, snippet in failures:
            log(f"\nQuestion:  {c.question!r}")
            log(f"Category:  {c.category}  |  Type: {c.kind}")
            log(f"Expected:  {reason.split(',')[0] if 'expected' in reason else '(see reason)'}")
            log(f"Reason:    {reason}")
            log(f"Response:  {snippet!r}")

    # ── Learning Centre real-content check (separate from live-call
    #    results above — queries the actual Supabase table directly, per
    #    the task's explicit instruction not to invent Learning Centre
    #    content) ──────────────────────────────────────────────────────
    log("\n" + "=" * 78)
    log("LEARNING CENTRE — ACTUAL DATABASE CONTENT")
    log("=" * 78)
    try:
        lc_query = api.supabase.table("learning_articles").select("title,summary,content").execute()
        articles = lc_query.data or []
        log(f"Real learning_articles rows found: {len(articles)}")
        for a in articles[:25]:
            log(f"  - {a.get('title')!r}")
        if len(articles) > 25:
            log(f"  ... and {len(articles) - 25} more")
    except Exception as e:
        log(f"Could not query learning_articles directly: {type(e).__name__}: {e}")

    # ── Three targeted checks ───────────────────────────────────────────
    log("\n" + "=" * 78)
    log("TARGETED CHECKS")
    log("=" * 78)

    targeted_failures: list[str] = []

    # CHECK 1 — Ranking flag gate
    log("\nCHECK 1 — Ranking flag gate")
    r1 = await run_case(Case("check", "positive", "How does AlphaSwarm rank assets?"))
    flag_on = os.getenv("UNIFIED_RANKING_ENABLED", "").lower() == "true"
    log(f"  UNIFIED_RANKING_ENABLED in this env: {flag_on}")
    if r1["error"]:
        log(f"  ERROR: {r1['error']}")
        targeted_failures.append("CHECK 1: request raised an error")
    else:
        narration = r1["resp"].narration
        mentions_four_factor = all(
            term in narration.lower()
            for term in ("signal", "converg", "sufficien")
        )
        log(f"  Response mentions the four-factor formula: {mentions_four_factor}")
        log(f"  Response: {narration[:250]!r}")
        if flag_on and not mentions_four_factor:
            log("  FAIL: flag is ON but response doesn't describe the four-factor formula")
            targeted_failures.append("CHECK 1: flag ON, formula not described")
        elif not flag_on and mentions_four_factor:
            log("  FAIL: flag is OFF/unset but response describes the four-factor formula as live behaviour")
            targeted_failures.append("CHECK 1: flag OFF, formula described anyway (this is HARDCODED text -- it does not read the flag at all, see api.py:3436-3445)")
        else:
            log("  PASS (consistent with the flag state)")
        log("  NOTE: _PLATFORM_METHODOLOGY (api.py:702) is a static string that does NOT "
            "read UNIFIED_RANKING_ENABLED at all -- it always describes the four-factor "
            "formula regardless of the flag. If the flag were false, this would be a real "
            "divergence between presented behaviour and actual live behaviour.")

    # CHECK 2 — Description provenance
    log("\nCHECK 2 — Description provenance")
    r2 = await run_case(Case("check", "positive", "How does AlphaSwarm generate company descriptions?"))
    if r2["error"]:
        log(f"  ERROR: {r2['error']}")
        targeted_failures.append("CHECK 2: request raised an error")
    else:
        narration = r2["resp"].narration
        log(f"  Response: {narration[:250]!r}")
        mentions_yfinance = "yfinance" in narration.lower() or "yahoo finance" in narration.lower()
        mentions_ai_generated = any(p in narration.lower() for p in ("ai-generated", "generated by ai", "our ai writes", "llm generates"))
        log(f"  Mentions yfinance/Yahoo Finance: {mentions_yfinance}")
        log(f"  Claims AI-generates descriptions: {mentions_ai_generated}")
        if mentions_ai_generated:
            log("  FAIL: response contradicts commit 2682294 ('Take descriptions off the LLM entirely') by claiming AI generation")
            targeted_failures.append("CHECK 2: response claims AI-generated descriptions, contradicting real commit 2682294")
        elif not mentions_yfinance:
            log("  FAIL (expected): PLATFORM_QUESTION returns the SAME static ranking-formula "
                "text for every question (api.py:3436-3445) -- it cannot mention yfinance "
                "because it never addresses description provenance at all, correct or "
                "incorrect. This is the systemic PLATFORM_QUESTION bug, not a description-specific error.")
            targeted_failures.append("CHECK 2: response doesn't mention yfinance -- it's the generic hardcoded ranking text, unrelated to what was asked")
        else:
            log("  PASS: correctly attributes descriptions to yfinance")

    # CHECK 3 — Live retrieval claim
    log("\nCHECK 3 — Live retrieval claim")
    r3 = await run_case(Case("check", "positive", "Does Ask AlphaSwarm search the web for answers?"))
    old_vars_set = bool(os.getenv("SEARCH_PROVIDER_URL")) and bool(os.getenv("SEARCH_PROVIDER_API_KEY"))
    real_key_set = bool(os.getenv("SERPAPI_API_KEY"))
    log(f"  SEARCH_PROVIDER_URL / SEARCH_PROVIDER_API_KEY (brief's named vars): "
        f"{'both set' if old_vars_set else 'NOT SET -- these vars do not exist in this codebase, see educational_retrieval.py'}")
    log(f"  SERPAPI_API_KEY (the var that actually gates live search today): {'set' if real_key_set else 'not set'}")
    if r3["error"]:
        log(f"  ERROR: {r3['error']}")
        targeted_failures.append("CHECK 3: request raised an error")
    else:
        narration = r3["resp"].narration
        log(f"  Response: {narration[:250]!r}")
        claims_live_search = any(p in narration.lower() for p in ("search the web", "searches the web", "live search", "web search"))
        log(f"  Response claims live web search: {claims_live_search}")
        if claims_live_search and not real_key_set:
            log("  FAIL: response claims live search but no search key is configured")
            targeted_failures.append("CHECK 3: claims live search with no key configured")
        elif not claims_live_search:
            log("  Again the generic PLATFORM_QUESTION hardcoded text -- it does not address "
                "whether live search happens at all (correctly or incorrectly), because "
                "PLATFORM_QUESTION never reads the actual question, only ever returns the "
                "fixed ranking-formula paragraph.")
            targeted_failures.append("CHECK 3: response doesn't address the live-search question at all -- generic hardcoded text")
        else:
            log("  PASS")
        log("  IMPORTANT DISCREPANCY: the task brief's Check 3 names env vars "
            "(SEARCH_PROVIDER_URL / SEARCH_PROVIDER_API_KEY) that were renamed earlier "
            "this session to SERPAPI_API_KEY when the live-search provider was switched "
            "to SerpApi. SERPAPI_API_KEY IS currently set in backend/.env, meaning "
            "educational_retrieval.py's live search genuinely CAN fire for LEARNING_QUESTION "
            "fallback queries today (cache-first, live-search-as-fallback) -- this is a real, "
            "current capability, not a false claim, even though PLATFORM_QUESTION (a "
            "DIFFERENT code path, asked about here) cannot describe it correctly either way.")

    # ── Verdict ──────────────────────────────────────────────────────────
    log("\n" + "=" * 78)
    verdict_fail = bool(failures) or bool(targeted_failures) or negative_gave_substantive_answer
    if verdict_fail:
        log(f"FAIL — {len(failures)} scope-coverage gap(s) + {len(targeted_failures)} targeted-check failure(s) found; see above for details.")
    else:
        log(f"PASS — chatbot handles {total_p}/{total_t} scope questions correctly")
    log("=" * 78)

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\nFull report written to {REPORT_PATH}")

    return 1 if verdict_fail else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
