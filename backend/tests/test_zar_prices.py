"""Tests for the rand conversion in the save path.

The claim being defended is about time, not arithmetic. Saving a run's assets used
to fetch the USD/ZAR rate once per asset, and each fetch is a pair of slow yfinance
calls, so a 17 asset save spent about a minute an asset waiting on a rate that never
changed. One rate per run is the fix, and this pins it.

Nothing external is touched: yfinance is a fake that records what it was asked for.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

from src.utils import supabase_client as sc  # noqa: E402


class FakeYf:
	"""Stands in for yfinance, counting the symbols it was asked about.

	``USDZAR=X`` returns nothing, the way the live pair does, so the fallback to the
	inverted pair is exercised and counted like the real thing.
	"""

	def __init__(self, currency: str = "USD"):
		self.calls: list[str] = []
		self.currency = currency

	def Ticker(self, symbol: str):  # noqa: N802  (mirrors the yfinance API)
		self.calls.append(symbol)
		return FakeTicker(symbol, self)

	def counts(self, symbol: str) -> int:
		return sum(1 for call in self.calls if call == symbol)


class FakeTicker:
	def __init__(self, symbol: str, parent: FakeYf):
		self.symbol = symbol
		self.parent = parent
		self.fast_info = {"currency": parent.currency}

	def history(self, **_kwargs) -> pd.DataFrame:
		if self.symbol == "USDZAR=X":
			return pd.DataFrame()  # the live pair returns nothing
		if self.symbol == "ZARUSD=X":
			return pd.DataFrame({"Close": [0.05]})  # 1 rand = 0.05 dollars
		return pd.DataFrame({"Close": [100.0]})


def _converter(fake: FakeYf) -> sc.ZarPriceConverter:
	sc.yf = fake
	return sc.ZarPriceConverter()


def test_one_rate_serves_every_asset_in_a_run():
	fake = FakeYf()
	converter = _converter(fake)

	for ticker in ("AAPL", "MSFT", "GOOG", "NVDA", "AMD"):
		converter.price_in_zar(ticker)

	# One attempt at each pair, not one per asset.
	assert fake.counts("USDZAR=X") == 1
	assert fake.counts("ZARUSD=X") == 1


def test_a_ticker_currency_is_looked_up_once():
	fake = FakeYf()
	converter = _converter(fake)

	converter.price_in_zar("AAPL")
	converter.price_in_zar("AAPL")

	# Two price reads, because the price is what is being recorded, but the
	# currency behind them is only asked for once.
	assert fake.counts("AAPL") == 3


def test_the_price_is_converted_with_the_inverted_pair():
	converter = _converter(FakeYf())

	# 100 dollars at 1 rand = 0.05 dollars is 2000 rand.
	assert converter.price_in_zar("AAPL") == 2000.0


def test_a_rand_priced_ticker_needs_no_rate():
	fake = FakeYf(currency="ZAR")
	converter = _converter(fake)

	assert converter.price_in_zar("NPN.JO") == 100.0
	assert fake.counts("USDZAR=X") == 0


def test_rand_cents_are_divided_down():
	converter = _converter(FakeYf(currency="ZAC"))

	assert converter.price_in_zar("SOL.JO") == 1.0


def test_a_failed_rate_is_not_retried_for_every_asset():
	class NoRates(FakeYf):
		def Ticker(self, symbol: str):  # noqa: N802
			self.calls.append(symbol)
			ticker = FakeTicker(symbol, self)
			if symbol.endswith("=X"):
				ticker.history = lambda **_kwargs: pd.DataFrame()
			return ticker

	fake = NoRates()
	converter = _converter(fake)

	prices = [converter.price_in_zar(t) for t in ("AAPL", "MSFT", "GOOG")]

	# The unconverted close is still recorded rather than nothing, and the broken
	# pair was tried once rather than once per asset.
	assert prices == [100.0, 100.0, 100.0]
	assert fake.counts("USDZAR=X") == 1


def test_clearing_forces_a_fresh_rate():
	fake = FakeYf()
	converter = _converter(fake)

	converter.fx_rate("USD")
	converter.clear()
	converter.fx_rate("USD")

	assert fake.counts("USDZAR=X") == 2
