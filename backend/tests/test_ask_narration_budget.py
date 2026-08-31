"""Ask AlphaSwarm — CONTEXT_SYNTHESIS narration token-budget regression tests.

Live bug: `_narrate_synthesis`/`_narrate_comparison` calls were observed
hitting `finish_reason="length"` at the old 350-token narration budget, and
GroqClient.complete() correctly raised EmptyCompletionError for it (fail
closed — the truncated reply is never returned). A live probe against real
Groq (openai/gpt-oss-20b) showed even a SUCCESSFUL run on rich single-asset
data using 344/350 output tokens (98% of budget, ~0 headroom), which is why
it was fragile enough to tip into truncation on ordinary variation.

The fix has two parts, both covered here:
  1. The CONTEXT_SYNTHESIS system prompts now carry a hard sentence/word cap
     ("HARD LENGTH LIMIT: ... at most 5 sentences ...") so typical output is
     well under budget instead of hugging the ceiling.
  2. _ASK_NARRATION_MAX_TOKENS moved 350 -> 450, a measured cushion (not an
     arbitrary large number) sized against the observed reasoning-token
     variance, not a blank check.

These tests are deterministic — no live Groq calls. Following this module's
existing convention (see test_ask_learning.py), a stub client stands in for
GroqClient so the truncation and success paths are testable without spending
real tokens or depending on exact model wording.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api  # noqa: E402
from src.utils.llm_client import EmptyCompletionError  # noqa: E402


# ── Stubs ────────────────────────────────────────────────────────────────

class _StubOkClient:
    """Stands in for a GroqClient whose call finished normally (finish=="stop")
    and stayed inside its token budget — the behaviour GroqClient.complete()
    exhibits on a successful call."""

    def __init__(self, text: str):
        self._text = text

    def complete(self, prompt: str) -> str:
        return self._text


class _StubTruncatedClient:
    """Stands in for a GroqClient whose call hit finish_reason=="length".
    GroqClient.complete() raises EmptyCompletionError in exactly this case
    (see llm_client.py) rather than returning the partial text — this stub
    reproduces that contract for callers that only depend on the interface."""

    def complete(self, prompt: str) -> str:
        raise EmptyCompletionError(
            "ask_narration: openai/gpt-oss-20b hit the token budget after "
            "1290 characters (reasoning_tokens=21). The reply is truncated "
            "and cannot be used."
        )


def _patch_narration_client(monkeypatch, client):
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: client)


_RICH_ASSET = {
    "ticker": "NVDA", "name": "NVIDIA Corporation", "universe": "US Tech",
    "current_price": 1850.32, "rank": 1, "confidence_score": 82.0,
    "signal_strength": 0.82, "signal_direction": "bullish", "convergence": 0.41,
    "convergence_state": "conflict", "data_sufficiency": 0.9, "profile_fit": 0.7,
    "rsi": 71.2, "beta": 1.6, "sharpe_ratio": 1.9, "volatility": 0.42,
    "macd": "bullish_crossover", "sentiment_score": 38.0, "news_count": 12,
    "mention_count": 340, "news_sentiment_score": 44.0, "social_sentiment_score": 20.0,
}


# ── 1. Normal completion within budget ─────────────────────────────────────

def test_context_synthesis_completes_successfully_within_budget(monkeypatch):
    """A normal (non-truncated) Groq reply is returned as-is."""
    _patch_narration_client(monkeypatch, _StubOkClient("NVDA's bullish technicals conflict with weaker sentiment."))
    result = api._narrate_synthesis("What are the downsides of NVDA?", _RICH_ASSET)
    assert result == "NVDA's bullish technicals conflict with weaker sentiment."


def test_context_synthesis_prompt_carries_hard_length_cap():
    """Regression guard for the actual fix: the CONTEXT_SYNTHESIS system
    prompts must state an explicit sentence/word budget, not rely on a vague
    'keep it concise' that a reasoning model can blow past. Asserts on the
    prompt text api.py sends, not on any LLM output."""
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    orig = api._get_ask_narration_client
    api._get_ask_narration_client = lambda: _CapturingClient()
    try:
        api._narrate_synthesis("why does X rank high", {"ticker": "X"})
        api._narrate_comparison("compare these", [{"ticker": "X"}, {"ticker": "Y"}])
    finally:
        api._get_ask_narration_client = orig

    assert "HARD LENGTH LIMIT" in seen["prompt"]


def test_narration_max_tokens_has_real_headroom():
    """The budget itself: 450 (up from 350) — regression guard so a future
    edit can't silently shrink it back under the measured 344/350 near-miss
    without a deliberate decision."""
    assert api._ASK_NARRATION_MAX_TOKENS == 450
    assert api._ASK_NARRATION_MAX_TOKENS > 350


# ── 2. Truncated narration is rejected (fail-closed) ───────────────────────

def test_truncated_single_asset_narration_is_rejected(monkeypatch):
    """GroqClient raising EmptyCompletionError on a truncated reply must
    surface as _narrate_synthesis returning None — never a partial string."""
    _patch_narration_client(monkeypatch, _StubTruncatedClient())
    result = api._narrate_synthesis("What are the downsides of NVDA?", _RICH_ASSET)
    assert result is None


def test_truncated_comparison_narration_is_rejected(monkeypatch):
    _patch_narration_client(monkeypatch, _StubTruncatedClient())
    result = api._narrate_comparison(
        "Compare these", [{"ticker": "NVDA"}, {"ticker": "MSFT"}]
    )
    assert result is None


# ── 3. No partial/truncated answer ever reaches the user ───────────────────

def test_context_synthesis_falls_back_to_no_data_message_on_truncation(monkeypatch):
    """End-to-end through _ask_context_synthesis: when narration is truncated
    (None), the AskResponse the API returns must carry the fixed
    _ASK_NO_DATA_MESSAGE, never any fragment of what Groq generated."""
    _patch_narration_client(monkeypatch, _StubTruncatedClient())
    monkeypatch.setattr(api, "_resolve_asset", lambda query: {"ticker": "NVDA"})
    monkeypatch.setattr(
        api, "_ask_analysis_explanation",
        lambda query, user_id: (_RICH_ASSET, "ai_recommendation"),
    )

    response = api._ask_context_synthesis("What are the downsides of NVDA?", "fake-user-id")

    assert response.narration == api._ASK_NO_DATA_MESSAGE
    assert response.intent == "CONTEXT_SYNTHESIS"
    # The rejected reply's characteristic text must not leak through.
    assert "1290 characters" not in response.narration
