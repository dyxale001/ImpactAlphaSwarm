"""Tests for the Compare page's fund comparison (src/compare/funds_trace.py).

The personal half is worked out by rules, so it is tested against the real
``FundMatcher`` with a real profile: each fund's "among your matches" or "not, and
here is the rule" must agree with what the Funds page would show. The written half
is tested the way the stock paragraph is: on what it may not say.

Nothing external is touched. Groq, the store and the fund repository are fakes.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.compare import routes  # noqa: E402
from src.compare.config import CompareConfig  # noqa: E402
from src.compare.funds_trace import (  # noqa: E402
	FUNDS_HORIZON,
	FundComparisonGenerator,
	FundComparisonGuard,
	FundComparisonPromptBuilder,
	FundComparisonService,
	FundComparisonTemplate,
	fund_set_key,
	normalise_fund_ids,
)
from src.funds.matcher import FundMatcher  # noqa: E402
from src.funds.models import FundCandidate, Goals, Profile  # noqa: E402

TODAY = datetime.date(2026, 10, 7)
USER = "user-1"


def cfg(**overrides) -> CompareConfig:
	base = dict(trace_enabled=True, trace_max_chars=1500, trace_min_chars=40, trace_daily_limit=25)
	base.update(overrides)
	return CompareConfig(**base)


def fund(fid, name, code, vehicle, category, tracker, tfsa=True, benchmark=None):
	return {
		"id": fid,
		"isin": f"ZAE{fid}",
		"name": name,
		"jse_code": code,
		"vehicle": vehicle,
		"fund_house": "House",
		"manco": "House",
		"asisa_category": category,
		"is_index_tracker": tracker,
		"tfsa_eligible": tfsa,
	}


def sheet(level, ter, term, perf, as_of="2026-08-31", benchmark="FTSE/JSE Top 40"):
	return {
		"as_of": as_of,
		"risk_indicator_1to5": level,
		"ter": ter,
		"recommended_min_term_years": term,
		"performance": perf,
		"benchmark": benchmark,
		"regulation_28": False,
	}


FUNDS = {
	# Rated 4, above a Moderate profile's ceiling of 3.
	"f-stx40": (
		fund("f-stx40", "Satrix 40 ETF", "STX40", "etf", "South African - Equity - SA General", True),
		sheet(4, 0.1, 5, {"1y": 20.1, "3y": 12.3, "5y": 14.0}),
	),
	# Rated 3, a category Moderate covers, 5-year term inside 8 years, tax-free eligible: matched.
	"f-coro": (
		fund("f-coro", "Coronation Balanced Plus Fund", None, "unit_trust", "South African - Multi Asset - High Equity", False),
		sheet(3, 1.26, 5, {"1y": 15.2, "3y": 11.0}, benchmark="ASISA SA Multi Asset High Equity mean"),
	),
	# Rated 3 and in a covered category, but not tax-free eligible, and the reader chose a TFSA.
	"f-world": (
		fund("f-world", "Satrix MSCI World Feeder ETF", "STXWDM", "etf", "Global - Equity - General", True, tfsa=False),
		sheet(3, 0.35, 5, {"1y": 18.0, "3y": 15.5, "5y": 13.0}, benchmark="MSCI World"),
	),
	# Rated 3, SA general equity, actively managed: Moderate is matched to trackers only there.
	"f-active": (
		fund("f-active", "Active Equity Fund", None, "unit_trust", "South African - Equity - SA General", False),
		sheet(3, 1.1, 5, {"1y": 12.0}),
	),
	# No sheet at all, so no published rating.
	"f-bare": (fund("f-bare", "Unrated Fund", "UNRTD", "etf", "Global - Equity - General", True), None),
}

PROFILE = Profile(
	user_id=USER,
	risk_tolerance="Moderate",
	goals=Goals(horizon_target_year=2034, purpose="growth", account_type="tfsa"),
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
		return [FundCandidate(fund=dict(f), snapshot=dict(self.sheets[k]) if self.sheets[k] else None) for k, (f, _) in FUNDS.items()]


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


class FakeRepo:
	def __init__(self):
		self.rows: dict[tuple, dict] = {}
		self.writes: list[dict] = []

	def read(self, user_id, key, horizon):
		row = self.rows.get((user_id, key, horizon))
		return dict(row) if row else None

	def save(self, row):
		self.writes.append(row)
		self.rows[(row["user_id"], row["set_key"], row["horizon"])] = dict(row)
		return True

	def prune(self, before):
		pass


class FakeClient:
	model = "fake-model"

	def __init__(self, reply):
		self.reply = reply
		self.calls = 0

	def complete(self, prompt):
		self.calls += 1
		if isinstance(self.reply, Exception):
			raise self.reply
		return self.reply


GOOD_REPLY = (
	"STX40 tracks an index and costs 0.1 percent a year, while Coronation Balanced Plus Fund is actively "
	"managed and costs 1.26 percent. STX40 is rated 4 of 5 and Coronation Balanced Plus Fund 3 of 5. Over "
	"3 years their own yearly averages were 12.3 and 11 percent, which describe the past. Coronation "
	"Balanced Plus Fund is among your matches, because its rating sits within the 3 of 5 your Moderate "
	"profile allows. STX40 is not among your matches, because its rating of 4 is above that limit."
)


def service(funds=None, client=None, repo=None, config=None):
	config = config or cfg()
	return FundComparisonService(
		config=config,
		funds=funds or FakeFundsService(),
		repository=repo if repo is not None else FakeRepo(),
		generator=FundComparisonGenerator(config, client=client or FakeClient(GOOD_REPLY)),
		today=lambda: TODAY,
		now=lambda: datetime.datetime(2026, 10, 7, 9, tzinfo=datetime.timezone.utc),
	)


def evidence(*ids, funds=None):
	built = service(funds=funds).evidence(USER, list(ids or ("f-stx40", "f-coro")))
	assert built is not None
	return built[0]


# ─────────────────────────────────────────────────────────────────────────────

class TestKey:
	def test_order_does_not_change_the_key(self):
		assert fund_set_key(["b", "a"]) == fund_set_key(["a", "b"]) == "a|b"

	def test_ids_keep_order_and_drop_junk(self):
		assert normalise_fund_ids(["b", "a", "b", "", "x; drop"]) == ["b", "a"]


class TestPlacing:
	"""Each fund lands where the Funds page's own matcher puts it, for the reason it does."""

	def placings(self):
		ev = evidence("f-stx40", "f-coro", "f-world")
		return {k: v for k, v in ev.yours.placings.items()}

	def test_a_matched_fund_says_which_rules_it_passed(self):
		p = self.placings()["f-coro"]
		assert p.matched
		assert "3 of 5" in p.because and "Moderate" in p.because
		assert "5 years is within the 8 years to your goal" in p.because

	def test_a_rating_above_the_ceiling_is_the_reason(self):
		p = self.placings()["f-stx40"]
		assert not p.matched
		assert "rates it 4 of 5, above the 3 of 5" in p.because

	def test_a_tax_free_account_needs_an_eligible_fund(self):
		p = self.placings()["f-world"]
		assert not p.matched
		assert "tax-free account" in p.because

	def test_trackers_only_is_the_reason_for_an_active_fund(self):
		p = evidence("f-active", "f-coro").yours.placings["f-active"]
		assert not p.matched
		assert "index trackers only" in p.because

	def test_no_published_rating_is_the_reason(self):
		p = evidence("f-bare", "f-coro").yours.placings["f-bare"]
		assert not p.matched
		assert "publishes no risk rating" in p.because

	def test_matched_agrees_with_the_matcher(self):
		funds = FakeFundsService()
		outcome = funds.matcher.match(PROFILE, funds.funds.candidates())
		matched_ids = {m.fund_id for m in outcome.matches}
		ev = evidence("f-stx40", "f-coro", "f-world", funds=funds)
		for fid, p in ev.yours.placings.items():
			assert p.matched == (fid in matched_ids)

	def test_no_profile_means_nothing_personal(self):
		ev = evidence(funds=FakeFundsService(profiles={}))
		assert ev.yours is None


