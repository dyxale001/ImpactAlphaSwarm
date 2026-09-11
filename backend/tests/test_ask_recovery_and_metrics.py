"""Ask AlphaSwarm — validation-failure recovery (bounded repair + grounded
fallback) and asset-specific metric routing ("what is MSFT's beta?" vs the
generic "what is beta?" glossary path).

Deterministic throughout — no live Groq/Supabase calls.
"""
from __future__ import annotations

import asyncio
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


def _patch_rate_limit(monkeypatch):
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)


class _ScriptedGroqClient:
    """Returns successive replies from a list, one per call — models an LLM
    whose FIRST answer is wrong and whose SECOND (repaired) answer is right,
    without any retry loop in the test itself."""
    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if not self.replies:
            raise AssertionError("no more scripted replies — an unexpected extra LLM call occurred")
        return self.replies.pop(0)


GOOGL = {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"}


# ── Recovery: repair mechanism ───────────────────────────────────────────

def test_wrong_price_is_caught_repaired_and_the_fix_reaches_the_user(monkeypatch):
    stub = _ScriptedGroqClient([
        "GOOGL's price is R5.",             # rejected: 5 != 5345.07
        "GOOGL's price is R5,345.07.",       # repaired: matches
    ])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    narration = api._narrate_ask("Tell me about GOOGL", str(GOOGL), validation_data=GOOGL)
    assert narration == "GOOGL's price is R5,345.07."
    assert len(stub.prompts) == 2  # one original + one repair, never a loop


def test_repair_prompt_supplies_only_trusted_structured_data(monkeypatch):
    stub = _ScriptedGroqClient(["GOOGL's price is R5.", "GOOGL's price is R5,345.07."])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    api._narrate_ask("Tell me about GOOGL", str(GOOGL), validation_data=GOOGL)

    repair_prompt = stub.prompts[1]
    assert "5345.0709" in repair_prompt
    assert "invent" in repair_prompt.lower()
    assert "predict" in repair_prompt.lower() or "recommend" in repair_prompt.lower()


def test_repair_is_attempted_at_most_once_then_deterministic_fallback(monkeypatch):
    """If the repaired answer STILL fails validation, no second repair is
    attempted — a deterministic, data-grounded sentence is used instead of
    exposing any internal validator language."""
    stub = _ScriptedGroqClient(["GOOGL's price is R5.", "GOOGL's price is R6."])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    narration = api._narrate_ask("Tell me about GOOGL", str(GOOGL), validation_data=GOOGL)

    assert len(stub.prompts) == 2  # never a third call
    assert narration is not None
    assert "5,345" in narration  # deterministic grounded fallback, built from trusted data (rounded)
    assert "AlphaSwarm price" not in narration
    assert "UNSUPPORTED_NUMERICAL_CLAIM" not in narration
    assert "validation" not in narration.lower()


def test_recovery_is_skipped_when_there_is_no_structured_data_to_ground_it(monkeypatch):
    stub = _ScriptedGroqClient(["you should buy this stock"])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    narration = api._narrate_ask("What is beta?", "{}", validation_data=None)
    assert narration is None
    assert len(stub.prompts) == 1  # no repair attempt made


def test_groq_unavailable_still_returns_grounded_fallback(monkeypatch):
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    narration = api._narrate_ask("Tell me about GOOGL", str(GOOGL), validation_data=GOOGL)
    assert narration is not None
    assert "5,345" in narration
    assert "AlphaSwarm price" not in narration


def test_comparison_repair_failure_falls_back_to_deterministic_multi_asset_text(monkeypatch):
    """When BOTH the comparison narration and its one repair attempt fail
    validation, _narrate_comparison must now return a deterministic,
    data-grounded sentence (not None / not the old generic fallthrough)."""
    stub = _ScriptedGroqClient([
        "GOOGL is R500 and MSFT is R6,418.",   # rejected: GOOGL wrong
        "GOOGL is R600 and MSFT is R6,418.",   # repair still wrong -> no third call
    ])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    assets = [
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"},
        {"ticker": "MSFT", "current_price": 6418.18, "currency": "ZAR"},
    ]
    narration = api._narrate_comparison("Compare these", assets)

    assert len(stub.prompts) == 2  # exactly one repair, never a third call
    assert narration is not None
    assert "GOOGL" in narration and "MSFT" in narration
    assert "5,345" in narration and "6,418" in narration


def test_comparison_groq_unavailable_returns_deterministic_fallback(monkeypatch):
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    assets = [
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"},
        {"ticker": "MSFT", "current_price": 6418.18, "currency": "ZAR"},
    ]
    narration = api._narrate_comparison("Compare these", assets)
    assert narration is not None
    assert "GOOGL" in narration and "MSFT" in narration


def test_validator_itself_still_rejects_bad_numbers():
    from src.utils.ask_output_validator import validate_ask_output
    result = validate_ask_output("GOOGL has a beta of 2.73.", data={"ticker": "GOOGL", "beta": 1.14})
    assert not result.valid


def test_normal_path_makes_exactly_one_groq_call(monkeypatch):
    """A VALID narration must never trigger a second (repair) Groq call."""
    stub = _ScriptedGroqClient(["GOOGL's RSI is currently in the neutral range, near 38."])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    narration = api._narrate_ask("What is GOOGL's RSI?", str(GOOGL), validation_data={"ticker": "GOOGL", "rsi": 37.9358})
    assert narration == "GOOGL's RSI is currently in the neutral range, near 38."
    assert len(stub.prompts) == 1


def test_ordinary_conversational_question_about_asset_quality_not_blocked(monkeypatch):
    """'Is GOOGL doing well?' style questions must not be treated as
    financial advice or numerically over-scrutinised — a qualitative,
    data-grounded answer with no fabricated number should pass untouched."""
    stub = _ScriptedGroqClient([
        "GOOGL's data shows a neutral RSI and a beta close to the market average, "
        "so its recent price moves have been fairly typical for the sector."
    ])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    narration = api._narrate_ask("Is GOOGL doing well?", str(GOOGL), validation_data=GOOGL)
    assert narration is not None
    assert len(stub.prompts) == 1  # passed on the first attempt, no repair needed


def test_why_is_rsi_low_qualitative_explanation_not_blocked(monkeypatch):
    stub = _ScriptedGroqClient([
        "GOOGL's RSI is on the lower side of AlphaSwarm's neutral range, which typically "
        "reflects recent selling pressure rather than a prediction of future moves."
    ])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    narration = api._narrate_ask(
        "Why is GOOGL's RSI low?", str(GOOGL), validation_data={"ticker": "GOOGL", "rsi": 37.9358},
    )
    assert narration is not None
    assert len(stub.prompts) == 1


def test_main_path_end_to_end_repair_reaches_the_user(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "assets"))
    stub = _ScriptedGroqClient(["GOOGL's price is R5.", "GOOGL's price is R5,345.07."])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="Tell me about GOOGL"), authorization="Bearer x"))
    assert resp.narration == "GOOGL's price is R5,345.07."


