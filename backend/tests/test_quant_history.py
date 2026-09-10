"""Tests for the Quant tab's historical windows (src/quant/history.py).

Nothing external is touched: the data source is a fake that hands back a constructed
frame, and every fact is asserted against an independent plain-Python reference rather
than re-derived with pandas.

The claims that matter:

  * the window is trimmed to the horizon but the indicators were computed on the longer
    fetch, so the first plotted RSI is a settled reading and not warm-up noise;
  * the facts are computed on the full daily series even when the plotted series is
    thinned, so a five year chart's "high" is the real high and not the highest point
    that survived the stride;
  * a window is fetched once a day and served from memory after that;
  * the endpoint answers quietly when the feature is off, and refuses a horizon it does
    not know rather than guessing.
"""

from __future__ import annotations

import datetime
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.quant_analyst import RSI, MarketDataSource  # noqa: E402
from src.quant import routes  # noqa: E402
from src.quant.config import QuantViewConfig  # noqa: E402
from src.quant.history import (  # noqa: E402
	HORIZONS,
	MIN_POINTS,
	WARMUP_DAYS,
	QuantHistoryService,
	TTLCache,
	WindowFacts,
	exchange_name,
)

TODAY = datetime.date(2026, 9, 10)


def cfg(**overrides) -> QuantViewConfig:
	base = dict(history_enabled=True, history_cache_minutes=720, history_max_points=260)
	base.update(overrides)
	return QuantViewConfig(**base)


def frame(start: datetime.date, end: datetime.date, seed: int = 7, start_price: float = 100.0) -> pd.DataFrame:
	"""A business-day close series between two dates, deterministic and non-degenerate."""
	index = pd.bdate_range(start=start, end=end - datetime.timedelta(days=1))
	rng = np.random.default_rng(seed)
	returns = rng.normal(0.0005, 0.015, len(index))
	levels = [start_price]
	for r in returns[1:]:
		levels.append(levels[-1] * (1.0 + r))
	closes = pd.Series(levels, index=index, dtype=float)
	# yfinance 1.x hands back MultiIndex columns for a single ticker; the service must
	# cope with that shape, so the fake produces it.
	return pd.DataFrame({("Close", "TEST"): closes, ("Volume", "TEST"): 1000.0})


class FakeSource:
	def __init__(self, data: pd.DataFrame | None = None, profile: dict | None = None, fail: bool = False):
		self.data = data
		self.profile_data = profile or {"currency": "USD", "exchange": "NMS"}
		self.fail = fail
		self.calls: list[tuple[str, datetime.date, datetime.date]] = []

	def history_between(self, ticker, start, end):
		self.calls.append((ticker, start, end))
		if self.fail:
			raise RuntimeError("yfinance down")
		if self.data is not None:
			return self.data
		return frame(start, end)

	def profile(self, ticker):
		return dict(self.profile_data)


def service(config=None, source=None, cache=None) -> QuantHistoryService:
	return QuantHistoryService(
		config=config or cfg(),
		data_source=source or FakeSource(),
		cache=cache if cache is not None else TTLCache(3600),
		today=lambda: TODAY,
	)


# ─────────────────────────────────────────────────────────────────────────────
# the window
# ─────────────────────────────────────────────────────────────────────────────

class TestWindow:
	def test_the_fetch_starts_before_the_window_by_the_warm_up(self):
		src = FakeSource()
		service(source=src).window("test", "6M")
		(_, start, end), = src.calls
		assert end == TODAY + datetime.timedelta(days=1)
		assert start == TODAY - datetime.timedelta(days=HORIZONS["6M"] + WARMUP_DAYS)

	def test_the_plotted_series_is_trimmed_to_the_horizon(self):
		out = service().window("test", "1M")
		window_start = (TODAY - datetime.timedelta(days=HORIZONS["1M"])).isoformat()
		assert out["points"], "a month of business days must plot"
		assert all(p["date"] >= window_start for p in out["points"])
		assert out["facts"]["start"] == out["points"][0]["date"]
		assert out["facts"]["end"] == out["points"][-1]["date"]

	def test_the_first_plotted_rsi_is_a_settled_reading_not_warm_up(self):
		out = service().window("test", "1M")
		first = out["points"][0]
		assert first["rsi"] is not None
		assert 0.0 <= first["rsi"] <= 100.0

	def test_rsi_on_the_window_matches_the_indicator_on_the_full_series(self):
		"""The chart's line and the run's reading must be the same arithmetic."""
		src = FakeSource()
		out = service(source=src).window("test", "6M")
		(_, start, end), = src.calls
		full = frame(start, end)[("Close", "TEST")]
		expected_last = RSI().compute(full)
		assert out["points"][-1]["rsi"] == pytest.approx(round(expected_last, 1), abs=0.051)

	def test_the_ticker_and_horizon_are_normalised(self):
		out = service().window("nvda", "6m")
		assert out["ticker"] == "NVDA"
		assert out["horizon"] == "6M"

	def test_the_listing_is_named_for_a_reader(self):
		out = service().window("test", "1M")
		assert out["currency"] == "USD"
		assert out["exchange"] == "NMS"
		assert out["exchange_name"] == "Nasdaq"

	def test_an_unknown_horizon_is_refused(self):
		with pytest.raises(ValueError):
			service().window("test", "2W")

	def test_a_failed_fetch_is_an_empty_window_not_an_error(self):
		out = service(source=FakeSource(fail=True)).window("test", "6M")
		assert out["points"] == []
		assert out["facts"] is None
		assert out["ticker"] == "TEST"

	def test_a_ticker_with_nothing_is_an_empty_window(self):
		out = service(source=FakeSource(data=pd.DataFrame())).window("test", "6M")
		assert out["points"] == []
		assert out["facts"] is None

	def test_too_few_closes_in_the_window_are_reported_as_thin(self):
		# Plenty of warm-up history, but the window itself holds two days.
		start = TODAY - datetime.timedelta(days=400)
		end = TODAY - datetime.timedelta(days=HORIZONS["1M"] - 3)
		src = FakeSource(data=frame(start, end))
		out = service(source=src).window("test", "1M")
		assert len([p for p in out["points"]]) < MIN_POINTS
		assert out["points"] == []


