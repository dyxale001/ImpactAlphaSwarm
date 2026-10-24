"""Tests for one fund's reasoning trace on its own page (src/funds/trace.py).

The personal half is worked out by rules, so it is tested against the real
``FundMatcher`` with a real profile: "among your matches" or "not, and here is the
rule" must agree with what the Funds page would show. The written half is tested
on what it may not say, with the Compare paragraph's own guard.

Nothing external is touched. Groq and the fund repository are fakes, and the
trace never reaches the database.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.compare.config import CompareConfig  # noqa: E402
from src.compare.funds_trace import FundComparisonGuard  # noqa: E402
from src.compare.trace import COMPARATIVE_PATTERNS, SUITABILITY_PATTERNS  # noqa: E402
from src.funds import routes  # noqa: E402
from src.funds.matcher import FundMatcher  # noqa: E402
from src.funds.models import FundCandidate, Goals, Profile  # noqa: E402
from src.funds.trace import (  # noqa: E402
    FundTraceFactsBlock,
    FundTraceGenerator,
    FundTracePromptBuilder,
    FundTraceService,
    FundTraceTemplate,
)
from src.quant.trace import FORBIDDEN_PATTERNS  # noqa: E402

TODAY = datetime.date(2026, 10, 12)
USER = "user-1"


def cfg(**overrides) -> CompareConfig:
    base = dict(trace_enabled=True, trace_max_chars=1500, trace_min_chars=40, trace_daily_limit=25)
    base.update(overrides)
    return CompareConfig(**base)


def fund(fid, name, code, vehicle, category, tracker, tfsa=True):
    return {
        "id": fid,
        "isin": f"ZAE{fid}",
        "name": name,
        "jse_code": code,
        "vehicle": vehicle,
        "fund_house": "Coronation" if code is None else "Satrix",
        "manco": "House",
        "asisa_category": category,
        "is_index_tracker": tracker,
        "tfsa_eligible": tfsa,
    }


def sheet(level, ter, tic, term, perf, as_of="2026-08-31", benchmark="ASISA category average", **extra):
    return {
        "as_of": as_of,
        "risk_indicator_1to5": level,
        "risk_indicator_raw": {3: "Moderate", 4: "Moderate to High"}.get(level),
        "ter": ter,
        "tic": tic,
        "recommended_min_term_years": term,
        "performance": perf,
        "benchmark": benchmark,
        "regulation_28": True,
        **extra,
    }


FUNDS = {
    # Rated 3, a category Moderate covers, 5-year term inside 8 years, tax-free eligible: matched.
    "f-coro": (
        fund("f-coro", "Coronation Balanced Plus Fund (P)", None, "unit_trust", "South African - Multi Asset - High Equity", False),
        sheet(
            3,
            1.15,
            1.33,
            5,
            {"1y": 5.9, "3y": 13.2, "5y": 11.2, "10y": 9.4},
            asset_allocation={
                "International equities": 38.7,
                "Domestic equities": 36.0,
                "Domestic bonds": 14.2,
                "Domestic real estate": 6.4,
                "Domestic cash": 1.6,
            },
            distribution_frequency="Semi-annually (March & September)",
        ),
    ),
    # Rated 4, above a Moderate profile's ceiling of 3.
    "f-stx40": (
        fund("f-stx40", "Satrix 40 ETF", "STX40", "etf", "South African - Equity - SA General", True),
        sheet(4, 0.1, 0.12, 5, {"1y": 20.1, "3y": 12.3}, benchmark="FTSE/JSE Top 40"),
    ),
    # No sheet at all.
    "f-bare": (fund("f-bare", "Unrated Fund", "UNRTD", "etf", "Global - Equity - General", True), None),
}

PROFILE = Profile(
    user_id=USER,
    risk_tolerance="Moderate",
    goals=Goals(horizon_target_year=2034, purpose="growth", account_type="tfsa"),
)

# The same reader saving for an income, which narrows the categories in play.
INCOME_PROFILE = Profile(
    user_id=USER,
    risk_tolerance="Moderate",
    goals=Goals(horizon_target_year=2034, purpose="income", account_type="tfsa"),
)


class FakeFundRepo:
    def __init__(self):
        self.sheets = {k: v[1] for k, v in FUNDS.items()}

    def get(self, fund_id):
        entry = FUNDS.get(fund_id)
        return dict(entry[0]) if entry else None

    def snapshots(self, fund_id):
        s = self.sheets.get(fund_id)
        return [dict(s)] if s else []

    def candidates(self, filters=None):
        return [
            FundCandidate(fund=dict(f), snapshot=dict(self.sheets[k]) if self.sheets[k] else None)
            for k, (f, _) in FUNDS.items()
        ]


class FakeProfiles:
    def __init__(self, profiles=None):
        self.profiles = {USER: PROFILE} if profiles is None else profiles

    def profile(self, user_id):
        return self.profiles.get(user_id)


class FakeFundsService:
    def __init__(self, profiles=None):
        self.funds = FakeFundRepo()
        self.profiles = FakeProfiles(profiles)
        self.matcher = FundMatcher(clock=lambda: TODAY)


class FakeClient:
    model = "fake-model"

    def __init__(self, reply):
        self.reply = reply
        self.calls = 0

    def complete(self, prompt):
        self.calls += 1
        self.prompt = prompt
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


GOOD_REPLY = (
    "Coronation Balanced Plus Fund is a unit trust in South African multi asset high equity, actively managed. "
    "Its largest parts are international equities at 38.7 percent and domestic equities at 36 percent. "
    "It costs 1.33 percent a year in total. Its manager rates it 3 of 5 and suggests at least 5 years. "
    "Over 5 years it returned 11.2 percent, which describes the past. "
    "It is among your matches, because its rating sits within the 3 of 5 your Moderate profile allows."
)


def service(funds=None, client=None, config=None):
    config = config or cfg()
    return FundTraceService(
        config=config,
        funds=funds or FakeFundsService(),
        generator=FundTraceGenerator(config, client=client or FakeClient(GOOD_REPLY)),
        today=lambda: TODAY,
        now=lambda: datetime.datetime(2026, 10, 12, 9, tzinfo=datetime.timezone.utc),
    )


def evidence(fund_id="f-coro", funds=None):
    built = service(funds=funds).evidence(USER, fund_id)
    assert built is not None
    return built


# ─────────────────────────────────────────────────────────────────────────────

class TestEvidence:
    def test_a_unit_trust_is_named_without_its_share_class(self):
        assert evidence().fund.label == "Coronation Balanced Plus Fund"

    def test_a_listed_fund_is_named_by_its_jse_code(self):
        assert evidence("f-stx40").fund.label == "STX40"

    def test_the_largest_parts_are_kept_largest_first(self):
        rows = evidence().allocation
        assert [name for name, _ in rows] == [
            "International equities",
            "Domestic equities",
            "Domestic bonds",
            "Domestic real estate",
        ]

    def test_the_income_frequency_keeps_its_months(self):
        assert evidence().distribution == "semi-annually (March & September)"

    def test_a_fund_with_no_sheet_has_nothing_to_explain(self):
        assert not evidence("f-bare").has_evidence


@pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'
class TestPlacing:
    """The fund lands where the Funds page's own matcher puts it, for the reason it does."""

    def test_a_matched_fund_says_which_rules_it_passed(self):
        placing = evidence().placing
        assert placing is not None and placing.matched
        assert "3 of 5" in placing.because and "Moderate" in placing.because

    def test_a_rating_above_the_ceiling_is_the_reason(self):
        placing = evidence("f-stx40").placing
        assert placing is not None and not placing.matched
        assert "rates it 4 of 5, above the 3 of 5" in placing.because

    def test_no_profile_means_no_placing(self):
        ev = evidence(funds=FakeFundsService(profiles={}))
        assert ev.yours is None and ev.placing is None