def test_main_path_never_exposes_internal_validator_language(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (GOOGL, "assets"))
    stub = _ScriptedGroqClient(["GOOGL's price is R5.", "GOOGL's price is R6."])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="Tell me about GOOGL"), authorization="Bearer x"))
    for forbidden in ("UNSUPPORTED_NUMERICAL_CLAIM", "validation_failed", "validator rejected"):
        assert forbidden not in resp.narration
    assert "GOOGL" in resp.narration


# ── Asset-specific metric routing vs. the educational path ─────────────────

def test_bare_metric_question_still_uses_generic_glossary(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_resolve_asset", lambda q: None)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "LEARNING_QUESTION")

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What is beta?"), authorization="Bearer x"))
    assert resp.source == "methodology_glossary"
    assert resp.data.get("ticker") is None


def test_educational_etf_question_unaffected(monkeypatch):
    """Originally asserted "the classifier is still reached exactly once" —
    a guard against a DIFFERENT bug (an asset/metric shortcut wrongly
    swallowing an educational question). A later round added a deterministic
    definitional-learning-question shortcut (_ASK_DEFINITIONAL_SHAPE_PATTERN
    + _ask_free_tier_learning_hit) specifically so well-grounded terms like
    ETF DON'T need the classifier at all — unlike SCHW/NVDA-style asset
    overview requests, the classifier proved unreliable for terse "what is
    X" phrasing, and ETF already has a real _ASK_GLOSSARY entry, so there's
    nothing for the classifier to add here. The safety property this test
    actually cares about — an ETF question is answered correctly and never
    mistaken for an asset/metric question — still holds and is asserted
    directly below; only the "classifier is the only path there" assumption
    changed, intentionally."""
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_resolve_asset", lambda q: None)

    calls = {"n": 0}

    def _count(_q):
        calls["n"] += 1
        raise AssertionError("classifier must not be needed for a well-grounded 'what is X' question")
    monkeypatch.setattr(api, "_classify_ask_intent", _count)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What is an ETF?"), authorization="Bearer x"))
    assert calls["n"] == 0  # deterministic shortcut resolved it, no classifier call needed
    assert resp.intent == "LEARNING_QUESTION"
    assert resp.data.get("ticker") is None  # never mistaken for an asset/metric question
    assert "etf" in resp.narration.lower() or "exchange" in resp.narration.lower()


def _stub_assets(monkeypatch, price_field_overrides=None):
    assets = [
        {"id": "1", "ticker": "MSFT", "name": "Microsoft Corporation", "universe": "Technology", "current_price": 6418.18},
        {"id": "2", "ticker": "GOOGL", "name": "Alphabet Inc.", "universe": "Technology", "current_price": 5345.0709},
        {"id": "3", "ticker": "META", "name": "Meta Platforms Inc.", "universe": "Technology", "current_price": 10197.51},
    ]

    def _resolve(q, tickers=assets):
        ql = q.upper()
        for a in tickers:
            if a["ticker"] in ql or (a.get("name") and a["name"].split()[0].upper() in ql):
                return a
        return None

    monkeypatch.setattr(api, "_resolve_asset", _resolve)

    overrides = price_field_overrides or {}

    def _fake_fetch(asset, user_id):
        base = {"ticker": asset["ticker"], "name": asset.get("name"), "current_price": asset.get("current_price"), "currency": "ZAR"}
        base.update(overrides.get(asset["ticker"], {}))
        return base, "ai_recommendation"

    monkeypatch.setattr(api, "_fetch_asset_analysis_data", _fake_fetch)
    return assets


def test_asset_specific_beta_question_never_reaches_the_classifier(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"MSFT": {"beta": 0.91}})

    def _boom(_q):
        raise AssertionError("asset-specific metric questions must be intercepted before classification")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What is Microsoft's beta?"), authorization="Bearer x"))
    assert "MSFT" in resp.narration
    assert "0.91" in resp.narration


def test_googl_beta_question_resolves_to_googl_not_generic_glossary(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"GOOGL": {"beta": 1.03}})
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: (_ for _ in ()).throw(AssertionError("must not classify")))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What is GOOGL's beta?"), authorization="Bearer x"))
    assert "GOOGL" in resp.narration
    assert "1.03" in resp.narration


def test_what_does_microsofts_beta_mean_grounds_in_actual_value(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"MSFT": {"beta": 0.91}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What does Microsoft's beta mean?"), authorization="Bearer x"))
    # Groq unavailable here -> the deterministic grounded fallback fires
    # (still correct and ticker-specific, just terser than a live narration
    # would be — see _deterministic_grounded_fallback).
    assert "MSFT" in resp.narration
    assert "0.91" in resp.narration


def test_meta_rsi_question_resolves_correctly(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"META": {"rsi": 61.2}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What is META's RSI?"), authorization="Bearer x"))
    assert "META" in resp.narration
    assert "61.2" in resp.narration


# ── "Tell me about X" uses more than just price when data is available ─────

def test_narrate_ask_prompt_instructs_multi_signal_coverage_not_price_only():
    """Regression guard for the shallow 'GOOGL's current AlphaSwarm price is
    R5,345.07' answer: the system prompt must explicitly tell the model not
    to collapse a general 'tell me about X' answer down to price alone when
    other metrics are present. Asserts on the prompt text sent, not on live
    output."""
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    rich_data = {
        "ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR",
        "rsi": 37.9358, "beta": 1.13896, "sentiment_score": 55, "confidence_score": 60,
    }
    monkeypatch_client = _CapturingClient()
    orig = api._get_ask_narration_client
    api._get_ask_narration_client = lambda: monkeypatch_client
    try:
        api._narrate_ask("Tell me about GOOGL", str(rich_data), validation_data=rich_data)
    finally:
        api._get_ask_narration_client = orig

    assert "price alone" in seen["prompt"].lower()
    # The full retrieved dict (not just price) must actually reach the prompt.
    assert "rsi" in seen["prompt"].lower()
    assert "beta" in seen["prompt"].lower()
    assert "sentiment_score" in seen["prompt"].lower()


def test_tell_me_about_googl_full_data_dict_reaches_narration(monkeypatch):
    """End-to-end: the ANALYSIS_EXPLANATION path must hand the narrator the
    FULL retrieved dict (all available metrics), not a price-only subset."""
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    rich_data = {
        "ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR",
        "rsi": 37.9358, "beta": 1.13896, "sentiment_score": 55, "confidence_score": 60,
    }
    monkeypatch.setattr(api, "_ask_analysis_explanation", lambda q, user_id: (rich_data, "ai_recommendation"))

    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "GOOGL is around R5,345, with an RSI near 37.9 and a beta of about 1.14."

    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="Tell me about GOOGL"), authorization="Bearer x"))
    assert "rsi" in seen["prompt"].lower()
    assert "beta" in seen["prompt"].lower()
    assert resp.narration != api._ASK_NO_DATA_MESSAGE