class TestGuard:
	def guard(self):
		return FundComparisonGuard(cfg())

	def test_a_grounded_paragraph_passes(self):
		assert self.guard().check(GOOD_REPLY, evidence()) is None

	@pytest.mark.parametrize(
		"bad",
		[
			"STX40 is the better choice",
			"STX40 is cheaper and safer",
			"Coronation Balanced Plus Fund suits you",
			"Coronation Balanced Plus Fund is right for you",
			"you should invest in STX40",
			"this is not advice",
			"you might consider STX40",
		],
	)
	def test_verdict_advice_and_suitability_are_refused(self, bad):
		reason = self.guard().check(GOOD_REPLY + " " + bad + ".", evidence())
		assert reason and "forbidden" in reason

	@pytest.mark.parametrize(
		"sentence",
		[
			"Its minimum term of 5 years fits your 8-year goal",
			"its suggested minimum term fits within your time to the goal",
		],
	)
	def test_the_term_fitting_the_goal_is_allowed(self, sentence):
		assert self.guard().check(GOOD_REPLY + " " + sentence + ".", evidence()) is None

	@pytest.mark.parametrize("sentence", ["STX40 fits your profile", "STX40 fits your goal", "STX40 fits you"])
	def test_fit_about_the_reader_is_still_refused(self, sentence):
		reason = self.guard().check(GOOD_REPLY + " " + sentence + ".", evidence())
		assert reason and "forbidden" in reason

	def test_a_paragraph_that_leaves_a_fund_out_is_refused(self):
		text = "STX40 costs 0.1 percent a year and is rated 4 of 5, as its own fact sheet says, which describes it."
		assert self.guard().check(text, evidence()) == "leaves out Coronation Balanced Plus Fund"

	def test_a_worked_out_number_is_refused(self):
		reason = self.guard().check(GOOD_REPLY + " That is a gap of 1.16 percent.", evidence())
		assert reason and "1.16" in reason