class TestFactsBlock:
    def test_the_readers_answers_sit_beside_the_funds_figures(self):
        text = FundTraceFactsBlock().build(evidence())
        assert "a suggested minimum term of 5 years, and a goal 8 years away" in text
        assert "they chose a tax-free account, and this fund is eligible for one" in text

    def test_a_reader_saving_for_an_income_is_told_when_the_fund_pays_it(self):
        text = FundTraceFactsBlock().build(evidence(funds=FakeFundsService(profiles={USER: INCOME_PROFILE})))
        assert "investing for an income, and the fund pays income semi-annually (March & September)" in text

    def test_without_a_profile_it_says_there_is_no_match(self):
        text = FundTraceFactsBlock().build(evidence(funds=FakeFundsService(profiles={})))
        assert "no match to explain" in text
        assert "Beside the reader's answers" not in text

    def test_the_charge_is_given_with_its_parts(self):
        text = FundTraceFactsBlock().build(evidence())
        assert "Total investment charge: 1.33 percent a year, of which the total expense ratio (TER) is 1.15 percent" in text


class TestPrompt:
    def test_names_the_fund_and_forbids_the_words_the_guard_rejects(self):
        prompt = FundTracePromptBuilder().build(evidence())
        assert "Coronation Balanced Plus Fund" in prompt
        assert "hold, holds or holding" in prompt
        assert '"is among your matches"' in prompt

    def test_without_a_profile_it_asks_for_no_match_talk(self):
        prompt = FundTracePromptBuilder().build(evidence(funds=FakeFundsService(profiles={})))
        assert "Say nothing about matches" in prompt