# ── Deterministic fallback quality: never price-only, never "AlphaSwarm price" ──
# Root-cause regression tests: manual UAT showed the responses reported as
# "shallow"/"price-only" were literally _deterministic_grounded_fallback
# output (Groq unavailable in that test session, not a prompt bug) — these
# test the fallback itself, independent of whether Groq is reachable.

GOOGL_RICH = {
    "ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR",
    "rsi": 37.935861810004596, "beta": 1.13896, "sentiment_score": 55, "confidence_score": 60,
}


def test_fallback_for_general_question_includes_more_than_just_price():
    text = api._deterministic_grounded_fallback("Tell me about GOOGL", GOOGL_RICH)
    assert text is not None
    assert "5,345" in text
    # At least one other signal beyond price must be present.
    assert "RSI" in text or "beta" in text


def test_fallback_for_qualitative_question_includes_more_than_just_price():
    text = api._deterministic_grounded_fallback("Is GOOGL doing well?", GOOGL_RICH)
    assert text is not None
    assert "5,345" in text
    assert "RSI" in text or "beta" in text


def test_fallback_never_says_alphaswarm_price():
    for question in ("Tell me about GOOGL", "Is GOOGL doing well?", "What is GOOGL's beta?"):
        text = api._deterministic_grounded_fallback(question, GOOGL_RICH)
        assert text is not None
        assert "AlphaSwarm price" not in text


def test_fallback_price_is_conversationally_rounded_not_exact_float():
    text = api._deterministic_grounded_fallback("Tell me about GOOGL", GOOGL_RICH)
    assert "5,345.0709" not in text
    assert "5,345" in text


def test_fallback_rsi_question_includes_interpretation_not_just_raw_value():
    """The exact regression: 'GOOGL's RSI is 37.935861810004596.' with no
    explanation must never happen again — the fallback must round the value
    and add AlphaSwarm's own documented band."""
    text = api._deterministic_grounded_fallback("Why is GOOGL's RSI low?", GOOGL_RICH)
    assert text is not None
    assert "37.935861810004596" not in text
    assert "37.94" in text
    assert "band" in text.lower()


def test_contextual_metric_explanation_fallback_includes_glossary_not_bare_number(monkeypatch):
    """End-to-end for the metric-shortcut path (_ask_contextual_metric_explanation):
    when Groq is unavailable, the fallback must still include the
    methodology explanation, not just a bare rounded number."""
    monkeypatch.setattr(api, "_resolve_asset", lambda q: {"id": "1", "ticker": "GOOGL"} if "GOOGL" in q.upper() else None)
    monkeypatch.setattr(
        api, "_fetch_asset_analysis_data",
        lambda asset, user_id: (dict(GOOGL_RICH), "ai_recommendation"),
    )
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = api._ask_contextual_metric_explanation("GOOGL", "RSI", "u1")
    assert resp is not None
    assert "37.935861810004596" not in resp.narration
    assert "momentum" in resp.narration.lower()  # from the RSI glossary definition
    assert "37.94" in resp.narration


def test_comparison_fallback_never_says_alphaswarm_price_and_is_rounded():
    assets = [
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"},
        {"ticker": "MSFT", "current_price": 6418.1753, "currency": "ZAR"},
    ]
    text = api._deterministic_grounded_comparison_fallback(assets)
    assert text is not None
    assert "AlphaSwarm price" not in text
    assert "5,345.0709" not in text and "6,418.1753" not in text
    assert "5,345" in text and "6,418" in text


def test_repair_prompt_forbids_markdown_formatting():
    """Root-cause regression: an observed comparison answer came back as a
    Markdown table/header dump. The repair prompt (unlike the original
    narration prompts) previously never explicitly forbade markdown — only
    validate_ask_output's CLAIM checks ran, which don't inspect formatting,
    so a validator-valid-but-markdown-formatted repair could reach the
    user."""
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    api._repair_narration_with_grounded_data(
        _CapturingClient(), "compare these", ["UNSUPPORTED_NUMERICAL_CLAIM: x"],
        comparison_assets=[{"ticker": "GOOGL", "current_price": 100}],
    )
    assert "no markdown" in seen["prompt"].lower()
    assert "no bullet" in seen["prompt"].lower() or "no headings" in seen["prompt"].lower()


def test_narration_prompt_data_is_rounded_for_the_model(monkeypatch):
    """The MODEL must never see a 15-decimal-place float (it just echoes
    it) — validation still checks the ORIGINAL unrounded trusted value."""
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())
    api._narrate_ask("Tell me about GOOGL", str(api._round_for_narration(GOOGL_RICH)), validation_data=GOOGL_RICH)
    assert "37.935861810004596" not in seen["prompt"]
    assert "37.94" in seen["prompt"]


# ── Qualitative-performance questions route to interpretation, not UNKNOWN ──

def test_is_googl_doing_well_does_not_fall_into_generic_clarification(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358, "beta": 1.13896}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    def _boom(_q):
        raise AssertionError("qualitative-performance questions must be intercepted before classification")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="Is GOOGL doing well?"), authorization="Bearer x"))
    assert resp.narration != (
        "I'm not quite sure what you'd like me to explain. Are you asking "
        "about a specific asset, one of the metrics, or the overall "
        "results? A few things I can help with:"
    )
    assert resp.intent == "CONTEXT_SYNTHESIS"


def test_how_is_googl_performing_routes_to_context_synthesis(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: (_ for _ in ()).throw(AssertionError("must not classify")))

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="How is GOOGL performing?"), authorization="Bearer x"))
    assert resp.intent == "CONTEXT_SYNTHESIS"


def test_bare_qualitative_wording_without_an_asset_is_unaffected(monkeypatch):
    """'How is that performing?' with no resolvable asset at all must not be
    force-routed anywhere new — falls through exactly as before."""
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    monkeypatch.setattr(api, "_resolve_asset", lambda q: None)
    calls = {"n": 0}

    def _count(_q):
        calls["n"] += 1
        return "UNKNOWN"
    monkeypatch.setattr(api, "_classify_ask_intent", _count)

    asyncio.run(api.ask_alphaswarm(api.AskRequest(query="How is that performing?"), authorization="Bearer x"))
    assert calls["n"] == 1  # classifier still reached — no resolved asset to shortcut on


# ── Comparison follow-up resolves "that" to the context asset ──────────────

def _fake_resolve_multiple(q, *args, **kwargs):
    candidates = [
        {"id": "1", "ticker": "GOOGL", "current_price": 5345.0709},
        {"id": "2", "ticker": "MSFT", "current_price": 6418.18},
    ]
    return [a for a in candidates if a["ticker"] in q.upper()]