class TestTemplate:
	@pytest.mark.parametrize("ids", [("f-stx40", "f-coro"), ("f-coro", "f-world", "f-stx40"), ("f-active", "f-bare")])
	def test_the_template_passes_its_own_guard(self, ids):
		ev = evidence(*ids)
		text = FundComparisonTemplate().render(ev)
		assert FundComparisonGuard(cfg(trace_max_chars=4000)).check(text, ev) is None, text

	def test_the_template_says_where_each_fund_lands(self):
		text = FundComparisonTemplate().render(evidence("f-stx40", "f-coro"))
		assert "Coronation Balanced Plus Fund is among your matches" in text
		assert "STX40 is not among your matches" in text
		assert text.index("STX40") < text.index("Coronation")

	def test_without_a_profile_the_template_has_no_matches(self):
		text = FundComparisonTemplate().render(evidence(funds=FakeFundsService(profiles={})))
		assert "matches" not in text


class TestPrompt:
	def test_the_prompt_carries_the_rules_and_every_reason(self):
		prompt = FundComparisonPromptBuilder().build(evidence("f-stx40", "f-coro", "f-world"))
		for label in ("=== STX40 ===", "=== Coronation Balanced Plus Fund ===", "=== STXWDM ==="):
			assert label in prompt
		assert "Nothing scores or ranks the funds" in prompt
		assert "- STX40: not among the reader's matches, because" in prompt
		assert "Never say or imply that a fund suits" in prompt

	def test_only_common_return_periods_reach_the_prompt(self):
		prompt = FundComparisonPromptBuilder().build(evidence("f-stx40", "f-coro"))
		assert "3 years 12.3 percent" in prompt
		assert "5 years 14 percent" not in prompt


