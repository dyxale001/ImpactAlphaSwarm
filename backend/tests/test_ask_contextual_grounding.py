"""Ask AlphaSwarm — contextual metric grounding regression tests.

Covers the priority rule: a metric question resolved (explicitly or via
conversational context) to a specific asset must explain that asset's ACTUAL
supplied value together with the glossary definition, not just the generic
glossary text alone — which is what _ask_learning_question's bare-keyword
glossary match would otherwise always win with, since "referring to GOOGL's
RSI" still contains the word "RSI".

Deterministic throughout: _resolve_asset and _fetch_asset_analysis_data are
monkeypatched (no live Supabase call needed to test this routing/grounding
logic in isolation), and the narration client is a stub — never a live Groq
call. Assertions check intent/source/data shape and value presence, never a
specific LLM sentence, matching this module's existing convention.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api  # noqa: E402


def _ctx(**kwargs):
    return api.AskContext(**kwargs)


class _EchoGroqClient:
    def complete(self, prompt: str) -> str:
        return "STUB_GROUNDED_ANSWER"


def _patch_narration_client(monkeypatch, client):
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: client)


def _patch_asset_lookup(monkeypatch, ticker: str, data: dict, source: str = "ai_recommendation"):
    """Stands in for _resolve_asset + _fetch_asset_analysis_data — the two
    Supabase-backed calls _ask_contextual_metric_explanation makes — so this
    module's tests never need a live database."""
    monkeypatch.setattr(api, "_resolve_asset", lambda _q: {"ticker": ticker, "id": "x", "name": ticker})
    monkeypatch.setattr(api, "_fetch_asset_analysis_data", lambda _asset, _uid: (data, source))


def _patch_fake_auth(monkeypatch):
    async def _fake_auth(_authorization):
        return "fake-user-id"
    monkeypatch.setattr(api, "_get_user_id_from_bearer", _fake_auth)


# ── 1. Grounded case: value present ─────────────────────────────────────────

def test_contextual_rsi_uses_supplied_value(monkeypatch):
    _patch_asset_lookup(monkeypatch, "GOOGL", {"ticker": "GOOGL", "rsi": 37.94})
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_contextual_metric_explanation("GOOGL", "RSI", "fake-user-id")
    assert resp is not None
    assert resp.intent == "LEARNING_QUESTION"
    assert resp.data.get("ticker") == "GOOGL"
    assert resp.data.get("rsi") == 37.94
    # Must not be the bare glossary answer — it went through narration
    # (or the deterministic fallback), not a plain definition-only response.
    assert resp.data.get("term") == "rsi"


def test_contextual_sharpe_uses_supplied_value(monkeypatch):
    _patch_asset_lookup(monkeypatch, "GOOGL", {"ticker": "GOOGL", "sharpe_ratio": -2.65})
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_contextual_metric_explanation("GOOGL", "Sharpe ratio", "fake-user-id")
    assert resp is not None
    assert resp.data.get("sharpe_ratio") == -2.65


def test_contextual_beta_uses_supplied_value(monkeypatch):
    _patch_asset_lookup(monkeypatch, "MSFT", {"ticker": "MSFT", "beta": 0.92})
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_contextual_metric_explanation("MSFT", "beta", "fake-user-id")
    assert resp is not None
    assert resp.data.get("beta") == 0.92


def test_narration_failure_falls_back_to_deterministic_grounded_text(monkeypatch):
    """If Groq is unavailable, the response must still be grounded in the
    real value — never silently drop to a value-free generic sentence."""
    _patch_asset_lookup(monkeypatch, "GOOGL", {"ticker": "GOOGL", "rsi": 37.94})
    _patch_narration_client(monkeypatch, None)  # _narrate_ask returns None

    resp = api._ask_contextual_metric_explanation("GOOGL", "RSI", "fake-user-id")
    assert resp is not None
    assert "37.94" in resp.narration
    assert "GOOGL" in resp.narration


# ── 2. Missing-data case: never invent a value ──────────────────────────────

def test_missing_metric_explains_generically_and_says_so(monkeypatch):
    """MSFT's data has no sharpe_ratio field at all — must explain the
    concept generally AND explicitly say the data doesn't include it, never
    imply a value exists."""
    _patch_asset_lookup(monkeypatch, "MSFT", {"ticker": "MSFT", "rsi": 55.0})  # no sharpe_ratio key
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_contextual_metric_explanation("MSFT", "Sharpe ratio", "fake-user-id")
    assert resp is not None
    assert "does not include" in resp.narration or "doesn't include" in resp.narration.lower() or "not include" in resp.narration.lower()
    assert "MSFT" in resp.narration
    # No fabricated numeric value anywhere in the response payload.
    assert "sharpe_ratio" not in resp.data