def test_compare_that_with_msft_resolves_context_asset_not_msft_alone(monkeypatch):
    """Root-cause regression: 'How does that compare with MSFT?' after GOOGL
    was the active asset must resolve BOTH tickers, not silently drop 'that'
    and treat it as an MSFT-only question."""
    _stub_assets(monkeypatch)
    monkeypatch.setattr(api, "_resolve_multiple_assets", _fake_resolve_multiple)

    eq, clarification, resolved_asset, resolved_metric = api._resolve_conversational_reference(
        "How does that compare with MSFT?", _ctx(active_asset="GOOGL", recent_metric="beta"),
    )
    assert clarification is None
    assert "GOOGL" in eq and "MSFT" in eq
    assert "compare" in eq.lower()


def test_compare_that_with_msft_end_to_end_reaches_both_tickers(monkeypatch):
    _stub_assets(monkeypatch)
    monkeypatch.setattr(api, "_resolve_multiple_assets", _fake_resolve_multiple)
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)

    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "GOOGL is R5,345.07 and MSFT is R6,418.18."

    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())

    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="How does that compare with MSFT?", context=_ctx(active_asset="GOOGL", recent_metric="beta")),
        authorization="Bearer x",
    ))
    assert "GOOGL" in seen.get("prompt", "") and "MSFT" in seen.get("prompt", "")
    assert resp.narration != api._ASK_NO_DATA_MESSAGE


def test_comparison_prompt_forbids_inventing_a_metric_missing_for_one_asset():
    """Existing safety instruction — regression guard, not new behaviour."""
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    orig = api._get_ask_narration_client
    api._get_ask_narration_client = lambda: _CapturingClient()
    try:
        api._narrate_comparison("compare these", [{"ticker": "GOOGL", "beta": 1.14}, {"ticker": "MSFT"}])
    finally:
        api._get_ask_narration_client = orig

    assert "never guess" in seen["prompt"].lower() or "never claim the comparison is possible" in seen["prompt"].lower()


# ── Contextual metric follow-ups ────────────────────────────────────────────

def test_conversation_msft_then_its_beta(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"MSFT": {"beta": 0.91}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="What is its beta?", context=_ctx(active_asset="MSFT")),
        authorization="Bearer x",
    ))
    assert "MSFT" in resp.narration
    assert "0.91" in resp.narration


def test_conversation_googl_then_its_rsi(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"GOOGL": {"rsi": 42.5}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="What is its RSI?", context=_ctx(active_asset="GOOGL")),
        authorization="Bearer x",
    ))
    assert "GOOGL" in resp.narration
    assert "42.5" in resp.narration


def test_conversation_meta_beta_then_what_does_that_mean(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"META": {"beta": 1.22}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="What does that mean?", context=_ctx(active_asset="META", recent_metric="beta")),
        authorization="Bearer x",
    ))
    assert "META" in resp.narration
    assert "1.22" in resp.narration


def test_show_technology_assets_then_what_about_meta_then_price(monkeypatch):
    """'What about META?' names META explicitly and must not use stale
    context from anything earlier."""
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch)

    eq, clar, asset, metric = api._resolve_conversational_reference(
        "What about META?", _ctx(active_asset="MSFT"),
    )
    assert asset == "META"


# ── Semantic variants: RSI high/low, price phrasing, typo tolerance ────────

GOOGL_FULL = {
    "ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR",
    "rsi": 37.935861810004596, "beta": 1.13896, "sharpe_ratio": -2.6492,
    "sentiment_score": 55, "macd": "bearish_crossover",
}


def test_rsi_high_low_semantic_variants_resolve_asset_and_metric(monkeypatch):
    _stub_assets(monkeypatch)
    monkeypatch.setattr(api, "_resolve_multiple_assets", _fake_resolve_multiple)
    for q in [
        "is GOOGL's RSI high", "is GOOGL RSI high", "does GOOGL have a high RSI",
        "is GOOGL's RSI low", "is googls rsi high",
    ]:
        eq, clar, asset, metric = api._resolve_conversational_reference(q, None)
        assert asset == "GOOGL", q
        assert metric is not None and metric.upper() == "RSI", q


def test_googls_typo_without_apostrophe_resolves_ticker(monkeypatch):
    _stub_assets(monkeypatch)
    asset = api._resolve_asset("what is googls beta")
    assert asset is not None and asset["ticker"] == "GOOGL"


def test_natural_price_phrasing_resolves_to_price_metric(monkeypatch):
    _stub_assets(monkeypatch)
    monkeypatch.setattr(api, "_resolve_multiple_assets", _fake_resolve_multiple)
    for q in ["how much is GOOGL trading at", "what is GOOGL trading at", "what's GOOGL worth right now"]:
        eq, clar, asset, metric = api._resolve_conversational_reference(q, None)
        assert asset == "GOOGL", q
        assert metric == "price", q


def test_is_googl_rsi_high_end_to_end_never_reaches_classifier(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"GOOGL": {"rsi": 37.94}})
    monkeypatch.setattr(api, "_resolve_multiple_assets", _fake_resolve_multiple)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    def _boom(_q):
        raise AssertionError("RSI semantic-variant question must be intercepted before classification")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="is googls rsi high"), authorization="Bearer x"))
    assert resp.narration != api._ASK_NO_DATA_MESSAGE
    assert "37.94" in resp.narration


def test_how_much_is_googl_trading_at_end_to_end_resolves_price(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch)
    monkeypatch.setattr(api, "_resolve_multiple_assets", _fake_resolve_multiple)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="how much is GOOGL trading at"), authorization="Bearer x"))
    assert resp.narration != api._ASK_NO_DATA_MESSAGE
    assert "5,345" in resp.narration


# ── Causal "why" vs factual "what" for a metric ─────────────────────────────

