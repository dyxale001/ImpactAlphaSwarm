"""Tests for the Quant tab's reasoning trace (src/quant/trace.py).

The claims that matter are about what the paragraph is NOT allowed to do. It is generated,
so the prose is never asserted on; what is asserted is that a paragraph quoting a number
it was not given is refused, that one telling the reader what to do is refused, that the
templated fallback passes the same guard it exists to back up, and that a stored paragraph
is never paid for twice.

Nothing external is touched. Groq is a fake, the store is a fake and the window is a fake.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.quant import routes  # noqa: E402
from src.quant import trace as tr  # noqa: E402
from src.quant.config import QuantViewConfig  # noqa: E402
from src.quant.trace import (  # noqa: E402
	QuantEvidence,
	QuantTraceGenerator,
	QuantTracePromptBuilder,
	QuantTraceService,
	QuantTraceTemplate,
	TraceGuard,
	spell_date,
)

TODAY = datetime.date(2026, 9, 10)


def cfg(**overrides) -> QuantViewConfig:
	base = dict(history_enabled=True, trace_enabled=True, trace_max_chars=1000, trace_min_chars=40)
	base.update(overrides)
	return QuantViewConfig(**base)


def facts(**overrides) -> dict:
	base = {
		"start": "2026-03-10",
		"end": "2026-09-09",
		"trading_days": 128,
		"first_close": 162.35,
		"last_close": 182.4,
		"change_pct": 12.4,
		"high": 195.2,
		"high_date": "2026-07-21",
		"low": 148.9,
		"low_date": "2026-04-03",
		"max_drawdown_pct": -18.7,
		"volatility_pct": 31.2,
		"latest_rsi": 58.0,
		"rsi_days_measured": 128,
		"days_rsi_overbought": 9,
		"days_rsi_oversold": 4,
	}
	base.update(overrides)
	return base


def run(**overrides) -> dict:
	base = {
		"rsi": 58.3,
		"rsi_band": "neutral",
		"beta": 1.34,
		"beta_band": "high",
		"sharpe_ratio": 0.92,
		"volatility": 0.298,
		"quant_normalisation": "cross_sectional",
	}
	base.update(overrides)
	return base


def evidence(**overrides) -> QuantEvidence:
	base = dict(
		ticker="NVDA",
		horizon="6M",
		day=TODAY.isoformat(),
		currency="USD",
		exchange_name="Nasdaq",
		facts=facts(),
		run=run(),
		listing_currency="USD",
		fx_rate=None,
	)
	base.update(overrides)
	return QuantEvidence(**base)


def rand_facts() -> dict:
	"""The same window in rand at 18 to the dollar, as the history service would serve it."""
	f = facts()
	for key in ("first_close", "last_close", "high", "low"):
		f[key] = round(f[key] * 18.0, 4)
	return f


def rand_evidence(**overrides) -> QuantEvidence:
	base = dict(currency="ZAR", listing_currency="USD", fx_rate=18.0, facts=rand_facts())
	base.update(overrides)
	return evidence(**base)


class FakeHistory:
	def __init__(self, window=None, enabled=True):
		self.enabled = enabled
		self._window = window
		self.calls = 0

	def window(self, ticker, horizon):
		self.calls += 1
		if self._window is not None:
			return self._window
		return {
			"ticker": ticker,
			"horizon": horizon,
			"currency": "USD",
			"display_currency": "USD",
			"fx_rate": None,
			"converted": False,
			"exchange": "NMS",
			"exchange_name": "Nasdaq",
			"points": [{"date": "2026-09-09", "close": 182.4, "rsi": 58.0}],
			"facts": facts(),
		}


def rand_window() -> dict:
	"""What the history service serves once the rate is known: rand, and the rate used."""
	return {
		"ticker": "NVDA",
		"horizon": "6M",
		"currency": "USD",
		"display_currency": "ZAR",
		"fx_rate": 18.0,
		"converted": True,
		"exchange": "NMS",
		"exchange_name": "Nasdaq",
		"points": [{"date": "2026-09-09", "close": 3283.2, "rsi": 58.0}],
		"facts": rand_facts(),
	}


class FakeRepo:
	def __init__(self, stored=None, metrics=None):
		self.stored = stored
		self.metrics = metrics if metrics is not None else run()
		self.writes: list[dict] = []
		self.pruned = False
		self.metric_reads = 0

	def read(self, ticker, day, horizon):
		return self.stored

	def upsert(self, row):
		self.writes.append(row)
		return 1

	def prune(self, before):
		self.pruned = True

	def latest_run_metrics(self, ticker):
		self.metric_reads += 1
		return dict(self.metrics)


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


class NoClientGenerator(QuantTraceGenerator):
	"""A generator whose Groq is unconfigured, without touching the environment."""

	def __init__(self, config):
		super().__init__(config, client=None)
		self._client_built = True


GOOD_REPLY = (
	"Over the last six months NVDA moved up 12.4 percent, from 162.35 USD to a most recent "
	"close of 182.4 USD. Its highest close was 195.2 USD on 21 July 2026 and its lowest 148.9 "
	"USD on 3 April 2026, with the largest fall from a peak to a later low at 18.7 percent. "
	"RSI, which measures how fast and how far the price has moved recently on a 0 to 100 "
	"scale, sat above 70 on 9 of 128 measured days and below 30 on 4, and reads 58 now, "
	"which describes the move rather than signalling anything. Beta of 1.34 means the price "
	"tends to move more sharply than the wider market."
)


def service(config=None, repo=None, history=None, generator=None):
	config = config or cfg()
	return QuantTraceService(
		config=config,
		history=history or FakeHistory(),
		repository=repo if repo is not None else FakeRepo(),
		generator=generator or QuantTraceGenerator(config, client=FakeClient(GOOD_REPLY)),
		today=lambda: TODAY,
	)


# ─────────────────────────────────────────────────────────────────────────────
# the guard
# ─────────────────────────────────────────────────────────────────────────────

class TestGuard:
	def test_a_grounded_paragraph_passes(self):
		assert TraceGuard(cfg()).check(GOOD_REPLY, evidence()) is None

	def test_a_number_the_facts_do_not_contain_is_refused(self):
		text = GOOD_REPLY.replace("12.4 percent", "40 percent")
		reason = TraceGuard(cfg()).check(text, evidence())
		assert reason and "40" in reason

	def test_rounding_to_the_nearest_whole_is_allowed(self):
		text = GOOD_REPLY.replace("12.4 percent", "about 12 percent")
		assert TraceGuard(cfg()).check(text, evidence()) is None

	def test_rounding_away_is_not(self):
		text = GOOD_REPLY.replace("12.4 percent", "13 percent")
		assert TraceGuard(cfg()).check(text, evidence()) is not None

	def test_the_parts_of_a_date_are_grounded(self):
		guard = TraceGuard(cfg())
		assert guard.ungrounded_numbers("the low fell on 3 April 2026", evidence()) == []
		assert guard.ungrounded_numbers("the low fell on 3 April 2019", evidence()) == ["2019"]

	def test_the_conversion_rate_is_a_number_the_paragraph_may_quote(self):
		guard = TraceGuard(cfg())
		# A rate clear of every figure in the fixture; 18 would be read as the 18.7 drawdown.
		rate = 41.3
		assert not any(abs(rate - a) <= TraceGuard.TOLERANCE for a in evidence().numbers())
		assert guard.ungrounded_numbers(f"converted at R{rate} per dollar", rand_evidence(fx_rate=rate)) == []
		assert guard.ungrounded_numbers(f"converted at R{rate} per dollar", evidence()) == [str(rate)]

	def test_a_rand_price_glued_to_its_r_is_still_read(self):
		guard = TraceGuard(cfg())
		assert guard.ungrounded_numbers("closed at R3283.2 and R3,513.6", rand_evidence()) == []
		assert guard.ungrounded_numbers("closed at R9999", rand_evidence()) == ["9999"]
		# The indicator's own name is not a rand prefix.
		assert guard.ungrounded_numbers("RSI14 read 58", rand_evidence()) == []

	def test_the_rsi_scale_and_lines_are_always_allowed(self):
		guard = TraceGuard(cfg())
		assert guard.ungrounded_numbers("on a 0 to 100 scale, above 70 and below 30, near 50, over 14 days", evidence()) == []

	def test_thousands_separators_are_read_through(self):
		ev = evidence(facts=facts(last_close=1250.5))
		assert TraceGuard(cfg()).ungrounded_numbers("closed at 1,250.5 USD", ev) == []

	@pytest.mark.parametrize(
		"phrase",
		[
			"you should buy",
			"a good time to sell",
			"hold the position",
			"the stock is undervalued",
			"the outlook is strong",
			"it will rise from here",
			"we expect further gains",
			"a bullish setup",
			"it has potential",
			"a bargain at this price",
		],
	)
	def test_advice_and_forecasts_are_refused(self, phrase):
		text = GOOD_REPLY + " " + phrase.capitalize() + "."
		reason = TraceGuard(cfg()).check(text, evidence())
		assert reason and "forbidden" in reason, phrase

	def test_forbidden_words_are_matched_as_words(self):
		"""'holding', 'shoulder' and 'sells' are not 'hold', 'should' and 'sell'... except
		that inflections of the verbs are, by design. Word stems inside other words are not."""
		guard = TraceGuard(cfg())
		assert guard.check(GOOD_REPLY + " The shoulder of the curve.", evidence()) is None
		assert guard.check(GOOD_REPLY + " Households bought.", evidence()) is None
		assert guard.check(GOOD_REPLY + " It sells well.", evidence()) is not None

	def test_a_token_reply_is_too_short(self):
		assert TraceGuard(cfg()).check("N/A", evidence()) is not None

	def test_an_essay_is_too_long(self):
		assert TraceGuard(cfg(trace_max_chars=200)).check(GOOD_REPLY, evidence()) is not None


# ─────────────────────────────────────────────────────────────────────────────
# the template
# ─────────────────────────────────────────────────────────────────────────────

class TestTemplate:
	def test_it_states_the_move_the_extremes_the_rsi_and_the_beta(self):
		text = QuantTraceTemplate().render(evidence())
		assert "moved up 12.4 percent" in text
		assert "195.2 USD on 21 July 2026" in text
		assert "148.9 USD on 3 April 2026" in text
		assert "18.7 percent" in text
		assert "above 70 on 9 of the 128 measured days" in text
		assert "beta" in text and "1.34" in text
		assert "more sharply than the market" in text

	def test_in_rand_it_says_so_prints_rand_and_names_the_rate(self):
		text = QuantTraceTemplate().render(rand_evidence())
		assert "R3283.2" in text
		assert "in rand converted from USD at today's rate of R18 per USD" in text
		assert TraceGuard(cfg()).check(text, rand_evidence()) is None

	def test_a_rand_listing_prints_rand_without_a_conversion_sentence(self):
		text = QuantTraceTemplate().render(evidence(currency="ZAR", listing_currency="ZAR", fx_rate=1.0))
		assert "R182.4" in text
		assert "converted" not in text

	def test_it_passes_its_own_guard(self):
		for ev in (
			evidence(),
			evidence(run={}),
			evidence(facts=facts(rsi_days_measured=0, latest_rsi=None, days_rsi_overbought=0, days_rsi_oversold=0)),
			evidence(facts=facts(change_pct=-7.3, last_close=150.5)),
			evidence(facts=facts(change_pct=0.0)),
			evidence(currency="", exchange_name=""),
		):
			text = QuantTraceTemplate().render(ev)
			assert TraceGuard(cfg()).check(text, ev) is None, text

	def test_a_fall_is_a_fall(self):
		text = QuantTraceTemplate().render(evidence(facts=facts(change_pct=-7.3)))
		assert "moved down 7.3 percent" in text

	def test_without_a_run_it_says_nothing_about_beta(self):
		text = QuantTraceTemplate().render(evidence(run={}))
		assert "beta" not in text.lower()

	def test_without_rsi_it_says_nothing_about_rsi(self):
		text = QuantTraceTemplate().render(
			evidence(facts=facts(rsi_days_measured=0, latest_rsi=None))
		)
		assert "RSI" not in text

	def test_it_never_uses_dash_punctuation(self):
		text = QuantTraceTemplate().render(evidence())
		assert "—" not in text and " - " not in text

	def test_it_calls_the_last_figure_the_most_recent_close(self):
		assert "most recent close" in QuantTraceTemplate().render(evidence())


# ─────────────────────────────────────────────────────────────────────────────
# the prompt
# ─────────────────────────────────────────────────────────────────────────────

class TestPrompt:
	def test_it_carries_every_fact_and_the_horizon(self):
		prompt = QuantTracePromptBuilder().build(evidence())
		for needle in ("the last six months", "162.35", "182.4", "12.4 percent", "195.2", "21 July 2026", "148.9", "18.7", "9 of them above 70", "4 below 30", "1.34", "0.92", "Nasdaq"):
			assert needle in prompt, needle

	def test_in_rand_it_tells_the_model_the_currency_the_rate_and_to_say_so(self):
		prompt = QuantTracePromptBuilder().build(rand_evidence())
		assert "R3283.2" in prompt
		assert "converted from USD at today's rate of R18 per USD" in prompt
		assert "Say once, plainly, that the prices are shown in rand" in prompt
		assert "182.4 USD" not in prompt

	def test_unconverted_it_still_names_the_listing_currency(self):
		prompt = QuantTracePromptBuilder().build(evidence())
		assert "Prices are in USD" in prompt
		assert "converted" not in prompt

	def test_it_forbids_advice_and_invention(self):
		prompt = QuantTracePromptBuilder().build(evidence())
		assert "Use ONLY the figures listed above" in prompt
		assert "never tell the reader to buy, sell, hold" in prompt
		assert "Never use a dash" in prompt

	def test_without_a_run_it_tells_the_model_not_to_mention_beta(self):
		prompt = QuantTracePromptBuilder().build(evidence(run={}))
		assert "Do not mention beta" in prompt

	def test_dates_are_spelled_so_iso_order_cannot_mislead(self):
		assert spell_date("2026-04-03") == "3 April 2026"
		assert spell_date(None) == "an unknown date"
		assert spell_date("garbage") == "garbage"


# ─────────────────────────────────────────────────────────────────────────────
# the generator
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerator:
	def test_a_grounded_reply_is_returned(self):
		gen = QuantTraceGenerator(cfg(), client=FakeClient(GOOD_REPLY))
		assert gen.generate(evidence()) == GOOD_REPLY

	def test_a_reply_with_advice_is_refused(self):
		gen = QuantTraceGenerator(cfg(), client=FakeClient(GOOD_REPLY + " You should buy."))
		assert gen.generate(evidence()) is None

	def test_a_reply_with_an_invented_number_is_refused(self):
		gen = QuantTraceGenerator(cfg(), client=FakeClient(GOOD_REPLY.replace("18.7", "22.9")))
		assert gen.generate(evidence()) is None

	def test_dash_punctuation_is_normalised_before_the_guard(self):
		gen = QuantTraceGenerator(cfg(), client=FakeClient(GOOD_REPLY.replace(", from", " — from")))
		out = gen.generate(evidence())
		assert out is not None and "—" not in out

	def test_unconfigured_groq_generates_nothing(self):
		assert NoClientGenerator(cfg()).generate(evidence()) is None

	def test_a_failing_client_is_retried_then_gives_up_quietly(self, monkeypatch):
		monkeypatch.setattr(tr.time, "sleep", lambda s: None)
		client = FakeClient(RuntimeError("429"))
		gen = QuantTraceGenerator(cfg(), client=client)
		assert gen.generate(evidence()) is None
		assert client.calls == QuantTraceGenerator.RETRIES + 1

	def test_no_evidence_never_reaches_the_model(self):
		client = FakeClient(GOOD_REPLY)
		gen = QuantTraceGenerator(cfg(), client=client)
		assert gen.generate(evidence(facts={})) is None
		assert client.calls == 0


# ─────────────────────────────────────────────────────────────────────────────
# the service
# ─────────────────────────────────────────────────────────────────────────────

class TestService:
	def test_nothing_happens_with_the_feature_off(self):
		repo = FakeRepo()
		history = FakeHistory()
		assert service(config=cfg(trace_enabled=False), repo=repo, history=history).trace_for("NVDA", "6M") is None
		assert history.calls == 0 and repo.writes == []

	def test_traces_need_the_history_they_are_written_from(self):
		assert service(history=FakeHistory(enabled=False)).trace_for("NVDA", "6M") is None

	def test_a_negative_fact_is_grounded_by_its_magnitude(self):
		"""The drawdown is stored as -18.7 and written as 'a fall of 18.7 percent'."""
		guard = TraceGuard(cfg())
		assert guard.ungrounded_numbers("the largest fall was 18.7 percent", evidence()) == []
		assert guard.ungrounded_numbers("the largest fall was -18.7 percent", evidence()) == []

	def test_a_stored_paragraph_is_served_without_fetching_or_generating(self):
		stored = {"trace": "stored words", "source": "model", "model": "m", "generated_at": "x"}
		repo = FakeRepo(stored=stored)
		history = FakeHistory()
		client = FakeClient(GOOD_REPLY)
		out = service(repo=repo, history=history, generator=QuantTraceGenerator(cfg(), client=client)).trace_for("nvda", "6m")
		assert out["trace"] == "stored words"
		assert history.calls == 0 and client.calls == 0 and repo.writes == []

	def test_a_new_window_is_generated_stored_and_marked_as_the_models(self):
		repo = FakeRepo()
		out = service(repo=repo).trace_for("NVDA", "6M")
		assert out["trace"] == GOOD_REPLY
		assert out["source"] == "model"
		assert out["model"] == "fake-model"
		assert len(repo.writes) == 1
		row = repo.writes[0]
		assert (row["ticker"], row["as_of_day"], row["horizon"], row["source"]) == ("NVDA", TODAY.isoformat(), "6M", "model")
		assert row["facts"]["window"]["last_close"] == 182.4
		assert row["facts"]["run"]["beta"] == 1.34
		assert repo.pruned

	def test_a_rand_window_is_written_in_rand_and_the_row_remembers_the_rate(self):
		repo = FakeRepo()
		out = service(repo=repo, history=FakeHistory(window=rand_window()), generator=NoClientGenerator(cfg())).trace_for("NVDA", "6M")
		assert "R3283.2" in out["trace"]
		assert (out["currency"], out["listing_currency"], out["fx_rate"]) == ("ZAR", "USD", 18.0)
		fp = repo.writes[0]["facts"]
		assert (fp["currency"], fp["listing_currency"], fp["fx_rate"]) == ("ZAR", "USD", 18.0)
		assert fp["window"]["last_close"] == 3283.2

	def test_a_paragraph_stored_before_rand_is_written_again(self):
		"""Its fingerprint names a currency but no listing currency: written over dollar closes."""
		stale = {"trace": "dollar words", "source": "model", "model": "m", "generated_at": "x",
			"facts": {"window": facts(), "run": run(), "currency": "USD"}}
		repo = FakeRepo(stored=stale)
		history = FakeHistory(window=rand_window())
		out = service(repo=repo, history=history, generator=NoClientGenerator(cfg())).trace_for("NVDA", "6M")
		assert out["trace"] != "dollar words"
		assert history.calls == 1 and len(repo.writes) == 1

	def test_a_paragraph_stored_in_rand_is_served_with_its_currency(self):
		stored = {"trace": "rand words", "source": "model", "model": "m", "generated_at": "x",
			"facts": {"window": rand_facts(), "run": run(), "currency": "ZAR", "listing_currency": "USD", "fx_rate": 18.0}}
		history = FakeHistory()
		out = service(repo=FakeRepo(stored=stored), history=history).trace_for("NVDA", "6M")
		assert out["trace"] == "rand words"
		assert (out["currency"], out["listing_currency"], out["fx_rate"]) == ("ZAR", "USD", 18.0)
		assert history.calls == 0

	def test_a_rejected_paragraph_falls_back_to_the_template_and_says_so(self):
		repo = FakeRepo()
		gen = QuantTraceGenerator(cfg(), client=FakeClient(GOOD_REPLY + " You should buy."))
		out = service(repo=repo, generator=gen).trace_for("NVDA", "6M")
		assert out["source"] == "template"
		assert out["model"] is None
		assert "most recent close" in out["trace"]
		assert repo.writes[0]["source"] == "template"

	def test_unconfigured_groq_still_yields_a_templated_paragraph(self):
		out = service(generator=NoClientGenerator(cfg())).trace_for("NVDA", "6M")
		assert out["source"] == "template"

	def test_no_window_means_no_paragraph(self):
		empty = {"ticker": "NVDA", "horizon": "6M", "currency": "", "exchange": "", "exchange_name": "", "points": [], "facts": None}
		repo = FakeRepo()
		assert service(repo=repo, history=FakeHistory(window=empty)).trace_for("NVDA", "6M") is None
		assert repo.writes == []

	def test_an_unknown_horizon_is_refused_quietly(self):
		assert service().trace_for("NVDA", "2W") is None

	def test_the_run_metrics_are_read_but_the_percentiles_are_not(self):
		repo = FakeRepo(metrics=run())
		service(repo=repo).trace_for("NVDA", "6M")
		assert repo.metric_reads == 1
		assert "momentum_pctile" not in repo.writes[0]["facts"]["run"]

	def test_a_failing_store_read_still_serves_a_paragraph(self):
		class BrokenRepo(FakeRepo):
			def read(self, ticker, day, horizon):
				raise RuntimeError("db down")

		# The service never raises; the endpoint gets None and the panel its quiet state.
		assert service(repo=BrokenRepo()).trace_for("NVDA", "6M") is None


# ─────────────────────────────────────────────────────────────────────────────
# the endpoint
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
	app = FastAPI()
	routes.mount_quant_routes(app)
	yield TestClient(app)
	monkeypatch.setattr(routes, "_trace_instance", None)


def test_the_endpoint_says_when_traces_are_off(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service(config=cfg(trace_enabled=False)))
	body = client.get("/api/assets/nvda/quant-trace?horizon=6M").json()
	assert body["available"] is False
	assert body["trace"] is None
	assert body["ticker"] == "NVDA"


def test_the_endpoint_serves_a_paragraph(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service())
	body = client.get("/api/assets/nvda/quant-trace?horizon=6m").json()
	assert body["available"] is True
	assert body["horizon"] == "6M"
	assert body["trace"] == GOOD_REPLY
	assert body["source"] == "model"


def test_the_endpoint_refuses_an_unknown_horizon(client, monkeypatch):
	monkeypatch.setattr(routes, "_trace_instance", service())
	assert client.get("/api/assets/nvda/quant-trace?horizon=2W").status_code == 400


def test_a_quiet_answer_is_still_available_true(client, monkeypatch):
	empty = {"ticker": "NVDA", "horizon": "6M", "currency": "", "exchange": "", "exchange_name": "", "points": [], "facts": None}
	monkeypatch.setattr(routes, "_trace_instance", service(history=FakeHistory(window=empty)))
	body = client.get("/api/assets/nvda/quant-trace?horizon=6M").json()
	assert body["available"] is True
	assert body["trace"] is None
	assert body["currency"] is None and body["fx_rate"] is None