class TestGuard:
    def guard(self):
        return FundComparisonGuard(cfg(), block=FundTraceFactsBlock())

    def test_a_grounded_paragraph_passes(self):
        assert self.guard().check(GOOD_REPLY, evidence()) is None

    def test_a_number_not_on_the_sheet_fails(self):
        reason = self.guard().check(GOOD_REPLY.replace("11.2", "12.4"), evidence())
        assert reason and "12.4" in reason

    def test_suitability_wording_fails(self):
        reason = self.guard().check(GOOD_REPLY + " It suits your profile.", evidence())
        assert reason and "suit" in reason

    def test_the_word_holds_fails(self):
        reason = self.guard().check(GOOD_REPLY.replace("Its largest parts are", "It holds"), evidence())
        assert reason and "holds" in reason

    def test_leaving_out_the_fund_fails(self):
        text = GOOD_REPLY.replace("Coronation Balanced Plus Fund", "This fund")
        reason = self.guard().check(text, evidence())
        assert reason and "leaves out" in reason


class TestTemplate:
    def text(self, fund_id="f-coro", funds=None):
        return FundTraceTemplate().render(evidence(fund_id, funds=funds))

    def test_says_the_placing_and_its_reason(self):
        text = self.text()
        assert "Coronation Balanced Plus Fund is among your matches, because" in text
        assert "Your Moderate profile is matched to funds rated up to 3 of 5." in text

    def test_an_unmatched_fund_says_why(self):
        assert "STX40 is not among your matches, because its manager rates it 4 of 5" in self.text("f-stx40")

    @pytest.mark.parametrize("fund_id", ["f-coro", "f-stx40"])
    def test_uses_no_word_the_guard_rejects(self, fund_id):
        for profiles in (None, {}):
            text = self.text(fund_id, funds=FakeFundsService(profiles=profiles))
            for pattern in FORBIDDEN_PATTERNS + COMPARATIVE_PATTERNS + SUITABILITY_PATTERNS:
                assert not pattern.search(text), (pattern.pattern, text)