def test_what_is_rsi_and_why_is_rsi_low_produce_different_answers(monkeypatch):
    monkeypatch.setattr(api, "_resolve_asset", lambda q: {"id": "1", "ticker": "GOOGL"})
    monkeypatch.setattr(api, "_fetch_asset_analysis_data", lambda asset, user_id: (dict(GOOGL_FULL), "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    value_resp = api._ask_contextual_metric_explanation("GOOGL", "RSI", "u1", "What is GOOGL's RSI?")
    causal_resp = api._ask_contextual_metric_explanation("GOOGL", "RSI", "u1", "Why is GOOGL's RSI low?")

    assert value_resp.narration != causal_resp.narration
    assert "37.94" in value_resp.narration
    assert "37.94" in causal_resp.narration
    assert "does not establish" in causal_resp.narration.lower() or "no specific cause" in causal_resp.narration.lower()
    # The causal answer must not invent a cause the data doesn't support.
    assert "investors are selling" not in causal_resp.narration.lower()
    assert "because investors" not in causal_resp.narration.lower()


def test_causal_why_question_prompt_forbids_inventing_a_cause(monkeypatch):
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    monkeypatch.setattr(api, "_resolve_asset", lambda q: {"id": "1", "ticker": "GOOGL"})
    monkeypatch.setattr(api, "_fetch_asset_analysis_data", lambda asset, user_id: (dict(GOOGL_FULL), "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())

    api._ask_contextual_metric_explanation("GOOGL", "RSI", "u1", "Why is GOOGL's RSI low?")
    assert "does not establish" in seen["prompt"].lower() or "not claim to know why" in seen["prompt"].lower()


# ── Qualitative synthesis differs genuinely from the general overview ──────

def test_qualitative_synthesis_fallback_differs_from_general_overview_fallback():
    """Root-cause regression: 'is X doing well?' used to return the exact
    same templated text as 'tell me about X' because both fell back through
    the SAME generic function. They must now be genuinely different."""
    general = api._deterministic_grounded_fallback("Tell me about GOOGL", GOOGL_FULL)
    qualitative = api._deterministic_qualitative_synthesis(GOOGL_FULL)
    assert general != qualitative
    assert "based on the available alphaswarm data" in qualitative.lower()


def test_qualitative_synthesis_classifies_signals_as_mixed():
    result = api._deterministic_qualitative_synthesis(GOOGL_FULL)
    assert result is not None
    assert "mixed" in result.lower()  # positive sentiment vs weak RSI/bearish MACD/negative Sharpe


def test_qualitative_synthesis_never_recommends():
    result = api._deterministic_qualitative_synthesis(GOOGL_FULL)
    from src.utils.ask_output_validator import validate_ask_output
    validation = validate_ask_output(result, data=GOOGL_FULL)
    assert validation.valid, validation.violations


def test_narrate_synthesis_uses_qualitative_fallback_not_generic_when_groq_unavailable(monkeypatch):
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    result = api._narrate_synthesis("Is GOOGL doing well?", GOOGL_FULL)
    assert result is not None
    assert "mixed" in result.lower() or "leans" in result.lower()


def test_is_googl_doing_well_and_tell_me_about_googl_give_different_fallback_text(monkeypatch):
    """End-to-end: the two questions must route to DIFFERENT handlers
    (_narrate_ask vs _narrate_synthesis) and therefore produce genuinely
    different fallback answers, not the same templated overview."""
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch, {"GOOGL": {"rsi": 37.94, "sharpe_ratio": -2.65, "macd": "bearish_crossover", "sentiment_score": 55}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    monkeypatch.setattr(api, "_classify_ask_intent", lambda _q: "ANALYSIS_EXPLANATION")
    monkeypatch.setattr(
        api, "_ask_analysis_explanation",
        lambda q, user_id: (api._fetch_asset_analysis_data({"ticker": "GOOGL"}, user_id)),
    )

    overview_resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="Tell me about GOOGL"), authorization="Bearer x"))
    qualitative_resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="Is GOOGL doing well?"), authorization="Bearer x"))

    assert overview_resp.narration != qualitative_resp.narration


# ── Comparison: natural prose, discloses missing comparable metrics ────────

def test_comparison_fallback_discloses_missing_metric_naturally():
    assets = [
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR", "beta": 1.13896},
        {"ticker": "MSFT", "current_price": 6418.18, "currency": "ZAR"},
    ]
    text = api._deterministic_grounded_comparison_fallback(assets)
    assert text is not None
    assert "GOOGL" in text and "MSFT" in text
    assert "doesn't currently have a beta value for MSFT" in text
    # No markdown/database-style formatting.
    assert "*" not in text and "#" not in text and "\n-" not in text


def test_comparison_fallback_uses_comparable_metric_when_both_have_it():
    assets = [
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR", "beta": 1.13896},
        {"ticker": "MSFT", "current_price": 6418.18, "currency": "ZAR", "beta": 0.9},
    ]
    text = api._deterministic_grounded_comparison_fallback(assets)
    assert "GOOGL's beta" in text and "MSFT's beta" in text


# ── "Which one looks stronger?" is comparison, not investment advice ───────

def test_which_looks_stronger_with_compare_context_resolves_as_comparison(monkeypatch):
    _stub_assets(monkeypatch)
    eq, clar, asset, metric = api._resolve_conversational_reference(
        "Which one looks stronger based on the available data?",
        _ctx(compare_assets=["GOOGL", "MSFT"]),
    )
    assert clar is None
    assert "GOOGL" in eq and "MSFT" in eq
    assert "compare" in eq.lower()


def test_which_looks_stronger_end_to_end_does_not_return_advice_refusal(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _stub_assets(monkeypatch)
    monkeypatch.setattr(api, "_resolve_multiple_assets", _fake_resolve_multiple)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(
            query="Which one looks stronger based on the available data?",
            context=_ctx(compare_assets=["GOOGL", "MSFT"]),
        ),
        authorization="Bearer x",
    ))
    assert resp.narration != api._ASK_NO_ADVICE_MESSAGE
    assert resp.is_blocked is False


# ── "AlphaSwarm price" must never appear in any generated/fallback text ────

def test_no_alphaswarm_price_phrase_anywhere_in_fallback_output():
    general = api._deterministic_grounded_fallback("Tell me about GOOGL", GOOGL_FULL)
    qualitative = api._deterministic_qualitative_synthesis(GOOGL_FULL)
    comparison = api._deterministic_grounded_comparison_fallback([
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"},
        {"ticker": "MSFT", "current_price": 6418.18, "currency": "ZAR"},
    ])
    for text in (general, qualitative, comparison):
        assert text is not None
        assert "AlphaSwarm price" not in text


# ── Validator: must-reject vs should-not-reject, unchanged principle ───────

