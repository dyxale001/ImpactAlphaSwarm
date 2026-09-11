"""Ask AlphaSwarm — conversational reference resolution regression tests.

Covers _resolve_conversational_reference (deterministic, no LLM, no network)
plus a few end-to-end guarantees through ask_alphaswarm() itself, following
this module's existing convention (see test_ask_learning.py): assert intent,
resolved-query shape, and safety outcome — never a specific LLM sentence, and
never a live Groq/Supabase call in the test suite itself.

Core invariant under test throughout: reference resolution only ever ADDS an
explicit ticker/metric clause to the end of the original query text. It never
removes wording, and it runs strictly AFTER the blocklist check — so it can
never turn a blocked question into an allowed one.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api  # noqa: E402


def _ctx(**kwargs):
    return api.AskContext(**kwargs)


def _patch_fake_auth(monkeypatch):
    async def _fake_auth(_authorization):
        return "fake-user-id"
    monkeypatch.setattr(api, "_get_user_id_from_bearer", _fake_auth)


# ── 1. Basic reference resolution ──────────────────────────────────────────

def test_no_context_leaves_query_unchanged():
    query, clarification, _asset, _metric = api._resolve_conversational_reference("Tell me about GOOGL", None)
    assert query == "Tell me about GOOGL"
    assert clarification is None


def test_pronoun_resolves_against_active_asset():
    query, clarification, asset, metric = api._resolve_conversational_reference(
        "What does its RSI mean?", _ctx(active_asset="GOOGL")
    )
    assert clarification is None
    assert "GOOGL" in query
    assert "RSI" in query
    # Original wording is preserved, not replaced.
    assert "What does its RSI mean?" in query
    assert asset == "GOOGL"
    assert metric == "RSI"


def test_metric_only_follow_up_uses_recent_metric():
    query, clarification, asset, metric = api._resolve_conversational_reference(
        "What about the Sharpe ratio?", _ctx(active_asset="GOOGL", recent_metric="RSI")
    )
    assert clarification is None
    assert "GOOGL" in query
    # The query's own metric ("Sharpe ratio") wins over the stale recent_metric.
    assert "Sharpe ratio" in query
    assert asset == "GOOGL"
    assert metric == "Sharpe ratio"


def test_bare_reference_uses_recent_metric_when_query_names_none():
    query, clarification, asset, metric = api._resolve_conversational_reference(
        "Is that good?", _ctx(active_asset="GOOGL", recent_metric="RSI")
    )
    assert clarification is None
    assert "GOOGL" in query
    assert "RSI" in query
    assert asset == "GOOGL"
    assert metric == "RSI"


# ── 2. Asset switching ──────────────────────────────────────────────────────

def test_explicit_new_asset_mention_ignores_stale_context():
    """'What about MSFT?' names MSFT itself — no rewrite needed, and any
    stale GOOGL context must not leak in."""
    query, clarification, asset, _metric = api._resolve_conversational_reference(
        "What about MSFT?", _ctx(active_asset="GOOGL", recent_metric="RSI")
    )
    assert clarification is None
    assert query == "What about MSFT?"
    assert "GOOGL" not in query
    assert asset == "MSFT"


def test_follow_up_after_switch_resolves_to_new_asset():
    query, clarification, asset, metric = api._resolve_conversational_reference(
        "What does its beta mean?", _ctx(active_asset="MSFT", recent_metric=None)
    )
    assert clarification is None
    assert "MSFT" in query
    assert "beta" in query
    assert asset == "MSFT"
    assert metric == "beta"


# ── 3. Ambiguity — never guess ───────────────────────────────────────────────

def test_two_candidate_assets_asks_for_clarification():
    query, clarification, _asset, _metric = api._resolve_conversational_reference(
        "Is that good?", _ctx(active_asset=None, ambiguous_assets=["GOOGL", "MSFT"])
    )
    assert clarification is not None
    assert clarification.intent == "UNKNOWN"
    assert clarification.is_blocked is False
    assert "GOOGL" in clarification.narration
    assert "MSFT" in clarification.narration
    # Must not have silently picked one.
    assert clarification.data == {}


def test_no_context_at_all_asks_rather_than_invents():
    query, clarification, _asset, _metric = api._resolve_conversational_reference("What does it mean?", _ctx())
    assert clarification is not None
    assert clarification.intent == "UNKNOWN"
    assert clarification.data == {}


# ── 4. Standalone education is never contaminated by context ───────────────

def test_learning_question_with_no_reference_wording_ignores_context():
    """'What is the JSE?' has no pronoun/continuation wording at all — active
    GOOGL context must be completely ignored, matching pre-context behaviour
    exactly (query returned byte-for-byte unchanged)."""
    for q in ["What is the JSE?", "What is beta?", "What is SPY?", "What is the S&P 500?", "What does SARB do?"]:
        query, clarification, _asset, _metric = api._resolve_conversational_reference(
            q, _ctx(active_asset="GOOGL", recent_metric="RSI")
        )
        assert clarification is None
        assert query == q, f"context leaked into standalone question: {q!r} -> {query!r}"


# ── 5. Comparisons ──────────────────────────────────────────────────────────

def test_comparison_follow_up_retains_both_assets():
    query, clarification, _asset, _metric = api._resolve_conversational_reference(
        "What about their beta?", _ctx(compare_assets=["GOOGL", "MSFT"])
    )
    assert clarification is None
    assert "GOOGL" in query and "MSFT" in query
    # Must trigger _ask_context_synthesis's existing comparison-detection
    # regex (matches "compare") rather than silently falling back to a
    # single-asset resolution.
    assert "compare" in query.lower()


# ── 6. Safety — context can never unblock an advice question ───────────────

def test_blocklist_runs_before_reference_resolution(monkeypatch):
    """'Should I buy it?' must be blocked by the raw-text blocklist check
    regardless of context — reference resolution must never even run for a
    blocked query. Verified by making resolution explode if called."""
    def _boom(_q, _ctx):
        raise AssertionError("reference resolution must not run once the blocklist has already matched")
    monkeypatch.setattr(api, "_resolve_conversational_reference", _boom)
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="Should I buy it?", context=_ctx(active_asset="GOOGL")),
        authorization="Bearer x",
    ))
    assert resp.is_blocked is True
    assert resp.intent == "UNSUPPORTED_FINANCIAL_ADVICE"


def test_resolved_advice_style_question_still_reaches_blocklist_text():
    """Even where resolution WOULD run, the phrase that trips the blocklist
    ('should i buy') survives verbatim in the rewritten query — resolution
    only appends, never removes wording that could hide it."""
    query, clarification, _asset, _metric = api._resolve_conversational_reference(
        "Should I buy it because the RSI is low?", _ctx(active_asset="GOOGL")
    )
    assert "should i buy" in query.lower()


def test_full_flow_stays_blocked_with_context_present(monkeypatch):
    """End-to-end: even when a real AskContext naming GOOGL is supplied,
    'Should I buy it?' must still come back blocked."""
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)

    def _boom(_query):
        raise AssertionError("classifier must not run once the blocklist has already matched")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="Should I buy it?", context=_ctx(active_asset="GOOGL")),
        authorization="Bearer x",
    ))
    assert resp.is_blocked is True
    assert resp.intent == "UNSUPPORTED_FINANCIAL_ADVICE"


# ── 7. Backward compatibility — no context field sent at all ───────────────

def test_ask_request_without_context_field_still_parses():
    """Existing callers that never send `context` (every pre-existing test,
    and any client not yet updated) must keep working — the field is
    optional and defaults to None."""
    req = api.AskRequest(query="Tell me about NVIDIA")
    assert req.context is None


def test_full_flow_matches_pre_context_behaviour_when_context_omitted(monkeypatch):
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_blocklist_hit", lambda _q: False)
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda _q, _uid: ({}, "assets"))
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="Tell me about NVIDIA"), authorization="Bearer x"))
    assert resp.intent == "ANALYSIS_EXPLANATION"
