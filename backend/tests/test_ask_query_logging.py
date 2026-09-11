"""/api/ask analytics instrumentation (Admin Reports Chatbot report):
- exactly one ask_query_logs row per request, regardless of internal retries
- fallback_used / validation_failed flags reflect what actually happened
- latency is recorded
- a logging failure never breaks the user-facing response
- raw prompt/answer text is never persisted

Deterministic throughout — no live Groq/Supabase calls. conftest.py's
autouse fixture normally no-ops api._log_ask_query; these tests re-patch it
(or api.supabase) themselves to inspect what would have been written.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api
from _fake_supabase import FakeSupabase

# Captured at collection time, before conftest's autouse fixture patches
# api._log_ask_query to a no-op for every test — tests that want to exercise
# the REAL function restore this reference explicitly.
_REAL_LOG_ASK_QUERY = api._log_ask_query

GOOGL = {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"}


def _patch_fake_auth(monkeypatch, user_id="fake-user-id"):
    async def _fake_auth(_authorization):
        return user_id
    monkeypatch.setattr(api, "_get_user_id_from_bearer", _fake_auth)


def _patch_rate_limit(monkeypatch):
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)


def _capture_logged_calls(monkeypatch):
    calls = []

    def _spy(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(api, "_log_ask_query", _spy)
    return calls


class _ScriptedGroqClient:
    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if not self.replies:
            raise AssertionError("no more scripted replies")
        return self.replies.pop(0)


def _run_ask(query="Tell me about GOOGL", context=None):
    return asyncio.run(api.ask_alphaswarm(api.AskRequest(query=query, context=context), authorization="Bearer x"))


# ── One row per request ─────────────────────────────────────────────────

def test_successful_request_logs_exactly_one_row(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch, "user-123")
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _ScriptedGroqClient(["GOOGL is around R5,345."]))
    calls = _capture_logged_calls(monkeypatch)

    _run_ask("Tell me about GOOGL")

    assert len(calls) == 1
    row = calls[0]
    assert row["user_id"] == "user-123"
    assert row["success"] is True
    assert row["fallback_used"] is False
    assert row["validation_failed"] is False
    assert isinstance(row["latency_ms"], int) and row["latency_ms"] >= 0


def test_recovery_repair_attempt_does_not_create_a_second_log_row(monkeypatch):
    """A validation failure + one bounded repair is still ONE /api/ask
    request -> exactly one ask_query_logs row, never two."""
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "ai_recommendation"))
    stub = _ScriptedGroqClient(["GOOGL's price is R5.", "GOOGL's price is R5,345.07."])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)
    calls = _capture_logged_calls(monkeypatch)

    _run_ask("Tell me about GOOGL")

    assert len(stub.prompts) == 2  # the underlying repair mechanism is unchanged
    assert len(calls) == 1         # but only one analytics row for the whole request
    assert calls[0]["validation_failed"] is True
    assert calls[0]["fallback_used"] is False  # repair succeeded — no fallback text used


# ── fallback_used / validation_failed flags ─────────────────────────────

def test_validation_failure_and_fallback_both_flagged_when_repair_also_fails(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "ai_recommendation"))
    stub = _ScriptedGroqClient(["GOOGL's price is R5.", "GOOGL's price is R6."])  # both wrong
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)
    calls = _capture_logged_calls(monkeypatch)

    resp = _run_ask("Tell me about GOOGL")

    assert len(calls) == 1
    assert calls[0]["validation_failed"] is True
    assert calls[0]["fallback_used"] is True
    assert resp.narration is not None  # deterministic fallback still answered the user


def test_groq_unavailable_flags_fallback_without_validation_failure(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    calls = _capture_logged_calls(monkeypatch)

    _run_ask("Tell me about GOOGL")

    assert len(calls) == 1
    assert calls[0]["fallback_used"] is True
    assert calls[0]["validation_failed"] is False  # never reached the validator at all


def test_blocked_advice_question_logs_is_blocked_and_not_success(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    calls = _capture_logged_calls(monkeypatch)

    resp = _run_ask("Should I buy GOOGL?")

    assert resp.is_blocked is True
    assert len(calls) == 1
    assert calls[0]["success"] is False


# ── Latency ──────────────────────────────────────────────────────────────

def test_latency_is_recorded_in_milliseconds(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _ScriptedGroqClient(["ok"]))
    calls = _capture_logged_calls(monkeypatch)

    _run_ask("Tell me about GOOGL")

    assert calls[0]["latency_ms"] is not None


# ── Logging must never break /api/ask ───────────────────────────────────

def test_logging_failure_does_not_break_the_response(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_log_ask_query", _REAL_LOG_ASK_QUERY)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _ScriptedGroqClient(["ok"]))

    fake = FakeSupabase({"assets": []})  # _resolve_asset queries this; empty -> no match, no crash

    class _ExplodingTable:
        def insert(self, *_a, **_k):
            raise Exception("simulated Supabase outage")

    class _SelectivelyExplodingSupabase:
        def table(self, name):
            if name == "ask_query_logs":
                return _ExplodingTable()
            return fake.table(name)

    monkeypatch.setattr(api, "supabase", _SelectivelyExplodingSupabase())

    resp = _run_ask("Tell me about GOOGL")
    assert resp.narration == "ok"  # the user-facing response is unaffected


def test_log_write_raising_synchronously_is_still_swallowed(monkeypatch):
    """_log_ask_query itself must never propagate — belt-and-braces check
    directly on the function, not just through the endpoint."""
    class _ExplodingTable:
        def insert(self, *_a, **_k):
            raise Exception("boom")

    class _ExplodingSupabase:
        def table(self, _name):
            return _ExplodingTable()

    monkeypatch.setattr(api, "supabase", _ExplodingSupabase())
    _REAL_LOG_ASK_QUERY(
        user_id="u1", asset_symbol="GOOGL", intent="ASSET_SEARCH",
        success=True, fallback_used=False, validation_failed=False, latency_ms=10,
    )  # must not raise


# ── No raw prompt/answer persisted ──────────────────────────────────────

def test_no_raw_prompt_or_answer_text_is_ever_passed_to_the_logger(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "ai_recommendation"))
    secret_answer = "GOOGL is around R5,345, a uniquely identifiable sentence."
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _ScriptedGroqClient([secret_answer]))
    calls = _capture_logged_calls(monkeypatch)

    query = "Tell me about GOOGL in a very specific and unusual phrasing xyz123"
    resp = _run_ask(query)

    assert resp.narration == secret_answer  # sanity: the user still gets the real answer
    logged_values = list(calls[0].values())
    assert query not in logged_values
    assert secret_answer not in logged_values
    assert set(calls[0].keys()) == {
        "user_id", "asset_symbol", "intent", "success", "fallback_used", "validation_failed", "latency_ms",
    }


def test_ask_query_logs_insert_payload_has_no_text_columns(monkeypatch):
    """End-to-end through _log_ask_query's real body (not a spy): the actual
    dict handed to supabase.table(...).insert(...) must only ever contain
    the declared aggregate columns."""
    captured = {}

    class _CapturingTable:
        def insert(self, payload):
            captured.update(payload)
            return self

        def execute(self):
            return None

    class _CapturingSupabase:
        def table(self, _name):
            return _CapturingTable()

    monkeypatch.setattr(api, "supabase", _CapturingSupabase())
    _REAL_LOG_ASK_QUERY(
        user_id="u1", asset_symbol="GOOGL", intent="ASSET_SEARCH",
        success=True, fallback_used=False, validation_failed=False, latency_ms=42,
    )
    assert set(captured.keys()) == {
        "user_id", "asset_symbol", "intent", "success", "fallback_used", "validation_failed", "latency_ms",
    }