def test_validator_rejects_materially_false_numerical_claims():
    from src.utils.ask_output_validator import validate_ask_output
    cases = [
        ("GOOGL's beta is 2.4.", {"ticker": "GOOGL", "beta": 1.14}),
        ("GOOGL's price is R12,000.", {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"}),
        ("GOOGL's RSI is 82.", {"ticker": "GOOGL", "rsi": 37.94}),
    ]
    for narration, data in cases:
        result = validate_ask_output(narration, data=data)
        assert not result.valid, narration


def test_validator_does_not_reject_valid_qualitative_interpretation():
    from src.utils.ask_output_validator import validate_ask_output
    data = {"ticker": "GOOGL", "beta": 1.13896, "rsi": 37.94}
    cases = [
        "RSI around 38 suggests relatively weak recent momentum.",
        "A beta of 1.14 is within AlphaSwarm's market band.",
        "The signals look mixed.",
        "The available data provides more evidence for GOOGL than MSFT.",
    ]
    for narration in cases:
        result = validate_ask_output(narration, data=data)
        assert result.valid, (narration, result.violations)


# ── RSI consistently classified as neutral (Part 2) ─────────────────────────

GOOGL_RSI_NEUTRAL = {
    "ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR",
    "rsi": 37.9358, "beta": 1.13896, "sharpe_ratio": -2.6492,
    "sentiment_score": 55, "macd": "bullish_crossover",
}


def test_rsi_37_94_classified_as_neutral_not_oversold():
    assert api._rsi_band(37.94) == "AlphaSwarm's neutral band, 30-70"
    assert "oversold" not in api._rsi_band(37.94).lower()


def test_metric_explanation_fallback_calls_rsi_neutral(monkeypatch):
    monkeypatch.setattr(api, "_resolve_asset", lambda q: {"id": "1", "ticker": "GOOGL"})
    monkeypatch.setattr(api, "_fetch_asset_analysis_data", lambda asset, user_id: (dict(GOOGL_RSI_NEUTRAL), "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = api._ask_contextual_metric_explanation("GOOGL", "RSI", "u1", "What is GOOGL's RSI?")
    assert "37.94" in resp.narration
    # The grounded value clause specifically must classify it as neutral —
    # the glossary DEFINITION legitimately lists all three band words when
    # explaining the scale, so this checks the value-specific sentence, not
    # the whole response.
    assert "GOOGL's current RSI is about 37.94 (AlphaSwarm's neutral band, 30-70)" in resp.narration


def test_rsi_high_low_questions_still_ground_in_the_neutral_value(monkeypatch):
    monkeypatch.setattr(api, "_resolve_asset", lambda q: {"id": "1", "ticker": "GOOGL"})
    monkeypatch.setattr(api, "_fetch_asset_analysis_data", lambda asset, user_id: (dict(GOOGL_RSI_NEUTRAL), "ai_recommendation"))
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    for q in ["Is GOOGL's RSI high?", "Is GOOGL's RSI low?"]:
        resp = api._ask_contextual_metric_explanation("GOOGL", "RSI", "u1", q)
        assert "37.94" in resp.narration
        assert "AlphaSwarm's neutral band, 30-70" in resp.narration


def test_narrate_ask_prompt_forbids_invented_rsi_gradations(monkeypatch):
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())
    api._narrate_ask("Tell me about GOOGL", str(GOOGL_RSI_NEUTRAL), validation_data=GOOGL_RSI_NEUTRAL)
    assert "slightly oversold" in seen["prompt"].lower()  # named as the explicit example to avoid
    assert "neutral" in seen["prompt"].lower()


def test_qualitative_synthesis_states_neutral_band_not_bullish_or_bearish():
    result = api._deterministic_qualitative_synthesis(GOOGL_RSI_NEUTRAL)
    assert "neutral" in result.lower()
    assert "bullish rsi" not in result.lower()
    assert "bearish rsi" not in result.lower()


# ── "Which one looks stronger?" — data availability != strength (Part 4) ────

def test_comparison_prompt_forbids_equating_more_data_with_being_stronger(monkeypatch):
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())
    api._narrate_comparison("Which one looks stronger?", [{"ticker": "GOOGL", "beta": 1.14}, {"ticker": "MSFT"}])
    assert "not the same as" in seen["prompt"].lower() or "not.. the same as" in seen["prompt"].lower()
    assert "more data" in seen["prompt"].lower() or "more available signals" in seen["prompt"].lower()


def test_comparison_fallback_never_declares_a_winner_from_data_availability_alone():
    """Even with a lopsided dataset (GOOGL rich, MSFT price-only), the
    DETERMINISTIC fallback must never say one is 'stronger' — it only
    states facts and discloses the gap."""
    assets = [
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR", "beta": 1.13896},
        {"ticker": "MSFT", "current_price": 6418.18, "currency": "ZAR"},
    ]
    text = api._deterministic_grounded_comparison_fallback(assets)
    assert text is not None
    assert "stronger" not in text.lower()
    assert "better" not in text.lower()


# ── Price comparison wording is precise, not value-implying (Part 5) ───────

def test_comparison_fallback_price_wording_does_not_say_cheaper_option():
    assets = [
        {"ticker": "GOOGL", "current_price": 5345.0709, "currency": "ZAR"},
        {"ticker": "MSFT", "current_price": 6418.18, "currency": "ZAR"},
    ]
    text = api._deterministic_grounded_comparison_fallback(assets)
    assert "cheaper option" not in text.lower()
    assert "5,345" in text and "6,418" in text


def test_comparison_prompt_uses_precise_share_price_wording(monkeypatch):
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())
    api._narrate_comparison("Compare GOOGL and MSFT", [{"ticker": "GOOGL", "current_price": 5345.0709}, {"ticker": "MSFT", "current_price": 6418.18}])
    assert "cheaper option" not in seen["prompt"].lower() or "never call" in seen["prompt"].lower()
    assert "lower current share price" in seen["prompt"].lower()


# ── Beta explanation stays technically accurate (Part 6) ───────────────────

def test_beta_band_labels_match_documented_thresholds():
    assert api._beta_band(1.14) == "labelled 'market' by AlphaSwarm, 0.8-1.2"
    assert "low" in api._beta_band(0.5)
    assert "high" in api._beta_band(1.5)


def test_narrate_ask_prompt_distinguishes_beta_from_volatility(monkeypatch):
    seen = {}

    class _CapturingClient:
        def complete(self, prompt: str) -> str:
            seen["prompt"] = prompt
            return "ok"

    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: _CapturingClient())
    api._narrate_ask("What is GOOGL's beta?", str(GOOGL_RSI_NEUTRAL), validation_data=GOOGL_RSI_NEUTRAL)
    assert "not equate beta with volatility" in seen["prompt"].lower() or "never equate beta with volatility" in seen["prompt"].lower()
    assert "s&p 500" in seen["prompt"].lower()  # guidance on when it's allowed to name the benchmark


# ---------------------------------------------------------------------------
# Multi-intent Ask
#
# Root-cause regression: "what is an eft and what is an asset and googl
# rsi" used to be reduced to a single RSI definition because every routing
# branch (metric shortcut, classifier, glossary lookup) picks exactly ONE
# interpretation and returns immediately. _ask_multi_intent is a
# deterministic (no LLM used to split) supplement, checked before those
# single-intent shortcuts, that backs off (returns None) unless it can
# confidently resolve 2+ independent clauses -- so it can only ever ADD
# capability, never change existing single-intent behaviour.
# ---------------------------------------------------------------------------

def _multi_intent_assets(monkeypatch, overrides=None):
    assets = [
        {"id": "1", "ticker": "GOOGL", "name": "Alphabet Inc.", "current_price": 5345.0709},
        {"id": "2", "ticker": "MSFT", "name": "Microsoft Corporation", "current_price": 6418.18},
    ]

    def _resolve(q):
        ql = q.upper()
        for a in assets:
            if a["ticker"] in ql:
                return a
        return None

    monkeypatch.setattr(api, "_resolve_asset", _resolve)

    overrides = overrides or {}

    def _fetch(asset, user_id):
        base = {"ticker": asset["ticker"], "current_price": asset["current_price"], "currency": "ZAR"}
        base.update(overrides.get(asset["ticker"], {}))
        return base, "ai_recommendation"

    monkeypatch.setattr(api, "_fetch_asset_analysis_data", _fetch)