# ─────────────────────────────────────────────────────────────────────────────
# thinning
# ─────────────────────────────────────────────────────────────────────────────

class TestThinning:
	def test_a_long_horizon_is_thinned_to_at_most_the_cap_plus_the_last_point(self):
		out = service(config=cfg(history_max_points=100)).window("test", "5Y")
		# A whole-number stride lands under the cap, never over it; the one point that
		# may be added back is the series' last close.
		assert 50 < len(out["points"]) <= 101
		assert len(out["points"]) < out["facts"]["trading_days"]

	def test_the_last_close_always_survives_thinning(self):
		src = FakeSource()
		out = service(config=cfg(history_max_points=50), source=src).window("test", "5Y")
		(_, start, end), = src.calls
		full = frame(start, end)[("Close", "TEST")]
		assert out["points"][-1]["close"] == pytest.approx(round(float(full.iloc[-1]), 4))
		assert out["points"][-1]["date"] == full.index[-1].date().isoformat()

	def test_facts_are_computed_on_the_full_series_not_the_thinned_one(self):
		src = FakeSource()
		out = service(config=cfg(history_max_points=30), source=src).window("test", "5Y")
		(_, start, end), = src.calls
		full = frame(start, end)[("Close", "TEST")]
		window_start = (TODAY - datetime.timedelta(days=HORIZONS["5Y"])).isoformat()
		in_window = full[[d.date().isoformat() >= window_start for d in full.index]]
		assert out["facts"]["high"] == pytest.approx(round(float(in_window.max()), 4))
		assert out["facts"]["low"] == pytest.approx(round(float(in_window.min()), 4))
		assert out["facts"]["trading_days"] == len(in_window)
		# and the thinned series genuinely dropped points, so the assertion above bites
		assert len(out["points"]) < len(in_window)

	def test_a_short_horizon_is_not_thinned(self):
		out = service().window("test", "1M")
		assert len(out["points"]) == out["facts"]["trading_days"]


# ─────────────────────────────────────────────────────────────────────────────
# facts, against a plain-Python reference
# ─────────────────────────────────────────────────────────────────────────────