class TestService:
    def test_explain_writes_a_checked_paragraph(self):
        point = service().explain(USER, "f-coro")
        assert point is not None
        assert point["source"] == "model" and point["trace"] == GOOD_REPLY
        assert point["personal"] is True
        assert point["model"] == "fake-model"

    def test_every_press_writes_a_fresh_paragraph(self):
        # Nothing is stored, so nothing is read back: each press is a new call.
        client = FakeClient(GOOD_REPLY)
        svc = service(client=client)
        svc.explain(USER, "f-coro")
        svc.explain(USER, "f-coro")
        assert client.calls == 2

    def test_nothing_is_written_to_the_database(self, monkeypatch):
        import src.utils.supabase_client as supabase_client

        def refuse(*args, **kwargs):
            raise AssertionError("the fund trace touched the database")

        monkeypatch.setattr(supabase_client, "supabase", type("Refuse", (), {"table": refuse})(), raising=False)
        assert service().explain(USER, "f-coro")["trace"] == GOOD_REPLY

    def test_without_a_profile_it_is_not_personal(self):
        point = service(funds=FakeFundsService(profiles={})).explain(USER, "f-coro")
        assert point["personal"] is False

    def test_a_rejected_paragraph_falls_back_to_the_template(self):
        point = service(client=FakeClient(GOOD_REPLY + " It suits you.")).explain(USER, "f-coro")
        assert point["source"] == "template"
        assert "is among your matches" in point["trace"]

    def test_a_failing_model_falls_back_to_the_template(self, monkeypatch):
        monkeypatch.setattr("src.compare.funds_trace.time.sleep", lambda s: None)
        point = service(client=FakeClient(RuntimeError("down"))).explain(USER, "f-coro")
        assert point["source"] == "template"

    def test_past_the_daily_limit_the_template_stands_in(self):
        client = FakeClient(GOOD_REPLY)
        point = service(client=client, config=cfg(trace_daily_limit=0)).explain(USER, "f-coro")
        assert point["source"] == "template" and client.calls == 0

    def test_off_means_no_paragraph_and_no_model_call(self):
        client = FakeClient(GOOD_REPLY)
        svc = service(client=client, config=cfg(trace_enabled=False))
        assert svc.explain(USER, "f-coro") is None
        assert client.calls == 0

    def test_a_fund_with_no_sheet_gets_no_paragraph(self):
        assert service().explain(USER, "f-bare") is None

    def test_an_unknown_fund_gets_no_paragraph(self):
        assert service().explain(USER, "nope") is None

    def test_on_by_default_with_no_flag_set(self, monkeypatch):
        monkeypatch.delenv("FUND_TRACES_ENABLED", raising=False)
        monkeypatch.delenv("COMPARE_TRACE_ENABLED", raising=False)
        from src.funds.trace import fund_trace_config

        assert fund_trace_config().trace_enabled is True

    def test_no_groq_key_still_gives_the_reader_a_paragraph(self):
        generator = FundTraceGenerator(cfg())
        generator._client, generator._client_built = None, True
        svc = FundTraceService(
            config=cfg(),
            funds=FakeFundsService(),
            generator=generator,
            today=lambda: TODAY,
        )
        point = svc.explain(USER, "f-coro")
        assert point["source"] == "template" and "is among your matches" in point["trace"]

    def test_uses_the_compare_paragraphs_groq_account(self):
        assert FundTraceGenerator.KEY_ENV == "GROQ_API_KEY7"
        assert FundTraceGenerator.FALLBACK_KEY_ENV == "GROQ_API_KEY4"


class TestRoutes:
    def client(self, svc):
        app = FastAPI()
        app.include_router(routes.router)

        async def user():
            return USER

        app.dependency_overrides[routes.current_user_id] = user
        app.dependency_overrides[routes.get_trace_service] = lambda: svc
        return TestClient(app)

    @pytest.mark.smoke  # tier: smoke -- one happy path per file (TESTING.md, 'Tiers')
    def test_post_writes_a_paragraph(self):
        body = self.client(service()).post("/api/fund-catalogue/f-coro/trace").json()
        assert body["trace"] == GOOD_REPLY and body["available"] is True and body["fund_id"] == "f-coro"

    def test_there_is_nothing_to_read_back(self):
        assert self.client(service()).get("/api/fund-catalogue/f-coro/trace").status_code in (404, 405)

    def test_off_answers_unavailable(self):
        body = self.client(service(config=cfg(trace_enabled=False))).post("/api/fund-catalogue/f-coro/trace").json()
        assert body["available"] is False and body["trace"] is None

    def test_a_malformed_id_is_a_400(self):
        assert self.client(service()).post("/api/fund-catalogue/x;drop/trace").status_code == 400