def test_three_part_query_answers_all_three_intents(monkeypatch):
    """The exact reported bug: ETF definition + asset definition + GOOGL's
    actual RSI, all three, not just the RSI definition."""
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.935861810004596}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = api._ask_multi_intent("what is an eft and whats an asset and googl rsi", None, "u1")
    assert resp is not None
    assert "etf" in resp.narration.lower()
    assert "asset" in resp.narration.lower()
    assert "37.94" in resp.narration
    assert "neutral" in resp.narration.lower()


def test_full_sentence_three_part_query_also_works(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is an ETF and what is an asset and what is GOOGL's RSI?", None, "u1")
    assert resp is not None
    assert "37.94" in resp.narration or "37.9" in resp.narration


def test_etf_plus_googl_rsi_two_part(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is an ETF and what is GOOGL's RSI?", None, "u1")
    assert resp is not None
    assert "etf" in resp.narration.lower()
    assert "37.94" in resp.narration or "37.9" in resp.narration


def test_asset_plus_googl_rsi_two_part(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is an asset and what is GOOGL's RSI?", None, "u1")
    assert resp is not None
    assert "37.94" in resp.narration or "37.9" in resp.narration


def test_rsi_definition_plus_googl_rsi_two_part(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is RSI and what is GOOGL's RSI?", None, "u1")
    assert resp is not None
    assert "momentum measure" in resp.narration.lower()
    assert "37.94" in resp.narration or "37.9" in resp.narration


def test_eft_typo_plus_googl_price(monkeypatch):
    _multi_intent_assets(monkeypatch)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("what is an eft and what is googl price", None, "u1")
    assert resp is not None
    assert "etf" in resp.narration.lower()
    assert "5,345" in resp.narration


def test_shorthand_googl_rsi_defers_to_existing_single_intent_pipeline(monkeypatch):
    """No 'and' at all -> _ask_multi_intent must back off entirely (return
    None) and let the pre-existing single-metric shortcut handle it."""
    _multi_intent_assets(monkeypatch)
    assert api._ask_multi_intent("GOOGL RSI", None, "u1") is None
    assert api._ask_multi_intent("what is googl rsi", None, "u1") is None
    assert api._ask_multi_intent("what does googl's rsi mean", None, "u1") is None
    assert api._ask_multi_intent("is googl's rsi high", None, "u1") is None


def test_bare_rsi_definition_alone_is_not_multi_intent(monkeypatch):
    assert api._ask_multi_intent("What is RSI?", None, "u1") is None


def test_two_asset_price_query_resolves_both(monkeypatch):
    _multi_intent_assets(monkeypatch)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is GOOGL's price and what is MSFT's price?", None, "u1")
    assert resp is not None
    assert "5,345" in resp.narration and "6,418" in resp.narration


def test_compare_googl_and_msft_defers_to_existing_comparison_pipeline(monkeypatch):
    _multi_intent_assets(monkeypatch)
    assert api._ask_multi_intent("Compare GOOGL and MSFT", None, "u1") is None


def test_which_looks_stronger_defers_to_existing_pipeline(monkeypatch):
    assert api._ask_multi_intent("Which one looks stronger based on the available data?", None, "u1") is None


def test_googl_rsi_and_is_it_high_stays_one_clause(monkeypatch):
    """'and is it high' doesn't independently resolve -> defers entirely,
    preserving the existing single-clause RSI-high handling."""
    _multi_intent_assets(monkeypatch)
    assert api._ask_multi_intent("What is GOOGL's RSI and is it high?", None, "u1") is None


def test_contextual_its_rsi_resolves_to_active_asset(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358, "beta": 1.13896}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    ctx = _ctx(active_asset="GOOGL", recent_metric="beta")
    resp = api._ask_multi_intent("What is beta and what is its current RSI?", ctx, "u1")
    assert resp is not None
    assert "GOOGL" in resp.narration
    assert "37.94" in resp.narration or "37.9" in resp.narration


def test_contextual_etf_and_its_beta_resolves_beta_to_active_asset(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"beta": 1.13896}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    ctx = _ctx(active_asset="GOOGL", recent_metric="beta")
    resp = api._ask_multi_intent("What is an ETF and what is its beta?", ctx, "u1")
    assert resp is not None
    assert "etf" in resp.narration.lower()
    assert "GOOGL" in resp.narration
    assert "1.14" in resp.narration


def test_multi_intent_validates_correct_negative_sharpe(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"sharpe_ratio": -2.649295}})
    stub = _ScriptedGroqClient([
        "An ETF is a basket of assets. GOOGL is trading around R5,345 and its Sharpe ratio is approximately -2.65.",
    ])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)
    resp = api._ask_multi_intent("what is an etf and what is googl's sharpe ratio", None, "u1")
    assert resp is not None
    assert "-2.65" in resp.narration
    assert len(stub.prompts) == 1


def test_multi_intent_rejects_and_recovers_from_wrong_sharpe_sign(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"sharpe_ratio": -2.649295}})
    stub = _ScriptedGroqClient([
        "GOOGL is trading around R5,345 and its Sharpe ratio is approximately 2.65.",
        "GOOGL is trading around R5,345 and its Sharpe ratio is approximately 2.7.",
    ])
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: stub)
    resp = api._ask_multi_intent("what is an etf and what is googl's sharpe ratio", None, "u1")
    assert resp is not None
    assert "-2.65" in resp.narration
    assert len(stub.prompts) == 2


