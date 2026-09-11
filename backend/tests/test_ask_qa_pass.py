"""Ask AlphaSwarm — final QA pass regression tests.

Covers: out-of-scope banking/consumer questions no longer fall into the
PLATFORM_QUESTION methodology catch-all; personal-finance/advice-boundary
topics (Roth IRA, 401(k), debt payoff) are bounded deterministically and
never misrouted into the "could you name the asset or metric" clarification;
the whale-watching glossary entry; and the GOVERNMENT_FINANCIAL_EDUCATION
source category's jurisdiction tagging + advice-boundary independence.

Deterministic throughout — no live Groq/Supabase calls.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.api as api  # noqa: E402
from src.utils import educational_retrieval  # noqa: E402


def _patch_fake_auth(monkeypatch):
    async def _fake_auth(_authorization):
        return "fake-user-id"
    monkeypatch.setattr(api, "_get_user_id_from_bearer", _fake_auth)


def _patch_rate_limit(monkeypatch):
    monkeypatch.setattr(api, "_check_ask_rate_limit", lambda _uid: True)


def _ask(monkeypatch, query, **kwargs):
    _patch_rate_limit(monkeypatch)
    _patch_fake_auth(monkeypatch)
    return asyncio.run(api.ask_alphaswarm(api.AskRequest(query=query, **kwargs), authorization="Bearer x"))


# ── Out-of-scope (item 2) ───────────────────────────────────────────────

def test_checking_account_comparison_is_out_of_scope_not_methodology(monkeypatch):
    resp = _ask(
        monkeypatch,
        "What's the difference between the Basic Checking and Premium Checking account?",
    )
    assert resp.source != "platform_methodology"
    assert "Signal strength" not in resp.narration
    assert "four disclosed" not in resp.narration


def test_bank_balance_question_is_out_of_scope(monkeypatch):
    resp = _ask(monkeypatch, "What's my bank account balance?")
    assert resp.source != "platform_methodology"
    assert resp.is_blocked is False


def test_mortgage_rate_question_is_out_of_scope(monkeypatch):
    resp = _ask(monkeypatch, "What are current mortgage rates?")
    assert resp.source != "platform_methodology"


# ── Personal-finance / advice boundary (item 3) ─────────────────────────

def test_roth_ira_withdrawal_question_is_bounded_not_asset_clarification(monkeypatch):
    resp = _ask(
        monkeypatch,
        "How should I structure my Roth IRA withdrawal to avoid taxes?",
    )
    assert "name the asset or metric" not in resp.narration
    assert resp.is_blocked is True
    assert resp.intent == "UNSUPPORTED_FINANCIAL_ADVICE"


def test_bare_roth_ira_gets_clean_scope_response_not_asset_lookup(monkeypatch):
    resp = _ask(monkeypatch, "roth ira")
    assert "name the asset or metric" not in resp.narration
    assert resp.intent == "UNSUPPORTED_FINANCIAL_ADVICE"


def test_401k_allocation_is_bounded(monkeypatch):
    resp = _ask(monkeypatch, "Give me an exact 401(k) allocation.")
    assert resp.is_blocked is True


def test_pay_off_debt_with_savings_is_bounded(monkeypatch):
    resp = _ask(monkeypatch, "Should I use my savings to pay off debt?")
    assert resp.is_blocked is True


def test_which_investment_for_my_personal_situation_is_bounded(monkeypatch):
    resp = _ask(monkeypatch, "Which investment should I choose for my personal situation?")
    assert resp.is_blocked is True


# ── Existing advice boundary must not regress ───────────────────────────

def test_should_i_buy_nvidia_still_refused(monkeypatch):
    resp = _ask(monkeypatch, "Should I buy NVIDIA today?")
    assert resp.is_blocked is True
    assert resp.narration == api._ASK_NO_ADVICE_MESSAGE


def test_should_i_panic_sell_still_refused(monkeypatch):
    resp = _ask(monkeypatch, "Should I panic sell?")
    assert resp.is_blocked is True


# ── Government financial-education source category (item 4) ────────────

def test_government_financial_education_category_has_expected_domains():
    expected = {
        "fscamymoney.co.za", "investor.gov", "consumerfinance.gov",
        "moneyhelper.org.uk", "moneysmart.gov.au",
    }
    assert expected.issubset(educational_retrieval.GOVERNMENT_FINANCIAL_EDUCATION.keys())


def test_government_financial_education_jurisdictions_are_distinct():
    jur = educational_retrieval.government_education_jurisdiction
    assert jur("https://www.investor.gov/introduction-investing") == "United States"
    assert jur("https://www.fscamymoney.co.za/some-page") == "South Africa"
    assert jur("https://www.moneyhelper.org.uk/en") == "United Kingdom"
    assert jur("https://moneysmart.gov.au/") == "Australia"
    assert jur("https://example.com") is None


def test_government_education_domains_are_approved():
    for domain in educational_retrieval.GOVERNMENT_FINANCIAL_EDUCATION:
        assert educational_retrieval.is_approved_domain(f"https://{domain}/page")


def test_educational_source_never_overrides_advice_boundary(monkeypatch):
    """Naming an approved educational source inside the question must not
    bypass the advice boundary."""
    resp = _ask(
        monkeypatch,
        "According to Investor.gov, should I put my R50,000 into an S&P 500 ETF?",
    )
    assert resp.is_blocked is True


# ── Whale watching (item 5) ──────────────────────────────────────────────

def test_whale_watching_glossary_entry_exists_and_mentions_alphaswarm_feature():
    definition = api._ASK_GLOSSARY.get("whale watching")
    assert definition is not None
    assert "insider" in definition.lower() or "institutional" in definition.lower()


def test_what_is_whale_watching_uses_glossary(monkeypatch):
    resp = _ask(monkeypatch, "What is whale watching?")
    assert resp.source == "methodology_glossary"
    assert "whale" in resp.narration.lower()