class TestService:
	def test_off_means_nothing(self):
		assert service(config=cfg(trace_enabled=False)).explain(USER, ["f-stx40", "f-coro"]) is None

	def test_a_paragraph_is_written_stored_and_read_back(self):
		repo = FakeRepo()
		svc = service(repo=repo)
		point = svc.explain(USER, ["f-coro", "f-stx40"])
		assert point["trace"] == GOOD_REPLY and point["source"] == "model" and point["personal"] is True
		row = repo.writes[0]
		assert row["horizon"] == FUNDS_HORIZON and row["set_key"] == "f-coro|f-stx40"
		assert svc.saved(USER, ["f-stx40", "f-coro"])["trace"] == GOOD_REPLY

	def test_a_new_fact_sheet_retires_the_paragraph(self):
		funds = FakeFundsService()
		svc = service(funds=funds)
		svc.explain(USER, ["f-stx40", "f-coro"])
		funds.funds.sheets["f-coro"] = {**funds.funds.sheets["f-coro"], "as_of": "2026-09-30"}
		assert svc.saved(USER, ["f-stx40", "f-coro"]) is None

	def test_changed_profile_answers_retire_the_paragraph(self):
		funds = FakeFundsService()
		svc = service(funds=funds)
		svc.explain(USER, ["f-stx40", "f-coro"])
		funds.profiles.profiles[USER] = Profile(user_id=USER, risk_tolerance="Aggressive", goals=PROFILE.goals)
		assert svc.saved(USER, ["f-stx40", "f-coro"]) is None

	def test_a_current_paragraph_is_never_paid_for_twice(self):
		client = FakeClient(GOOD_REPLY)
		svc = service(client=client)
		svc.explain(USER, ["f-stx40", "f-coro"])
		svc.explain(USER, ["f-coro", "f-stx40"])
		assert client.calls == 1

	def test_one_readers_paragraph_is_not_anothers(self):
		svc = service()
		svc.explain(USER, ["f-stx40", "f-coro"])
		assert svc.saved("user-2", ["f-stx40", "f-coro"]) is None

	def test_a_rejected_reply_falls_back_to_the_template(self):
		point = service(client=FakeClient(GOOD_REPLY + " STX40 suits you.")).explain(USER, ["f-stx40", "f-coro"])
		assert point["source"] == "template"
		assert "is among your matches" in point["trace"]

	def test_past_the_daily_limit_the_template_stands_in(self):
		client = FakeClient(GOOD_REPLY)
		funds = FakeFundsService()
		svc = service(funds=funds, client=client, config=cfg(trace_daily_limit=1))
		assert svc.explain(USER, ["f-stx40", "f-coro"])["source"] == "model"
		funds.funds.sheets["f-coro"] = {**funds.funds.sheets["f-coro"], "as_of": "2026-09-30"}
		assert svc.explain(USER, ["f-stx40", "f-coro"])["source"] == "template"

	def test_no_profile_is_not_personal(self):
		point = service(funds=FakeFundsService(profiles={}), client=FakeClient(RuntimeError("x"))).explain(USER, ["f-stx40", "f-coro"])
		assert point["personal"] is False

	def test_an_unknown_fund_means_no_paragraph(self):
		assert service().explain(USER, ["f-stx40", "nope"]) is None

	@pytest.mark.parametrize("ids", [["f-stx40"], ["f-stx40", "f-coro", "f-world", "f-active"]])
	def test_the_wrong_number_of_funds_means_no_paragraph(self, ids):
		assert service().explain(USER, ids) is None


@pytest.fixture
def client(monkeypatch):
	app = FastAPI()
	routes.mount_compare_routes(app)
	app.dependency_overrides[routes.current_user_id] = lambda: USER
	yield TestClient(app)
	monkeypatch.setattr(routes, "_fund_trace_instance", None)


def test_reading_back_before_asking_gives_no_paragraph(client, monkeypatch):
	monkeypatch.setattr(routes, "_fund_trace_instance", service())
	body = client.get("/api/compare/funds/trace?ids=f-stx40,f-coro").json()
	assert body["available"] is True and body["trace"] is None and body["fund_ids"] == ["f-stx40", "f-coro"]


def test_asking_writes_one_and_reading_back_finds_it(client, monkeypatch):
	monkeypatch.setattr(routes, "_fund_trace_instance", service())
	body = client.post("/api/compare/funds/trace", json={"fund_ids": ["f-coro", "f-stx40"]}).json()
	assert body["trace"] == GOOD_REPLY and body["horizon"] == FUNDS_HORIZON and body["personal"] is True
	again = client.get("/api/compare/funds/trace?ids=f-stx40,f-coro").json()
	assert again["trace"] == GOOD_REPLY


def test_the_endpoint_refuses_one_fund(client, monkeypatch):
	monkeypatch.setattr(routes, "_fund_trace_instance", service())
	assert client.get("/api/compare/funds/trace?ids=f-stx40").status_code == 400


def test_off_says_unavailable(client, monkeypatch):
	monkeypatch.setattr(routes, "_fund_trace_instance", service(config=cfg(trace_enabled=False)))
	body = client.get("/api/compare/funds/trace?ids=f-stx40,f-coro").json()
	assert body["available"] is False