def test_multi_intent_end_to_end_never_reaches_classifier(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    def _boom(_q):
        raise AssertionError("a resolved multi-intent query must not reach the classifier")
    monkeypatch.setattr(api, "_classify_ask_intent", _boom)

    resp = asyncio.run(api.ask_alphaswarm(
        api.AskRequest(query="what is an eft and whats an asset and googl rsi"), authorization="Bearer x",
    ))
    assert "37.94" in resp.narration


def test_existing_single_intent_queries_unaffected_by_multi_intent_addition(monkeypatch):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    _multi_intent_assets(monkeypatch, {"GOOGL": {"beta": 1.13896}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = asyncio.run(api.ask_alphaswarm(api.AskRequest(query="What is Microsoft's beta?"), authorization="Bearer x"))
    assert resp.narration != api._ASK_NO_DATA_MESSAGE


# ---------------------------------------------------------------------------
# Professor stress test — compound intents (comma/imperative separated, not
# just "and"), per-clause advice bounding, and cross-asset "both their X".
# _resolve_multiple_assets is also stubbed here (used by the comparison-
# clause resolver) in addition to _resolve_asset / _fetch_asset_analysis_data.
# ---------------------------------------------------------------------------

_MULTI_INTENT_ASSET_ROWS = [
    {"id": "1", "ticker": "GOOGL", "name": "Alphabet Inc.", "current_price": 5345.0709},
    {"id": "2", "ticker": "MSFT", "name": "Microsoft Corporation", "current_price": 6418.18},
]


def _multi_intent_assets_with_comparison(monkeypatch, overrides=None):
    _multi_intent_assets(monkeypatch, overrides)

    def _resolve_multi(q, limit=3):
        ql = q.upper()
        return [a for a in _MULTI_INTENT_ASSET_ROWS if a["ticker"] in ql][:limit]

    monkeypatch.setattr(api, "_resolve_multiple_assets", _resolve_multi)


def test_k_compound_query_answers_overview_comparison_etf_and_both_rsis(monkeypatch):
    """The main professor query (no advice clause): 'Tell me about GOOGL,
    compare it with MSFT, explain what an ETF is, tell me both their RSIs'
    -> GOOGL overview + GOOGL/MSFT comparison + ETF definition + both RSIs
    (MSFT's RSI unavailable in this fixture, so it must be stated as such,
    never fabricated)."""
    _multi_intent_assets_with_comparison(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = api._ask_multi_intent(
        "Tell me about GOOGL, compare it with MSFT, explain what an ETF is, tell me both their RSIs",
        None, "u1",
    )
    assert resp is not None
    assert "5,345" in resp.narration  # GOOGL overview
    assert "6,418" in resp.narration  # comparison mentions MSFT's price too
    assert "etf" in resp.narration.lower()
    assert "37.94" in resp.narration or "37.9" in resp.narration  # GOOGL RSI
    assert "does not include" in resp.narration.lower() and "MSFT" in resp.narration  # no fabricated MSFT RSI
    assert "should" not in resp.narration.lower()  # no advice clause present -> no refusal sentence needed


def test_l_compound_advice_query_answers_facts_and_bounds_advice(monkeypatch):
    """The full professor query WITH the advice clause must NOT be rejected
    wholesale — every factual/analytical clause is still answered, and only
    the advice clause gets the existing refusal sentence appended."""
    _multi_intent_assets_with_comparison(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)

    resp = api._ask_multi_intent(
        "Tell me about GOOGL, compare it with MSFT, explain what an ETF is, "
        "tell me both their RSIs, and tell me which one I should buy",
        None, "u1",
    )
    assert resp is not None
    assert "5,345" in resp.narration
    assert "etf" in resp.narration.lower()
    assert "37.94" in resp.narration or "37.9" in resp.narration
    assert api._ASK_NO_ADVICE_MESSAGE in resp.narration


def test_m_rsi_plus_should_i_buy_answers_rsi_and_bounds_advice(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is GOOGL's RSI and should I buy GOOGL?", None, "u1")
    assert resp is not None
    assert "37.94" in resp.narration or "37.9" in resp.narration
    assert api._ASK_NO_ADVICE_MESSAGE in resp.narration


def test_n_compare_and_which_should_i_buy_answers_comparison_and_bounds_advice(monkeypatch):
    """Regression for the comparison-pair remerge fix: naive 'and'-splitting
    would otherwise tear 'Compare GOOGL and MSFT' into 'Compare GOOGL' / 'MSFT'
    before the comparison clause ever saw both tickers together."""
    _multi_intent_assets_with_comparison(monkeypatch)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("Compare GOOGL and MSFT and tell me which I should buy.", None, "u1")
    assert resp is not None
    assert "5,345" in resp.narration and "6,418" in resp.narration
    assert api._ASK_NO_ADVICE_MESSAGE in resp.narration


def test_o_etf_plus_should_i_buy_answers_etf_and_bounds_advice(monkeypatch):
    _multi_intent_assets(monkeypatch)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is an ETF and should I buy GOOGL?", None, "u1")
    assert resp is not None
    assert "etf" in resp.narration.lower()
    assert api._ASK_NO_ADVICE_MESSAGE in resp.narration


def test_p_overview_plus_will_it_go_up_answers_overview_and_bounds_prediction(monkeypatch):
    _multi_intent_assets(monkeypatch)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("Tell me about GOOGL and will it go up tomorrow?", None, "u1")
    assert resp is not None
    assert "5,345" in resp.narration
    assert api._ASK_NO_ADVICE_MESSAGE in resp.narration


def test_q_context_beta_and_its_rsi_answers_both_for_active_asset(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358, "beta": 1.13896}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    ctx = _ctx(active_asset="GOOGL", recent_metric="beta")
    resp = api._ask_multi_intent("What is beta and what is its current RSI?", ctx, "u1")
    assert resp is not None
    assert "beta" in resp.narration.lower()
    assert "GOOGL" in resp.narration
    assert "37.94" in resp.narration or "37.9" in resp.narration


def test_r_multi_asset_rsi_query_resolves_both_tickers(monkeypatch):
    _multi_intent_assets(monkeypatch, {"GOOGL": {"rsi": 37.9358}, "MSFT": {"rsi": 55.2}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is GOOGL's RSI and MSFT's RSI?", None, "u1")
    assert resp is not None
    assert "37.94" in resp.narration or "37.9" in resp.narration
    assert "55.2" in resp.narration


def test_s_two_asset_price_query_already_covered_above(monkeypatch):
    # Same as test_two_asset_price_query_resolves_both; kept as an explicit
    # lettered alias so the professor test-plan's item S is traceable here.
    _multi_intent_assets(monkeypatch)
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What is GOOGL's price and what is MSFT's price?", None, "u1")
    assert resp is not None
    assert "5,345" in resp.narration and "6,418" in resp.narration


def test_t_beta_and_how_does_that_compare_stays_one_coherent_answer(monkeypatch):
    _multi_intent_assets_with_comparison(monkeypatch, {"GOOGL": {"beta": 1.13896}})
    monkeypatch.setattr(api, "_get_ask_narration_client", lambda: None)
    resp = api._ask_multi_intent("What's GOOGL's beta and how does that compare with MSFT?", None, "u1")
    assert resp is not None
    assert "1.14" in resp.narration
    assert "6,418" in resp.narration  # MSFT pulled into the comparison clause


def test_u_compare_googl_and_msft_still_defers_no_trailing_clause(monkeypatch):
    """Must remain exactly ONE comparison intent, deferring to the existing
    single-intent comparison pipeline — not split into GOOGL / MSFT."""
    _multi_intent_assets_with_comparison(monkeypatch)
    assert api._ask_multi_intent("Compare GOOGL and MSFT", None, "u1") is None


def test_v_which_looks_stronger_defers_to_existing_contextual_pipeline(monkeypatch):
    assert api._ask_multi_intent("Which one looks stronger based on available data?", None, "u1") is None


def test_w_how_does_that_compare_alone_defers_to_existing_contextual_pipeline(monkeypatch):
    assert api._ask_multi_intent("How does that compare with MSFT?", None, "u1") is None


def test_x_ambiguous_singular_pronoun_after_two_asset_context_is_not_multi_intent(monkeypatch):
    """'What is its RSI?' alone, after a two-asset context, has no 'and'/comma
    to decompose and must defer entirely rather than guessing an asset —
    the existing dangling-pronoun clarification path (outside
    _ask_multi_intent) is what must handle the actual disambiguation."""
    _multi_intent_assets(monkeypatch)
    assert api._ask_multi_intent("What is its RSI?", None, "u1") is None
