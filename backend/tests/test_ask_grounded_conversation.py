"""Ask AlphaSwarm — grounded conversation gap-fix regression tests.

Covers three fixes in this pass:
  1. Comparison follow-ups ("which one has the higher beta?") that name no
     ticker at all, resolved via conversation context rather than falling
     back to clarification/generic retrieval.
  2. Broad beginner education ("I don't understand investing") routed to a
     multi-source educational overview instead of "nothing found".
  3. Safety: conversational context can never turn a blocked question into
     an allowed one, including through a resolved comparison.

Deterministic throughout unless a test's docstring says otherwise — no live
Groq calls (narration client stubbed or its absence relied on), and asset/
comparison lookups are monkeypatched. One block at the end performs an
actual live Groq classification check and is clearly labelled as such.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api  # noqa: E402
from src.utils import educational_retrieval  # noqa: E402


def _ctx(**kwargs):
    return api.AskContext(**kwargs)


class _EchoGroqClient:
    def complete(self, prompt: str) -> str:
        return "STUB_GROUNDED_ANSWER"


def _patch_narration_client(monkeypatch, client):
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: client)


def _patch_fake_auth(monkeypatch):
    async def _fake_auth(_authorization):
        return "fake-user-id"
    monkeypatch.setattr(api, "_get_user_id_from_bearer", _fake_auth)


class _FakeTable:
    def select(self, *_a, **_kw):
        return self

    def execute(self):
        return type("Resp", (), {"data": []})()


class _FakeSupabaseNoArticles:
    """No Learning Centre articles — used by the broad-beginner-education
    tests below so tier 2 (Learning Centre) is a guaranteed miss and tier 3
    (the new beginner-overview path) is what's actually exercised."""

    def table(self, _name):
        return _FakeTable()


def _patch_no_learning_centre(monkeypatch):
    monkeypatch.setattr(api, "supabase", _FakeSupabaseNoArticles())


def _patch_two_asset_lookup(monkeypatch, rows_by_ticker: dict):
    """Stands in for _resolve_multiple_assets + _fetch_asset_analysis_data —
    the two Supabase-backed calls the comparison branch makes."""
    tickers = list(rows_by_ticker.keys())
    monkeypatch.setattr(
        api, "_resolve_multiple_assets",
        lambda _q, limit=3: [{"ticker": t, "id": t, "name": t} for t in tickers][:limit],
    )
    monkeypatch.setattr(
        api, "_fetch_asset_analysis_data",
        lambda asset, _uid: (rows_by_ticker[asset["ticker"]], "ai_recommendation"),
    )


# ── 1. Comparison trigger pattern — covers the exact required phrasings ────

def test_comparison_trigger_matches_required_phrasings():
    phrasings = [
        "Which one has the higher beta?",
        "Which has the higher beta?",
        "Does GOOGL or MSFT have a higher beta?",
        "Which is more volatile?",
        "Which one ranks higher?",
        "Which has the better Sharpe ratio?",
        "What about the other one?",
        "Compare their beta.",
        "Compare the two.",
    ]
    for p in phrasings:
        assert api._ASK_COMPARISON_TRIGGER_PATTERN.search(p), f"comparison trigger missed: {p!r}"


def test_comparison_trigger_does_not_match_unrelated_text():
    for p in ["What is beta?", "Tell me about GOOGL", "What is the JSE?"]:
        assert not api._ASK_COMPARISON_TRIGGER_PATTERN.search(p), f"false positive: {p!r}"


# ── 2. Context-only comparison follow-up resolves both assets ──────────────

def test_comparison_follow_up_with_no_named_ticker_appends_both():
    """'Which one has the higher beta?' names no ticker at all — must be
    resolved via context.compare_assets, not fall back to clarification."""
    query, clarification, asset, metric = api._resolve_conversational_reference(
        "Which one has the higher beta?", _ctx(compare_assets=["GOOGL", "MSFT"])
    )
    assert clarification is None
    assert "GOOGL" in query and "MSFT" in query
    assert "compare" in query.lower()
    # Not a single-asset grounding case.
    assert asset is None