def test_missing_metric_none_value_treated_same_as_absent_key(monkeypatch):
    _patch_asset_lookup(monkeypatch, "MSFT", {"ticker": "MSFT", "sharpe_ratio": None})
    _patch_narration_client(monkeypatch, _EchoGroqClient())

    resp = api._ask_contextual_metric_explanation("MSFT", "Sharpe ratio", "fake-user-id")
    assert resp is not None
    assert "not include" in resp.narration.lower() or "doesn't include" in resp.narration.lower()


# ── 3. No grounding applies — fall through untouched ────────────────────────

def test_no_asset_returns_none():
    assert api._ask_contextual_metric_explanation(None, "RSI", "fake-user-id") is None


def test_no_metric_returns_none():
    assert api._ask_contextual_metric_explanation("GOOGL", None, "fake-user-id") is None


def test_unrecognised_metric_returns_none():
    """A metric with no data-field mapping (or no glossary entry) must fall
    through to the plain glossary/no-match path rather than half-answering."""
    assert api._ask_contextual_metric_explanation("GOOGL", "dividend yield", "fake-user-id") is None


def test_asset_lookup_failure_returns_none(monkeypatch):
    monkeypatch.setattr(api, "_resolve_asset", lambda _q: None)
    assert api._ask_contextual_metric_explanation("NOTREAL", "RSI", "fake-user-id") is None


# ── 4. End-to-end priority routing through ask_alphaswarm() ────────────────

def test_standalone_rsi_question_uses_plain_glossary(monkeypatch):
    """'What is RSI?' with no context at all — must be the plain glossary
    answer, never asset-grounded (there is no asset to ground it in)."""
    # No `context` on the request at all -> resolved_asset is None ->
    # _ask_contextual_metric_explanation short-circuits to None on its own
    # (no need to mock it away) -> falls through to the plain glossary path.
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "LEARNING_QUESTION")
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What is RSI?"), authorization="Bearer x"))
    assert resp.intent == "LEARNING_QUESTION"
    assert resp.source == "methodology_glossary"
    assert resp.data.get("term") == "rsi"


def test_high_rsi_educational_question_stays_learning_question(monkeypatch):
    """'What does high RSI mean?' is general education, not tied to any
    asset — must remain LEARNING_QUESTION and not require asset data."""
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "LEARNING_QUESTION")
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What does high RSI mean?"), authorization="Bearer x"))
    assert resp.intent == "LEARNING_QUESTION"
    assert resp.data.get("term") == "rsi"


def test_contextual_follow_up_grounds_through_full_flow(monkeypatch):
    """'What does its RSI mean?' with active_asset=GOOGL in context, routed
    through the real ask_alphaswarm() — must return the grounded response,
    not the plain glossary text, even though the classifier (stubbed here)
    still says LEARNING_QUESTION exactly as it does today."""
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "LEARNING_QUESTION")
    _patch_asset_lookup(monkeypatch, "GOOGL", {"ticker": "GOOGL", "rsi": 37.94})
    _patch_narration_client(monkeypatch, _EchoGroqClient())
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="What does its RSI mean?", context=_ctx(active_asset="GOOGL")),
        authorization="Bearer x",
    ))
    assert resp.intent == "LEARNING_QUESTION"
    assert resp.data.get("ticker") == "GOOGL"
    assert resp.data.get("rsi") == 37.94


def test_missing_metric_follow_up_through_full_flow(monkeypatch):
    """'What does its Sharpe ratio mean?' with active_asset=MSFT but no
    sharpe_ratio in MSFT's data — full flow must return the missing-data
    grounded response, not silently fall back to plain glossary text."""
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "LEARNING_QUESTION")
    _patch_asset_lookup(monkeypatch, "MSFT", {"ticker": "MSFT", "rsi": 50.0})
    _patch_narration_client(monkeypatch, _EchoGroqClient())
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="What does its Sharpe ratio mean?", context=_ctx(active_asset="MSFT")),
        authorization="Bearer x",
    ))
    assert resp.intent == "LEARNING_QUESTION"
    assert "MSFT" in resp.narration
    assert "not include" in resp.narration.lower() or "doesn't include" in resp.narration.lower()


def test_no_context_rsi_follow_up_asks_for_clarification(monkeypatch):
    """'What does its RSI mean?' as the very first message — an empty
    AskContext (no active_asset, no candidates — exactly what the frontend's
    buildAskContext([]) produces before any turn exists) must hit the
    existing safe clarification path, never reach the classifier or invent
    an asset."""
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)

    def _boom(_q):
        raise AssertionError("classifier must not run when reference resolution needs to clarify")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)
    _patch_fake_auth(monkeypatch)

    import asyncio
    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="What does its RSI mean?", context=_ctx()), authorization="Bearer x",
    ))
    assert resp.intent == "UNKNOWN"
    assert resp.is_blocked is False


def test_safety_still_blocked_with_active_asset_context(monkeypatch):
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)

    def _boom(_q):
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