class TestWindowFacts:
	DATES = [f"2026-01-{d:02d}" for d in range(1, 9)]
	CLOSES = [100.0, 110.0, 99.0, 104.5, 120.0, 90.0, 96.0, 108.0]
	RSI = [None, 55.0, 28.0, 45.0, 75.0, 71.0, 20.0, 50.0]

	def facts(self):
		return WindowFacts.compute(self.DATES, self.CLOSES, self.RSI)

	def test_change_is_last_over_first(self):
		assert self.facts()["change_pct"] == pytest.approx(8.0)

	def test_high_and_low_carry_their_dates(self):
		f = self.facts()
		assert (f["high"], f["high_date"]) == (120.0, "2026-01-05")
		assert (f["low"], f["low_date"]) == (90.0, "2026-01-06")

	def test_max_drawdown_is_the_worst_peak_to_trough_fall(self):
		# Peak 120 on the 5th, trough 90 on the 6th: 90/120 - 1 = -25%.
		assert self.facts()["max_drawdown_pct"] == pytest.approx(-25.0)

	def test_drawdown_is_zero_for_a_series_that_only_rises(self):
		f = WindowFacts.compute(self.DATES[:4], [1.0, 2.0, 3.0, 4.0], [None] * 4)
		assert f["max_drawdown_pct"] == 0.0

	def test_rsi_day_counts_use_the_band_thresholds(self):
		f = self.facts()
		assert f["days_rsi_overbought"] == 2  # 75, 71
		assert f["days_rsi_oversold"] == 2  # 28, 20
		assert f["rsi_days_measured"] == 7
		assert f["latest_rsi"] == 50.0

	def test_volatility_is_the_annualised_sample_stdev_of_daily_returns(self):
		returns = [self.CLOSES[i] / self.CLOSES[i - 1] - 1 for i in range(1, len(self.CLOSES))]
		mean = sum(returns) / len(returns)
		var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
		expected = math.sqrt(var) * math.sqrt(252) * 100
		assert self.facts()["volatility_pct"] == pytest.approx(round(expected, 1))

	def test_a_single_close_supports_no_facts(self):
		assert WindowFacts.compute(["2026-01-01"], [100.0], [None]) is None

	def test_a_window_with_no_rsi_readings_says_so(self):
		f = WindowFacts.compute(self.DATES[:3], [1.0, 2.0, 3.0], [None, None, None])
		assert f["latest_rsi"] is None
		assert f["rsi_days_measured"] == 0
		assert f["days_rsi_overbought"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# the cache
# ─────────────────────────────────────────────────────────────────────────────

class TestCache:
	def test_a_window_is_fetched_once_a_day(self):
		src = FakeSource()
		svc = service(source=src)
		svc.window("test", "6M")
		svc.window("test", "6M")
		svc.window("TEST", "6m")
		assert len(src.calls) == 1

	def test_horizons_are_cached_separately(self):
		src = FakeSource()
		svc = service(source=src)
		svc.window("test", "1M")
		svc.window("test", "6M")
		assert len(src.calls) == 2

	def test_an_empty_window_is_not_pinned_for_the_day(self):
		src = FakeSource(fail=True)
		svc = service(source=src)
		svc.window("test", "6M")
		src.fail = False
		out = svc.window("test", "6M")
		assert len(src.calls) == 2
		assert out["points"]

	def test_the_cache_expires(self):
		now = [0.0]
		cache = TTLCache(ttl_seconds=10, clock=lambda: now[0])
		cache.put("k", "v")
		assert cache.get("k") == "v"
		now[0] = 11.0
		assert cache.get("k") is None

	def test_the_cache_is_bounded_oldest_first(self):
		now = [0.0]
		cache = TTLCache(ttl_seconds=100, max_entries=2, clock=lambda: now[0])
		cache.put("a", 1)
		now[0] = 1.0
		cache.put("b", 2)
		now[0] = 2.0
		cache.put("c", 3)
		assert len(cache) == 2
		assert cache.get("a") is None
		assert cache.get("c") == 3


# ─────────────────────────────────────────────────────────────────────────────
# the endpoint
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
	app = FastAPI()
	routes.mount_quant_routes(app)
	yield TestClient(app)
	monkeypatch.setattr(routes, "_history_instance", None)


def install(monkeypatch, svc):
	monkeypatch.setattr(routes, "_history_instance", svc)


def test_the_endpoint_says_when_the_feature_is_off(client, monkeypatch):
	install(monkeypatch, service(config=cfg(history_enabled=False)))
	res = client.get("/api/assets/nvda/quant-history?horizon=6M")
	assert res.status_code == 200
	body = res.json()
	assert body["available"] is False
	assert body["points"] == []
	assert body["ticker"] == "NVDA"


def test_the_endpoint_serves_a_window(client, monkeypatch):
	install(monkeypatch, service())
	res = client.get("/api/assets/test/quant-history?horizon=1m")
	assert res.status_code == 200
	body = res.json()
	assert body["available"] is True
	assert body["horizon"] == "1M"
	assert body["points"]
	assert body["facts"]["trading_days"] == len(body["points"])
	assert body["exchange_name"] == "Nasdaq"


def test_the_endpoint_defaults_to_six_months(client, monkeypatch):
	install(monkeypatch, service())
	assert client.get("/api/assets/test/quant-history").json()["horizon"] == "6M"


def test_the_endpoint_refuses_an_unknown_horizon(client, monkeypatch):
	install(monkeypatch, service())
	res = client.get("/api/assets/test/quant-history?horizon=2W")
	assert res.status_code == 400
	assert "1M" in res.json()["detail"]


def test_a_failed_fetch_is_an_empty_window_at_the_endpoint_too(client, monkeypatch):
	install(monkeypatch, service(source=FakeSource(fail=True)))
	body = client.get("/api/assets/test/quant-history?horizon=6M").json()
	assert body["available"] is True
	assert body["points"] == []
	assert body["facts"] is None


# ─────────────────────────────────────────────────────────────────────────────
# small pieces
# ─────────────────────────────────────────────────────────────────────────────

def test_exchange_codes_are_named_and_unknown_ones_pass_through():
	assert exchange_name("NMS") == "Nasdaq"
	assert exchange_name("nyq") == "NYSE"
	assert exchange_name("XYZ") == "XYZ"
	assert exchange_name(None) == ""


def test_the_real_data_source_exposes_the_dated_fetch_and_the_profile():
	"""The service is typed against MarketDataSource; the fake must match its surface."""
	assert callable(getattr(MarketDataSource, "history_between"))
	assert callable(getattr(MarketDataSource, "profile"))