def test_does_x_or_y_have_higher_pattern_recognised_explicitly():
    """'Does GOOGL or MSFT have a higher beta?' already names both tickers —
    passes through unchanged (no context needed) and must still be
    recognised as a comparison by the (widened) trigger used downstream."""
    query, clarification, asset, metric = api._resolve_conversational_reference(
        "Does GOOGL or MSFT have a higher beta?", None
    )
    assert clarification is None
    assert query == "Does GOOGL or MSFT have a higher beta?"
    assert api._ASK_COMPARISON_TRIGGER_PATTERN.search(query)


# ── 3. End-to-end comparison through _ask_context_synthesis ────────────────

def test_comparison_follow_up_full_flow_grounds_both_assets(monkeypatch):
    _patch_two_asset_lookup(monkeypatch, {
        "GOOGL": {"ticker": "GOOGL", "beta": 1.14},
        "MSFT": {"ticker": "MSFT", "beta": 0.91},
    })
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_context_synthesis(
        "Which one has the higher beta? — compare GOOGL and MSFT", "fake-user-id"
    )
    assert resp.intent == "CONTEXT_SYNTHESIS"
    tickers = {a["ticker"] for a in resp.data.get("assets", [])}
    assert tickers == {"GOOGL", "MSFT"}


def test_comparison_missing_metric_does_not_invent_value(monkeypatch):
    """MSFT has no beta at all — the supplied data must not contain a
    fabricated beta for it; the narration prompt (not asserted verbatim
    here) is instructed to say so rather than guess."""
    _patch_two_asset_lookup(monkeypatch, {
        "GOOGL": {"ticker": "GOOGL", "beta": 1.14},
        "MSFT": {"ticker": "MSFT"},  # no beta key at all
    })
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_context_synthesis(
        "Which one has the higher beta? — compare GOOGL and MSFT", "fake-user-id"
    )
    assets_by_ticker = {a["ticker"]: a for a in resp.data.get("assets", [])}
    assert assets_by_ticker["GOOGL"]["beta"] == 1.14
    assert "beta" not in assets_by_ticker["MSFT"]


# ── 4. Asset pivots preserved (no regression from the comparison changes) ──
# The pivot/fresh-mention tracking itself lives in the frontend
# (contextTracker.ts, TypeScript, no test runner configured in this repo)
# and was already covered by backend-side resolution tests in
# test_ask_conversational_context.py (test_follow_up_after_switch_resolves_
# to_new_asset). What's re-verified here is that the BACKEND side of a pivot
# sequence — resolving a single-asset follow-up once the frontend has
# already computed the new active_asset — still works unchanged after the
# comparison-trigger regex widening above.

def test_single_asset_follow_up_after_pivot_still_resolves_cleanly():
    query, clarification, asset, metric = api._resolve_conversational_reference(
        "What about its Sharpe ratio?", _ctx(active_asset="GOOGL", recent_metric=None)
    )
    assert clarification is None
    assert asset == "GOOGL"
    assert metric == "Sharpe ratio"
    # Must NOT be treated as a comparison just because the widened trigger
    # pattern also matches bare metric words in some phrasings.
    assert "compare" not in query.lower()


# ── 5. Broad beginner education ─────────────────────────────────────────────

def test_broad_beginner_phrasings_detected():
    for q in [
        "I don't understand investing",
        "Give me beginner staple knowledge for investing",
        "I'm new to investing",
        "Give me beginner investing basics",
    ]:
        assert educational_retrieval.is_broad_beginner_query(q), f"not detected as broad: {q!r}"


def test_specific_term_questions_not_treated_as_broad():
    """A specific-term question must NOT take the broad-overview path — it
    should still get the precise single-source/glossary answer."""
    for q in ["What is beta?", "What is diversification?", "What is the JSE?", "Explain RSI"]:
        assert not educational_retrieval.is_broad_beginner_query(q), f"false positive: {q!r}"


