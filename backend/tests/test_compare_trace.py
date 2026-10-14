"""Tests for the Compare page's written comparison (src/compare/trace.py).

Like the quant trace's tests, these assert on what the paragraph may NOT do rather than on
its prose: quote a number it was not given, name a winner, tell the reader a stock suits
them, leave a stock out, be paid for twice, or be served after the page has moved on. Plus
what this page adds: the set is the key whatever order it was picked in, and one reader's
paragraph is never another's.

Nothing external is touched. Groq, the store, the runs and the windows are fakes.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.compare import routes  # noqa: E402
from src.compare.config import CompareConfig  # noqa: E402
from src.compare.trace import (  # noqa: E402
	ComparisonEvidence,
	ComparisonGenerator,
	ComparisonGuard,
	ComparisonPromptBuilder,
	ComparisonTemplate,
	ComparisonTraceService,
	RunPlacing,
	UserRun,
	UserRunReader,
	normalise_tickers,
	ordinal,
	set_key,
)
from src.quant.trace import QuantEvidence  # noqa: E402

TODAY = datetime.date(2026, 10, 7)
USER = "user-1"


def cfg(**overrides) -> CompareConfig:
	base = dict(trace_enabled=True, trace_max_chars=1500, trace_min_chars=40, trace_daily_limit=25)
	base.update(overrides)
	return CompareConfig(**base)


FACTS = {
	"AAPL": {
		"start": "2026-04-07",
		"end": "2026-10-06",
		"trading_days": 126,
		"first_close": 3604.8,
		"last_close": 4048.0,
		"change_pct": 12.4,
		"high": 4061.2,
		"high_date": "2026-10-02",
		"low": 3420.5,
		"low_date": "2026-06-11",
		"max_drawdown_pct": -9.8,
		"volatility_pct": 24.1,
		"latest_rsi": 66.0,
		"rsi_days_measured": 126,
		"days_rsi_overbought": 9,
		"days_rsi_oversold": 0,
	},
	"GOOGL": {
		"start": "2026-04-07",
		"end": "2026-10-06",
		"trading_days": 126,
		"first_close": 2996.9,
		"last_close": 2904.0,
		"change_pct": -3.1,
		"high": 3075.2,
		"high_date": "2026-05-14",
		"low": 2638.1,
		"low_date": "2026-08-20",
		"max_drawdown_pct": -14.2,
		"volatility_pct": 29.0,
		"latest_rsi": 37.0,
		"rsi_days_measured": 126,
		"days_rsi_overbought": 0,
		"days_rsi_oversold": 6,
	},
	"MSFT": {
		"start": "2026-04-07",
		"end": "2026-10-06",
		"trading_days": 126,
		"first_close": 7400.0,
		"last_close": 7400.0,
		"change_pct": 0.0,
		"high": 7710.0,
		"high_date": "2026-07-01",
		"low": 7020.0,
		"low_date": "2026-05-02",
		"max_drawdown_pct": -8.9,
		"volatility_pct": 21.5,
		"latest_rsi": 51.0,
		"rsi_days_measured": 126,
		"days_rsi_overbought": 2,
		"days_rsi_oversold": 1,
	},
}

RUNS = {
	"AAPL": {"rsi": 66.2, "rsi_band": "neutral", "beta": 1.18, "beta_band": "market", "sharpe_ratio": 0.9, "volatility": 0.241},
	"GOOGL": {"rsi": 37.1, "rsi_band": "neutral", "beta": 1.04, "beta_band": "market", "sharpe_ratio": 0.2, "volatility": 0.29},
	"MSFT": {},
}

#: The reader's run: AAPL 3rd and GOOGL 11th of 40, MSFT not in it. The puzzle the page
#: exists for: AAPL has the higher RSI and is placed higher, but RSI is not why.
YOURS = UserRun(
	run_id="run-1",
	created_at="2026-10-05T21:00:00+00:00",
	size=40,
	placings={
		"AAPL": RunPlacing(
			ticker="AAPL",
			rank=3,
			convergence_state="lean_together",
			quant_lean=0.4,
			sent_lean=0.2,
			profile_fit=1.0,
			data_sufficiency=0.9,
			momentum_pctile=78,
			risk_adj_pctile=81,
			stability_pctile=64,
		),
		"GOOGL": RunPlacing(
			ticker="GOOGL",
			rank=11,
			convergence_state="mixed",
			quant_lean=-0.3,
			sent_lean=0.05,
			profile_fit=0.8,
			data_sufficiency=0.9,
			momentum_pctile=22,
			risk_adj_pctile=35,
			stability_pctile=41,
		),
	},
)


def stock(ticker: str) -> QuantEvidence:
	return QuantEvidence(
		ticker=ticker,
		horizon="6M",
		day=TODAY.isoformat(),
		currency="ZAR",
		exchange_name="Nasdaq",
		facts=dict(FACTS[ticker]),
		run=dict(RUNS[ticker]),
		listing_currency="USD",
		fx_rate=17.6,
	)


def evidence(*tickers: str, yours: UserRun | None = None) -> ComparisonEvidence:
	return ComparisonEvidence(
		horizon="6M",
		day=TODAY.isoformat(),
		stocks=tuple(stock(t) for t in tickers or ("AAPL", "GOOGL")),
		yours=yours,
	)


class FakeHistory:
	def __init__(self, enabled=True, missing=()):
		self.enabled = enabled
		self.missing = set(missing)
		#: Override a stock's most recent close date, as a new close landing would.
		self.ends: dict[str, str] = {}
		self.calls: list[str] = []

	def window(self, ticker, horizon):
		self.calls.append(ticker)
		if ticker in self.missing:
			return {"ticker": ticker, "points": [], "facts": None}
		facts = dict(FACTS[ticker])
		if ticker in self.ends:
			facts["end"] = self.ends[ticker]
		return {
			"ticker": ticker,
			"horizon": horizon,
			"currency": "USD",
			"display_currency": "ZAR",
			"fx_rate": 17.6,
			"exchange_name": "Nasdaq",
			"points": [{"date": facts["end"], "close": 1.0, "rsi": 50.0}],
			"facts": facts,
		}


class FakeRepo:
	def __init__(self):
		self.rows: dict[tuple[str, str, str], dict] = {}
		self.writes: list[dict] = []
		self.pruned = False

	def read(self, user_id, key, horizon):
		row = self.rows.get((user_id, key, horizon))
		return dict(row) if row else None

	def save(self, row):
		self.writes.append(row)
		self.rows[(row["user_id"], row["set_key"], row["horizon"])] = dict(row)
		return True

	def prune(self, before):
		self.pruned = True


class FakeRunMetrics:
	def latest_run_metrics(self, ticker):
		return dict(RUNS.get(ticker, {}))


class FakeUserRuns:
	def __init__(self, run: UserRun | None = YOURS, broken=False):
		self.run = run
		self.broken = broken

	def latest_run(self, user_id):
		if self.broken:
			raise RuntimeError("db down")
		return {"id": self.run.run_id, "created_at": self.run.created_at} if self.run else None

	def latest(self, user_id, tickers):
		if self.broken:
			raise RuntimeError("db down")
		return self.run


class FakeClient:
	model = "fake-model"

	def __init__(self, reply):
		self.reply = reply
		self.calls = 0
		self.prompts: list[str] = []

	def complete(self, prompt):
		self.calls += 1
		self.prompts.append(prompt)
		if isinstance(self.reply, Exception):
			raise self.reply
		return self.reply


GOOD_REPLY = (
	"Over the last six months AAPL rose 12.4 percent while GOOGL fell 3.1 percent. GOOGL had "
	"the deeper fall from a peak to a later low, 14.2 percent against 9.8 percent for AAPL, "
	"and its daily moves were jumpier, at 29 percent annualised against 24.1 percent. RSI, "
	"which measures how fast and how far a price has moved recently on a 0 to 100 scale, "
	"reads 66 for AAPL and 37 for GOOGL; these describe the move, not what comes next."
)

PERSONAL_REPLY = (
	GOOD_REPLY
	+ " Your analysis placed AAPL 3rd and GOOGL 11th of 40 stocks. For AAPL the price measurements"
	" and the tone lean the same way, while for GOOGL they only partly agree, and GOOGL's price moved"
	" around more than the risk preference you set, which moved it down. AAPL showed a stronger trend"
	" than about 8 in 10 stocks in the run, and RSI is not used to place stocks."
)


def service(config=None, repo=None, history=None, client=None, runs=None):
	config = config or cfg()
	return ComparisonTraceService(
		config=config,
		history=history or FakeHistory(),
		repository=repo if repo is not None else FakeRepo(),
		runs=runs if runs is not None else FakeUserRuns(),
		run_metrics=FakeRunMetrics(),
		generator=ComparisonGenerator(config, client=client or FakeClient(PERSONAL_REPLY)),
		today=lambda: TODAY,
		now=lambda: datetime.datetime(2026, 10, 7, 9, 0, tzinfo=datetime.timezone.utc),
	)


# ─────────────────────────────────────────────────────────────────────────────
# the key
# ─────────────────────────────────────────────────────────────────────────────

class TestKey:
	def test_order_does_not_change_the_key(self):
		assert set_key(["GOOGL", "AAPL"]) == set_key(["aapl", "googl"]) == "AAPL|GOOGL"

	def test_tickers_keep_the_order_asked_for_and_drop_junk(self):
		assert normalise_tickers(["msft", " AAPL", "msft", "", "drop table;"]) == ["MSFT", "AAPL"]

	def test_dotted_tickers_survive(self):
		assert normalise_tickers(["brk.b"]) == ["BRK.B"]

	@pytest.mark.parametrize("n,word", [(1, "1st"), (2, "2nd"), (3, "3rd"), (4, "4th"), (11, "11th"), (12, "12th"), (13, "13th"), (21, "21st"), (112, "112th")])
	def test_ordinals(self, n, word):
		assert ordinal(n) == word


# ─────────────────────────────────────────────────────────────────────────────
# the guard
# ─────────────────────────────────────────────────────────────────────────────

class TestGuard:
	def guard(self):
		return ComparisonGuard(cfg())

	def test_a_grounded_paragraph_passes(self):
		assert self.guard().check(GOOD_REPLY, evidence()) is None

	def test_a_grounded_personal_paragraph_passes(self):
		assert self.guard().check(PERSONAL_REPLY, evidence(yours=YOURS)) is None

	@pytest.mark.parametrize(
		"verdict",
		[
			"AAPL did better than GOOGL",
			"AAPL was the best of the two",
			"AAPL outperformed GOOGL",
			"GOOGL is the riskier of the two",
			"AAPL looks the safer choice",
			"a stronger investment than GOOGL",
			"AAPL beat GOOGL",
			"readers may prefer AAPL",
		],
	)
	def test_a_verdict_is_refused(self, verdict):
		text = GOOD_REPLY + " " + verdict + "."
		reason = self.guard().check(text, evidence())
		assert reason and "forbidden" in reason

	@pytest.mark.parametrize(
		"suitability",
		[
			"AAPL suits you",
			"AAPL is more suitable for you",
			"AAPL is right for you",
			"AAPL is a good fit",
			"AAPL fits your profile",
			"AAPL matches your risk preference",
			"for investors like you, AAPL",
			"you might consider AAPL",
			"AAPL is the ideal holding",
			"AAPL is the appropriate one",
		],
	)
	def test_suitability_is_refused(self, suitability):
		text = PERSONAL_REPLY + " " + suitability + "."
		reason = self.guard().check(text, evidence(yours=YOURS))
		assert reason and "forbidden" in reason

	def test_advice_is_still_refused(self):
		reason = self.guard().check(GOOD_REPLY + " Readers should buy AAPL.", evidence())
		assert reason and "forbidden" in reason

	def test_a_paragraph_that_leaves_a_stock_out_is_refused(self):
		text = (
			"Over the last six months AAPL rose 12.4 percent and GOOGL fell 3.1 percent, with "
			"RSI at 66 and 37 on a 0 to 100 scale; these describe the move, not signals."
		)
		reason = self.guard().check(text, evidence("AAPL", "GOOGL", "MSFT"))
		assert reason == "leaves out MSFT"

	def test_a_ticker_inside_another_word_does_not_count(self):
		text = "Over the last six months AAPLX rose 12.4 percent and GOOGL fell 3.1 percent on a 0 to 100 scale."
		assert self.guard().check(text, evidence()) == "leaves out AAPL"

	def test_a_worked_out_difference_is_refused(self):
		text = GOOD_REPLY + " That is a gap of 15.5 points."
		reason = self.guard().check(text, evidence())
		assert reason and "15.5" in reason

	def test_a_number_from_either_stock_is_allowed(self):
		text = (
			"AAPL fell 9.8 percent from a peak at one point and GOOGL 14.2 percent, "
			"against RSI readings of 66 and 37 on a 0 to 100 scale."
		)
		assert self.guard().check(text, evidence()) is None

	def test_a_place_the_run_did_not_give_is_refused(self):
		text = GOOD_REPLY + " Your analysis placed AAPL 17th of 40 stocks."
		reason = self.guard().check(text, evidence(yours=YOURS))
		assert reason and "17" in reason

	def test_places_are_not_allowed_without_a_run(self):
		text = GOOD_REPLY + " Your analysis placed AAPL 3rd of 40 stocks."
		reason = self.guard().check(text, evidence())
		assert reason and "40" in reason

	def test_a_raw_percentile_is_refused(self):
		text = PERSONAL_REPLY + " Its momentum sat at the 78th percentile."
		reason = self.guard().check(text, evidence(yours=YOURS))
		assert reason and "78" in reason


# ─────────────────────────────────────────────────────────────────────────────
# the template
# ─────────────────────────────────────────────────────────────────────────────

class TestTemplate:
	@pytest.mark.parametrize("tickers", [("AAPL", "GOOGL"), ("GOOGL", "AAPL", "MSFT"), ("MSFT", "AAPL")])
	@pytest.mark.parametrize("yours", [None, YOURS])
	def test_the_template_passes_its_own_guard(self, tickers, yours):
		ev = evidence(*tickers, yours=yours)
		text = ComparisonTemplate().render(ev)
		# Every wording rule, but not the length cap: that guards the model, and the
		# template says each reading in full.
		assert ComparisonGuard(cfg(trace_max_chars=4000)).check(text, ev) is None, text

	def test_the_template_names_stocks_in_the_order_picked(self):
		text = ComparisonTemplate().render(evidence("GOOGL", "AAPL", yours=YOURS))
		assert text.index("GOOGL") < text.index("AAPL")
		assert "placed GOOGL 11th and AAPL 3rd of 40 stocks" in text

	def test_a_flat_window_is_called_flat(self):
		text = ComparisonTemplate().render(evidence("AAPL", "MSFT"))
		assert "MSFT ended flat" in text

	def test_beta_is_left_out_for_a_stock_with_no_run(self):
		text = ComparisonTemplate().render(evidence("AAPL", "MSFT"))
		assert "1.18 for AAPL" in text
		assert "for MSFT, which" not in text

	def test_no_run_means_no_places(self):
		text = ComparisonTemplate().render(evidence())
		assert "placed" not in text

	def test_the_run_explains_why_and_says_rsi_is_not_used(self):
		text = ComparisonTemplate().render(evidence(yours=YOURS))
		assert "For AAPL, the price measurements leaned favourable" in text
		assert "GOOGL moved around more than the risk preference you set" in text
		assert "RSI is not used to place stocks" in text

	def test_a_stock_outside_the_run_is_said_once(self):
		text = ComparisonTemplate().render(evidence("AAPL", "GOOGL", "MSFT", yours=YOURS))
		assert "MSFT was not in that run." in text


# ─────────────────────────────────────────────────────────────────────────────
# the prompt
# ─────────────────────────────────────────────────────────────────────────────

class TestPrompt:
	def test_every_stock_and_the_verdict_rule_are_in_the_prompt(self):
		prompt = ComparisonPromptBuilder().build(evidence("AAPL", "GOOGL", "MSFT", yours=YOURS))
		for t in ("=== AAPL ===", "=== GOOGL ===", "=== MSFT ==="):
			assert t in prompt
		assert "Name every one of AAPL, GOOGL and MSFT" in prompt
		assert "better, worse, safer, riskier" in prompt

	def test_the_run_reaches_the_prompt_in_words(self):
		prompt = ComparisonPromptBuilder().build(evidence("AAPL", "GOOGL", "MSFT", yours=YOURS))
		assert "- AAPL: placed 3rd" in prompt
		assert "40 stocks in all" in prompt
		assert "a stronger trend than about 8 in 10 stocks in the run" in prompt
		assert "moved around more than the risk preference the reader set" in prompt
		assert "- MSFT: not in this run." in prompt
		assert "RSI is not used to place stocks" in prompt

	def test_raw_percentiles_never_reach_the_prompt(self):
		prompt = ComparisonPromptBuilder().build(evidence(yours=YOURS))
		for raw in ("78", "81", "64", "22", "35", "41"):
			assert raw not in prompt

	def test_the_suitability_rule_is_in_a_personal_prompt(self):
		prompt = ComparisonPromptBuilder().build(evidence(yours=YOURS))
		assert "Never say or imply that a stock suits, fits or is right for the reader" in prompt

	def test_without_a_run_the_prompt_says_nothing_about_places(self):
		prompt = ComparisonPromptBuilder().build(evidence())
		assert "has no completed analysis run" in prompt
		assert "Say nothing about places" in prompt
		assert "placed 3rd" not in prompt


# ─────────────────────────────────────────────────────────────────────────────
# the service
# ─────────────────────────────────────────────────────────────────────────────

class TestService:
	def test_off_means_nothing_is_fetched(self):
		history = FakeHistory()
		svc = service(config=cfg(trace_enabled=False), history=history)
		assert svc.explain(USER, ["AAPL", "GOOGL"], "6M") is None
		assert svc.saved(USER, ["AAPL", "GOOGL"], "6M") is None
		assert history.calls == []

	def test_off_when_the_windows_are_off(self):
		assert service(history=FakeHistory(enabled=False)).explain(USER, ["AAPL", "GOOGL"], "6M") is None

	def test_a_paragraph_is_written_stored_and_served(self):
		repo = FakeRepo()
		point = service(repo=repo).explain(USER, ["GOOGL", "AAPL"], "6M")
		assert point["trace"] == PERSONAL_REPLY
		assert point["source"] == "model"
		assert point["personal"] is True
		assert point["run_at"] == YOURS.created_at
		row = repo.writes[0]
		assert row["user_id"] == USER
		assert row["set_key"] == "AAPL|GOOGL"
		assert row["windows"] == "AAPL:2026-10-06|GOOGL:2026-10-06"
		assert row["run_id"] == "run-1"
		assert row["facts"]["tickers"] == ["GOOGL", "AAPL"]
		assert row["facts"]["yours"]["placings"]["AAPL"]["rank"] == 3

	def test_nothing_stored_means_nothing_saved(self):
		assert service().saved(USER, ["AAPL", "GOOGL"], "6M") is None

	def test_reading_back_never_calls_the_model(self):
		client = FakeClient(PERSONAL_REPLY)
		svc = service(client=client)
		svc.saved(USER, ["AAPL", "GOOGL"], "6M")
		assert client.calls == 0

	def test_a_current_paragraph_is_read_back(self):
		svc = service()
		svc.explain(USER, ["AAPL", "GOOGL"], "6M")
		point = svc.saved(USER, ["GOOGL", "AAPL"], "6M")
		assert point and point["trace"] == PERSONAL_REPLY

	def test_a_new_close_retires_the_paragraph(self):
		history = FakeHistory()
		svc = service(history=history)
		svc.explain(USER, ["AAPL", "GOOGL"], "6M")
		history.ends["GOOGL"] = "2026-10-07"
		assert svc.saved(USER, ["AAPL", "GOOGL"], "6M") is None

	def test_a_new_run_retires_the_paragraph(self):
		runs = FakeUserRuns()
		svc = service(runs=runs)
		svc.explain(USER, ["AAPL", "GOOGL"], "6M")
		runs.run = UserRun(run_id="run-2", created_at="2026-10-07T08:00:00+00:00", size=40, placings=YOURS.placings)
		assert svc.saved(USER, ["AAPL", "GOOGL"], "6M") is None

	def test_a_first_run_retires_a_prices_only_paragraph(self):
		runs = FakeUserRuns(run=None)
		svc = service(runs=runs, client=FakeClient(GOOD_REPLY))
		assert svc.explain(USER, ["AAPL", "GOOGL"], "6M")["personal"] is False
		runs.run = YOURS
		assert svc.saved(USER, ["AAPL", "GOOGL"], "6M") is None

	def test_a_current_paragraph_is_never_paid_for_twice(self):
		client = FakeClient(PERSONAL_REPLY)
		svc = service(client=client)
		svc.explain(USER, ["AAPL", "GOOGL"], "6M")
		svc.explain(USER, ["GOOGL", "AAPL"], "6M")
		assert client.calls == 1

	def test_a_stale_paragraph_is_written_again(self):
		client = FakeClient(PERSONAL_REPLY)
		history = FakeHistory()
		svc = service(client=client, history=history)
		svc.explain(USER, ["AAPL", "GOOGL"], "6M")
		history.ends["AAPL"] = "2026-10-07"
		svc.explain(USER, ["AAPL", "GOOGL"], "6M")
		assert client.calls == 2

	def test_one_readers_paragraph_is_not_anothers(self):
		svc = service()
		svc.explain(USER, ["AAPL", "GOOGL"], "6M")
		assert svc.saved("user-2", ["AAPL", "GOOGL"], "6M") is None

	def test_a_rejected_reply_falls_back_to_the_template(self):
		repo = FakeRepo()
		point = service(repo=repo, client=FakeClient(PERSONAL_REPLY + " AAPL suits you.")).explain(USER, ["AAPL", "GOOGL"], "6M")
		assert point["source"] == "template"
		assert repo.writes[0]["model"] is None
		assert "Your latest analysis placed AAPL 3rd" in point["trace"]

	def test_a_failing_model_falls_back_to_the_template(self, monkeypatch):
		monkeypatch.setattr(ComparisonGenerator, "BACKOFF_SECONDS", (0.0, 0.0))
		point = service(client=FakeClient(RuntimeError("429"))).explain(USER, ["AAPL", "GOOGL"], "6M")
		assert point["source"] == "template"

	def test_past_the_daily_limit_the_template_stands_in(self):
		client = FakeClient(PERSONAL_REPLY)
		history = FakeHistory()
		svc = service(config=cfg(trace_daily_limit=1), client=client, history=history)
		assert svc.explain(USER, ["AAPL", "GOOGL"], "6M")["source"] == "model"
		history.ends["AAPL"] = "2026-10-07"
		assert svc.explain(USER, ["AAPL", "GOOGL"], "6M")["source"] == "template"
		assert client.calls == 1
		# Another reader has their own allowance.
		assert svc.explain("user-2", ["AAPL", "GOOGL"], "6M")["source"] == "model"

	def test_an_unreadable_run_still_gives_the_price_half(self):
		repo = FakeRepo()
		point = service(repo=repo, runs=FakeUserRuns(broken=True), client=FakeClient(GOOD_REPLY)).explain(USER, ["AAPL", "GOOGL"], "6M")
		assert point["trace"] == GOOD_REPLY
		assert point["personal"] is False
		assert repo.writes[0]["run_id"] is None

	def test_one_stock_with_no_window_means_no_paragraph(self):
		repo = FakeRepo()
		assert service(repo=repo, history=FakeHistory(missing={"GOOGL"})).explain(USER, ["AAPL", "GOOGL"], "6M") is None
		assert repo.writes == []

	@pytest.mark.parametrize("tickers", [["AAPL"], ["AAPL", "GOOGL", "MSFT", "NVDA"], ["AAPL", "aapl"]])
	def test_the_wrong_number_of_stocks_means_no_paragraph(self, tickers):
		assert service().explain(USER, tickers, "6M") is None

	def test_a_broken_store_never_raises(self):
		class BrokenRepo(FakeRepo):
			def read(self, user_id, key, horizon):
				raise RuntimeError("db down")

		svc = service(repo=BrokenRepo())
		assert svc.explain(USER, ["AAPL", "GOOGL"], "6M") is None
		assert svc.saved(USER, ["AAPL", "GOOGL"], "6M") is None


# ─────────────────────────────────────────────────────────────────────────────
# reading the run
# ─────────────────────────────────────────────────────────────────────────────

class FakeQuery:
	def __init__(self, db, table):
		self.db = db
		self.table = table
		self.filters: list[tuple[str, str, object]] = []
		self.columns = ""
		self.counted = False

	def select(self, columns, count=None):
		self.columns = columns
		self.counted = count == "exact"
		return self

	def eq(self, column, value):
		self.filters.append(("eq", column, value))
		return self

	def in_(self, column, values):
		self.filters.append(("in", column, list(values)))
		return self

	def order(self, *args, **kwargs):
		return self

	def limit(self, n):
		return self

	def execute(self):
		self.db.queries.append((self.table, list(self.filters)))

		def keep(row):
			for kind, column, value in self.filters:
				if kind == "eq" and row.get(column) != value:
					return False
				if kind == "in" and row.get(column) not in value:
					return False
			return True

		rows = [r for r in self.db.tables.get(self.table, []) if keep(r)]
		return SimpleNamespace(data=rows, count=len(rows) if self.counted else None)


class FakeSupabase:
	def __init__(self, tables):
		self.tables = tables
		self.queries: list[tuple[str, list]] = []

	def table(self, name):
		return FakeQuery(self, name)


def run_db():
	return FakeSupabase(
		{
			"ai_runs": [
				{"id": "run-1", "user_id": USER, "status": "complete", "created_at": "2026-10-05T21:00:00+00:00"},
				{"id": "run-9", "user_id": "user-2", "status": "complete", "created_at": "2026-10-06T21:00:00+00:00"},
			],
			"assets": [
				{"id": "a1", "ticker": "AAPL"},
				{"id": "a2", "ticker": "GOOGL"},
				{"id": "a3", "ticker": "MSFT"},
			],
			"ai_recommendation": [
				{"id": 1, "run_id": "run-1", "asset_id": "a1", "rank": 3, "convergence_state": "lean_together", "quant_lean": 0.4, "momentum_pctile": 78},
				{"id": 2, "run_id": "run-1", "asset_id": "a2", "rank": 11, "convergence_state": "mixed", "quant_lean": -0.3, "momentum_pctile": 22},
				{"id": 3, "run_id": "run-1", "asset_id": "zz", "rank": 1},
				{"id": 4, "run_id": "run-9", "asset_id": "a3", "rank": 2},
			],
		}
	)


class TestUserRunReader:
	def test_the_readers_own_run_is_read(self):
		db = run_db()
		run = UserRunReader(client=db).latest(USER, ["AAPL", "GOOGL", "MSFT"])
		assert run.run_id == "run-1"
		assert run.size == 3
		assert run.placings["AAPL"].rank == 3
		assert run.placings["GOOGL"].convergence_state == "mixed"
		assert "MSFT" not in run.placings
		assert ("eq", "user_id", USER) in db.queries[0][1]

	def test_no_completed_run_means_none(self):
		assert UserRunReader(client=run_db()).latest("user-3", ["AAPL", "GOOGL"]) is None


# ─────────────────────────────────────────────────────────────────────────────
# the endpoint
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
	app = FastAPI()
	routes.mount_compare_routes(app)
	app.dependency_overrides[routes.current_user_id] = lambda: USER
	yield TestClient(app)
	monkeypatch.setattr(routes, "_trace_instance", None)


def test_the_endpoint_says_when_off(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service(config=cfg(trace_enabled=False)))
	body = client.get("/api/compare/trace?tickers=aapl,googl&horizon=6M").json()
	assert body == {
		"tickers": ["AAPL", "GOOGL"],
		"horizon": "6M",
		"available": False,
		"trace": None,
		"source": None,
		"model": None,
		"generated_at": None,
		"personal": False,
		"run_at": None,
	}


def test_reading_back_before_asking_gives_no_paragraph(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service())
	body = client.get("/api/compare/trace?tickers=AAPL,GOOGL&horizon=6M").json()
	assert body["available"] is True
	assert body["trace"] is None


def test_asking_writes_one_in_the_order_asked_and_reading_back_finds_it(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service())
	body = client.post("/api/compare/trace", json={"tickers": ["GOOGL", "AAPL"], "horizon": "6m"}).json()
	assert body["tickers"] == ["GOOGL", "AAPL"]
	assert body["trace"] == PERSONAL_REPLY
	assert body["personal"] is True
	again = client.get("/api/compare/trace?tickers=AAPL,GOOGL&horizon=6M").json()
	assert again["trace"] == PERSONAL_REPLY


def test_the_endpoint_refuses_one_ticker_or_a_bad_horizon(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service())
	assert client.get("/api/compare/trace?tickers=AAPL&horizon=6M").status_code == 400
	assert client.get("/api/compare/trace?tickers=AAPL,GOOGL&horizon=2W").status_code == 400
	assert client.post("/api/compare/trace", json={"tickers": ["AAPL"], "horizon": "6M"}).status_code == 400


def test_a_quiet_answer_is_still_available(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service(history=FakeHistory(missing={"AAPL"})))
	body = client.post("/api/compare/trace", json={"tickers": ["AAPL", "GOOGL"], "horizon": "6M"}).json()
	assert body["available"] is True
	assert body["trace"] is None


def test_the_reader_comes_from_the_token_not_the_request(monkeypatch):
	app = FastAPI()
	routes.mount_compare_routes(app)
	svc = service()
	monkeypatch.setattr(routes, "_trace_instance", svc)
	app.dependency_overrides[routes.current_user_id] = lambda: "user-2"
	TestClient(app).post("/api/compare/trace?user_id=user-1", json={"tickers": ["AAPL", "GOOGL"], "horizon": "6M", "user_id": USER})
	assert svc.repository.writes[0]["user_id"] == "user-2"
	monkeypatch.setattr(routes, "_trace_instance", None)
