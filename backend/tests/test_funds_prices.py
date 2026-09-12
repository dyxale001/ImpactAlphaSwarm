"""Tests for the fund price series.

Two claims.

The first is that **a unit trust never gets a price**. It is not listed — units
are bought from the manager at a daily NAV — so there is no market price to
draw, and inventing one would put a fabricated series beside figures taken off a
regulated document. The design note names exactly this ("fabricated unit-trust
price series") as a rejected alternative.

The second is the **rand-cent conversion**. The JSE quotes many instruments in
cents, so a close of 11010 is R110.10. Getting this wrong is not a rendering
detail: it misstates the price by a hundred times, and it looks perfectly
plausible on a chart with no axis the reader can check against.

No network: yfinance and the currency lookup are both stubbed.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fund_fakes import FakeClient  # noqa: E402
from src.funds import prices as prices_module  # noqa: E402
from src.funds.prices import refresh_fund, rows_for  # noqa: E402
from src.funds.repository import FundRepository  # noqa: E402


class _Series(dict):
    """Just enough of a pandas column for the loop under test."""

    def items(self):  # noqa: A003
        return list(super().items())


class _Frame:
    def __init__(self, closes):
        self._closes = _Series(closes)
        self.empty = not closes

    def __contains__(self, key):
        return key == "Close"

    def __getitem__(self, key):
        return self._closes


class _Stamp:
    def __init__(self, day):
        self._day = day

    def date(self):
        return self._day


@pytest.fixture
def stub_yfinance(monkeypatch):
    """Return a canned history and a controllable currency."""

    state = {"currency": "ZAc", "closes": {}, "symbol": None}

    class _Ticker:
        def __init__(self, symbol):
            state["symbol"] = symbol

        def history(self, **_kw):
            return _Frame(state["closes"])

    module = type("yf", (), {"Ticker": _Ticker})
    monkeypatch.setitem(sys.modules, "yfinance", module)
    monkeypatch.setattr(
        prices_module.zar_prices, "currency_of", lambda _s: state["currency"], raising=False
    )
    return state


class TestRandCents:
    """INVARIANT: a cent-quoted close is stored in rand."""

    def test_cents_are_divided_by_a_hundred(self, stub_yfinance):
        stub_yfinance["closes"] = {_Stamp(date(2026, 9, 4)): 11010.0}
        assert prices_module.fetch_closes("STX40.JO") == [(date(2026, 9, 4), 110.10)]

    def test_a_rand_quoted_close_is_left_alone(self, stub_yfinance):
        stub_yfinance["currency"] = "ZAR"
        stub_yfinance["closes"] = {_Stamp(date(2026, 9, 4)): 110.10}
        assert prices_module.fetch_closes("SOMETHING.JO") == [(date(2026, 9, 4), 110.10)]

    def test_the_currency_is_looked_up_not_assumed(self, stub_yfinance):
        # Every JSE instrument being cent-quoted is nearly true, and "nearly"
        # is what would make this wrong for the one that is not.
        stub_yfinance["currency"] = "USD"
        stub_yfinance["closes"] = {_Stamp(date(2026, 9, 4)): 50.0}
        assert prices_module.fetch_closes("X")[0][1] == 50.0


class TestUnlistedFundsHaveNoPrice:
    """INVARIANT: nothing fabricates a series for a unit trust."""

    def test_a_fund_without_a_symbol_is_skipped(self):
        repo = FundRepository(FakeClient())
        unit_trust = {"id": "f-1", "name": "A Unit Trust", "yahoo_symbol": None}
        assert refresh_fund(repo, unit_trust) == 0

    def test_an_empty_symbol_counts_as_none(self):
        repo = FundRepository(FakeClient())
        assert refresh_fund(repo, {"id": "f-1", "name": "x", "yahoo_symbol": "   "}) == 0

    def test_nothing_is_written_for_one(self):
        client = FakeClient()
        refresh_fund(FundRepository(client), {"id": "f-1", "name": "x", "yahoo_symbol": ""})
        assert client.calls_on("fund_prices") == []


class TestBadDataDegrades:
    """INVARIANT: a broken feed loses the chart, not the page."""

    def test_a_fetch_failure_is_an_empty_series(self, monkeypatch):
        class _Exploding:
            def __init__(self, _s):
                raise RuntimeError("Yahoo is down")

        monkeypatch.setitem(sys.modules, "yfinance", type("yf", (), {"Ticker": _Exploding}))
        assert prices_module.fetch_closes("STX40.JO") == []

    def test_a_non_trading_day_is_dropped(self, stub_yfinance):
        stub_yfinance["closes"] = {
            _Stamp(date(2026, 9, 3)): float("nan"),
            _Stamp(date(2026, 9, 4)): 11010.0,
        }
        assert prices_module.fetch_closes("STX40.JO") == [(date(2026, 9, 4), 110.10)]

    def test_an_empty_history_writes_nothing(self, stub_yfinance):
        repo = FundRepository(FakeClient())
        stub_yfinance["closes"] = {}
        assert refresh_fund(repo, {"id": "f-1", "name": "x", "yahoo_symbol": "STX40.JO"}) == 0


class TestStoring:
    def test_rows_carry_the_fund_and_an_iso_date(self):
        rows = rows_for("f-1", [(date(2026, 9, 4), 110.10)])
        assert rows == [{"fund_id": "f-1", "price_date": "2026-09-04", "close_zar": 110.10}]

    def test_storing_is_keyed_so_a_rerun_replaces(self):
        client = FakeClient()
        FundRepository(client).upsert_prices(rows_for("f-1", [(date(2026, 9, 4), 1.0)]))
        call = [c for c in client.calls_on("fund_prices") if c[0] == "upsert"][0]
        assert call[2].get("on_conflict") == "fund_id,price_date"

    def test_an_empty_write_touches_nothing(self):
        client = FakeClient()
        assert FundRepository(client).upsert_prices([]) == []
        assert client.calls_on("fund_prices") == []

    def test_reading_asks_newest_first_then_returns_oldest_first(self):
        # Two halves of one behaviour. The query asks for the NEWEST rows, so a
        # fund with years of history yields the recent window rather than the
        # first page of it — then they are reversed, because a chart plots
        # forwards. The fixture is in the order the database would return.
        client = FakeClient(
            rows={
                "fund_prices": [
                    {"price_date": "2026-09-02", "close_zar": 2.0},
                    {"price_date": "2026-09-01", "close_zar": 1.0},
                ]
            }
        )
        got = FundRepository(client).prices("f-1")
        assert [r["price_date"] for r in got] == ["2026-09-01", "2026-09-02"]
        assert client.orderings_on("fund_prices") == [(("price_date",), {"desc": True})]
