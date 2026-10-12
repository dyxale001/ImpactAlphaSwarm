"""Tests for the exchange lookup behind the asset page's exchange line (src/quant/listing.py).

Nothing external is touched: the data source is a fake that counts its calls.

The claims that matter:

  * Yahoo's exchange codes come back as the names a reader knows (NMS is Nasdaq);
  * a ticker is looked up once a day and served from memory after that;
  * a failed or empty lookup answers with blanks, and is not cached, so the next visit
    tries again rather than showing no exchange for a day;
  * the filler stores a name only for rows it found one for, and leaves the rest empty
    for the next night rather than writing a blank.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.quant import routes  # noqa: E402
from src.quant.listing import ExchangeFiller, ListingService  # noqa: E402


class FakeSource:
	def __init__(self, exchange: str = "NMS", fail: bool = False):
		self.exchange = exchange
		self.fail = fail
		self.calls = 0

	def profile(self, ticker: str) -> dict[str, str]:
		self.calls += 1
		if self.fail:
			raise RuntimeError("yahoo is down")
		return {"currency": "USD", "exchange": self.exchange}


@pytest.fixture
def client():
	app = FastAPI()
	routes.mount_quant_routes(app)
	return TestClient(app)


@pytest.mark.parametrize("code, name", [("NMS", "Nasdaq"), ("NGM", "Nasdaq"), ("NYQ", "NYSE")])
def test_the_exchange_is_named_as_a_reader_knows_it(code, name):
	body = ListingService(data_source=FakeSource(exchange=code)).listing("nvda")
	assert body == {"ticker": "NVDA", "exchange": code, "exchange_name": name}


def test_a_ticker_is_looked_up_once_and_then_served_from_memory():
	source = FakeSource()
	svc = ListingService(data_source=source)
	svc.listing("NVDA")
	svc.listing("nvda")
	assert source.calls == 1


def test_a_failed_lookup_is_blank_and_retried_next_time():
	source = FakeSource(fail=True)
	svc = ListingService(data_source=source)
	assert svc.listing("NVDA")["exchange_name"] == ""
	svc.listing("NVDA")
	assert source.calls == 2


def test_an_empty_lookup_is_not_cached():
	source = FakeSource(exchange="")
	svc = ListingService(data_source=source)
	assert svc.listing("NVDA")["exchange_name"] == ""
	svc.listing("NVDA")
	assert source.calls == 2


def test_the_endpoint_serves_the_listing(client, monkeypatch):
	monkeypatch.setattr(routes, "_listing_instance", ListingService(data_source=FakeSource("NYQ")))
	res = client.get("/api/assets/ko/listing")
	assert res.status_code == 200
	assert res.json() == {"ticker": "KO", "exchange": "NYQ", "exchange_name": "NYSE"}


class FakeAssets:
	def __init__(self, missing: list[str], fail_writes: set[str] | None = None):
		self.missing = missing
		self.fail_writes = fail_writes or set()
		self.written: dict[str, str] = {}

	def tickers_missing_exchange(self) -> list[str]:
		return list(self.missing)

	def set_exchange(self, ticker: str, exchange: str) -> bool:
		if ticker in self.fail_writes:
			return False
		self.written[ticker] = exchange
		return True


class SourceByTicker:
	def __init__(self, codes: dict[str, str]):
		self.codes = codes

	def profile(self, ticker: str) -> dict[str, str]:
		return {"currency": "USD", "exchange": self.codes.get(ticker, "")}


def a_filler(assets, codes):
	return ExchangeFiller(assets=assets, listings=ListingService(data_source=SourceByTicker(codes)))


def test_the_filler_stores_the_reader_name_for_each_empty_row():
	assets = FakeAssets(["KO", "NVDA"])
	result = a_filler(assets, {"KO": "NYQ", "NVDA": "NMS"}).fill()
	assert assets.written == {"KO": "NYSE", "NVDA": "Nasdaq"}
	assert result == {"stored": {"KO": "NYSE", "NVDA": "Nasdaq"}, "unknown": []}


def test_a_ticker_the_lookup_cannot_place_is_left_empty_not_blanked():
	assets = FakeAssets(["KO", "ODD"])
	result = a_filler(assets, {"KO": "NYQ"}).fill()
	assert assets.written == {"KO": "NYSE"}
	assert result["unknown"] == ["ODD"]


def test_a_failed_write_is_not_reported_as_stored():
	assets = FakeAssets(["KO"], fail_writes={"KO"})
	assert a_filler(assets, {"KO": "NYQ"}).fill()["stored"] == {}


def test_nothing_missing_means_no_lookups():
	source = FakeSource()
	ExchangeFiller(assets=FakeAssets([]), listings=ListingService(data_source=source)).fill()
	assert source.calls == 0