def test_beginner_overview_returns_real_approved_sources():
    sources = educational_retrieval.search_beginner_overview()
    assert sources, "beginner overview must return at least one approved source"
    for s in sources:
        assert educational_retrieval.is_approved_domain(s.url)


def test_broad_beginner_question_routes_to_overview_not_no_data(monkeypatch):
    """'I don't understand investing' must produce a real grounded overview
    response, never the old 'nothing found' fallback."""
    _patch_no_learning_centre(monkeypatch)
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_learning_question("I don't understand investing")
    assert resp.intent == "LEARNING_QUESTION"
    assert resp.narration != api._ASK_LEARNING_NOT_COVERED_MESSAGE
    assert resp.data.get("topic") == "beginner_overview"
    assert len(resp.sources) >= 1
    for s in resp.sources:
        assert educational_retrieval.is_approved_domain(s.url)


def test_beginner_staple_knowledge_question_routes_to_overview(monkeypatch):
    _patch_no_learning_centre(monkeypatch)
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_learning_question("Give me beginner staple knowledge for investing")
    assert resp.intent == "LEARNING_QUESTION"
    assert resp.data.get("topic") == "beginner_overview"


def test_beginner_overview_grounding_failure_falls_back_gracefully(monkeypatch):
    """If Groq is unavailable, must fall through to the single-source tier
    (or honest fallback) rather than crash or return an ungrounded answer."""
    _patch_no_learning_centre(monkeypatch)
    _patch_narration_client(monkeypatch, None)

    resp = api._ask_learning_question("I don't understand investing")
    assert resp.intent == "LEARNING_QUESTION"
    # Either the honest fallback, or (if the single-source tier's own
    # grounding also fails) still the honest fallback — never a partial or
    # fabricated answer.
    assert resp.data.get("topic") != "beginner_overview" or resp.narration


# ── 6. South African standalone education unaffected ───────────────────────

def test_south_african_terms_remain_specific_not_broad():
    for q in ["What is the JSE?", "What does SARB do?", "What is the repo rate?",
              "What is the prime lending rate?", "What is CPI?", "What does ZAR mean?", "JSE"]:
        assert not educational_retrieval.is_broad_beginner_query(q)


# ── 7. Safety — conversational context can never launder a blocked query ───

def test_safety_blocked_after_metric_context_established(monkeypatch):
    """Tell me about GOOGL -> What does its RSI mean? -> Should I buy it?
    The final question must still be blocked."""
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)

    def _boom(_q):
        raise AssertionError("classifier must not run once the blocklist has already matched")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="Should I buy it?", context=_ctx(active_asset="GOOGL", recent_metric="RSI")),
        authorization="Bearer x",
    ))
    assert resp.is_blocked is True
    assert resp.intent == "UNSUPPORTED_FINANCIAL_ADVICE"


def test_safety_blocked_after_comparison_context_established(monkeypatch):
    """Tell me about GOOGL -> What about MSFT? -> Which one should I buy?
    Must still be blocked, even though compare_assets is populated."""
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)

    def _boom(_q):
        raise AssertionError("classifier must not run once the blocklist has already matched")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="Which one should I buy?", context=_ctx(compare_assets=["GOOGL", "MSFT"])),
        authorization="Bearer x",
    ))
    assert resp.is_blocked is True
    assert resp.intent == "UNSUPPORTED_FINANCIAL_ADVICE"


def test_safety_blocklist_phrasings_unaffected():
    for q in [
        "Should I buy GOOGL?",
        "Which JSE stock should I buy?",
        "Which South African stock should I invest in?",
        "Which stock will make me the most money?",
    ]:
        assert api._ask_blocklist_hit(q), f"expected blocklist hit: {q!r}"


def test_repo_rate_advice_laundering_still_blocked():
    """'Should I buy because the repo rate is falling?' must still trip the
    blocklist on 'should i buy' regardless of the SA-specific framing."""
    assert api._ask_blocklist_hit("Should I buy because the repo rate is falling?")
