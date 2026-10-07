"""Tests for the Compare page's written comparison (src/compare/trace.py).

Like the quant trace's tests, these assert on what the paragraph may NOT do rather than on
its prose: quote a number it was not given, name a winner, leave a stock out, or be paid
for twice. Plus the one thing this page adds: the set is the key, whatever order it was
picked in.

Nothing external is touched. Groq, the store and the windows are fakes.
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
from src.compare.trace import (  # noqa: E402
	ComparisonEvidence,
	ComparisonGenerator,
	ComparisonGuard,
	ComparisonPromptBuilder,
	ComparisonTemplate,
	ComparisonTraceService,
	normalise_tickers,
	set_key,
)
from src.quant.trace import QuantEvidence  # noqa: E402

TODAY = datetime.date(2026, 10, 7)


def cfg(**overrides) -> CompareConfig:
	base = dict(trace_enabled=True, trace_max_chars=1300, trace_min_chars=40)
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


def evidence(*tickers: str) -> ComparisonEvidence:
	return ComparisonEvidence(horizon="6M", day=TODAY.isoformat(), stocks=tuple(stock(t) for t in tickers or ("AAPL", "GOOGL")))


class FakeHistory:
	def __init__(self, enabled=True, missing=()):
		self.enabled = enabled
		self.missing = set(missing)
		self.calls: list[str] = []

	def window(self, ticker, horizon):
		self.calls.append(ticker)
		if ticker in self.missing:
			return {"ticker": ticker, "points": [], "facts": None}
		return {
			"ticker": ticker,
			"horizon": horizon,
			"currency": "USD",
			"display_currency": "ZAR",
			"fx_rate": 17.6,
			"exchange_name": "Nasdaq",
			"points": [{"date": "2026-10-06", "close": 1.0, "rsi": 50.0}],
			"facts": dict(FACTS[ticker]),
		}


class FakeRepo:
	def __init__(self, stored=None):
		self.stored = stored
		self.reads: list[str] = []
		self.writes: list[dict] = []
		self.pruned = False

	def read(self, key, day, horizon):
		self.reads.append(key)
		return self.stored

	def upsert(self, row):
		self.writes.append(row)
		self.stored = row
		return 1

	def prune(self, before):
		self.pruned = True


class FakeRuns:
	def latest_run_metrics(self, ticker):
		return dict(RUNS.get(ticker, {}))


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


def service(config=None, repo=None, history=None, client=None):
	config = config or cfg()
	return ComparisonTraceService(
		config=config,
		history=history or FakeHistory(),
		repository=repo if repo is not None else FakeRepo(),
		run_metrics=FakeRuns(),
		generator=ComparisonGenerator(config, client=client or FakeClient(GOOD_REPLY)),
		today=lambda: TODAY,
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


# ─────────────────────────────────────────────────────────────────────────────
# the guard
# ─────────────────────────────────────────────────────────────────────────────

class TestGuard:
	def guard(self):
		return ComparisonGuard(cfg())

	def test_a_grounded_paragraph_passes(self):
		assert self.guard().check(GOOD_REPLY, evidence()) is None

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


# ─────────────────────────────────────────────────────────────────────────────
# the template
# ─────────────────────────────────────────────────────────────────────────────

class TestTemplate:
	@pytest.mark.parametrize("tickers", [("AAPL", "GOOGL"), ("GOOGL", "AAPL", "MSFT"), ("MSFT", "AAPL")])
	def test_the_template_passes_its_own_guard(self, tickers):
		ev = evidence(*tickers)
		text = ComparisonTemplate().render(ev)
		assert ComparisonGuard(cfg()).check(text, ev) is None, text

	def test_the_template_names_stocks_in_the_order_picked(self):
		text = ComparisonTemplate().render(evidence("GOOGL", "AAPL"))
		assert text.index("GOOGL") < text.index("AAPL")

	def test_a_flat_window_is_called_flat(self):
		text = ComparisonTemplate().render(evidence("AAPL", "MSFT"))
		assert "MSFT ended flat" in text

	def test_beta_is_left_out_for_a_stock_with_no_run(self):
		text = ComparisonTemplate().render(evidence("AAPL", "MSFT"))
		assert "1.18 for AAPL" in text
		assert "for MSFT, which" not in text


# ─────────────────────────────────────────────────────────────────────────────
# the prompt
# ─────────────────────────────────────────────────────────────────────────────

class TestPrompt:
	def test_every_stock_and_the_verdict_rule_are_in_the_prompt(self):
		prompt = ComparisonPromptBuilder().build(evidence("AAPL", "GOOGL", "MSFT"))
		for t in ("=== AAPL ===", "=== GOOGL ===", "=== MSFT ==="):
			assert t in prompt
		assert "Name every one of AAPL, GOOGL and MSFT" in prompt
		assert "better, worse, safer, riskier" in prompt

	def test_percentiles_never_reach_the_prompt(self):
		ev = evidence()
		prompt = ComparisonPromptBuilder().build(ev)
		assert "percentile" not in prompt.lower()


# ─────────────────────────────────────────────────────────────────────────────
# the service
# ─────────────────────────────────────────────────────────────────────────────

class TestService:
	def test_off_means_nothing_is_fetched(self):
		history = FakeHistory()
		assert service(config=cfg(trace_enabled=False), history=history).trace_for(["AAPL", "GOOGL"], "6M") is None
		assert history.calls == []

	def test_off_when_the_windows_are_off(self):
		assert service(history=FakeHistory(enabled=False)).trace_for(["AAPL", "GOOGL"], "6M") is None

	def test_a_paragraph_is_written_stored_and_served(self):
		repo = FakeRepo()
		point = service(repo=repo).trace_for(["GOOGL", "AAPL"], "6M")
		assert point["trace"] == GOOD_REPLY
		assert point["source"] == "model"
		assert repo.writes[0]["set_key"] == "AAPL|GOOGL"
		assert repo.writes[0]["facts"]["tickers"] == ["GOOGL", "AAPL"]

	def test_a_stored_paragraph_is_never_paid_for_twice(self):
		client = FakeClient(GOOD_REPLY)
		stored = {"trace": "stored", "source": "model", "model": "m", "generated_at": "x"}
		point = service(repo=FakeRepo(stored=stored), client=client).trace_for(["AAPL", "GOOGL"], "6M")
		assert point["trace"] == "stored"
		assert client.calls == 0

	def test_the_second_order_reads_the_first_orders_row(self):
		client = FakeClient(GOOD_REPLY)
		svc = service(client=client)
		svc.trace_for(["AAPL", "GOOGL"], "6M")
		svc.trace_for(["GOOGL", "AAPL"], "6M")
		assert client.calls == 1

	def test_a_rejected_reply_falls_back_to_the_template(self):
		repo = FakeRepo()
		point = service(repo=repo, client=FakeClient(GOOD_REPLY + " AAPL did better.")).trace_for(["AAPL", "GOOGL"], "6M")
		assert point["source"] == "template"
		assert repo.writes[0]["model"] is None

	def test_a_failing_model_falls_back_to_the_template(self, monkeypatch):
		monkeypatch.setattr(ComparisonGenerator, "BACKOFF_SECONDS", (0.0, 0.0))
		point = service(client=FakeClient(RuntimeError("429"))).trace_for(["AAPL", "GOOGL"], "6M")
		assert point["source"] == "template"

	def test_one_stock_with_no_window_means_no_paragraph(self):
		repo = FakeRepo()
		assert service(repo=repo, history=FakeHistory(missing={"GOOGL"})).trace_for(["AAPL", "GOOGL"], "6M") is None
		assert repo.writes == []

	@pytest.mark.parametrize("tickers", [["AAPL"], ["AAPL", "GOOGL", "MSFT", "NVDA"], ["AAPL", "aapl"]])
	def test_the_wrong_number_of_stocks_means_no_paragraph(self, tickers):
		assert service().trace_for(tickers, "6M") is None

	def test_a_broken_store_never_raises(self):
		class BrokenRepo(FakeRepo):
			def read(self, key, day, horizon):
				raise RuntimeError("db down")

		assert service(repo=BrokenRepo()).trace_for(["AAPL", "GOOGL"], "6M") is None


# ─────────────────────────────────────────────────────────────────────────────
# the endpoint
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
	app = FastAPI()
	routes.mount_compare_routes(app)
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
	}


def test_the_endpoint_serves_a_paragraph_in_the_order_asked(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service())
	body = client.get("/api/compare/trace?tickers=GOOGL,AAPL&horizon=6m").json()
	assert body["tickers"] == ["GOOGL", "AAPL"]
	assert body["trace"] == GOOD_REPLY
	assert body["source"] == "model"


def test_the_endpoint_refuses_one_ticker_or_a_bad_horizon(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service())
	assert client.get("/api/compare/trace?tickers=AAPL&horizon=6M").status_code == 400
	assert client.get("/api/compare/trace?tickers=AAPL,GOOGL&horizon=2W").status_code == 400


def test_a_quiet_answer_is_still_available(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service(history=FakeHistory(missing={"AAPL"})))
	body = client.get("/api/compare/trace?tickers=AAPL,GOOGL&horizon=6M").json()
	assert body["available"] is True
	assert body["trace"] is None
