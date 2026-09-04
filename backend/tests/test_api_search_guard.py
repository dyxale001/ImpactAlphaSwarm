"""Tests for the asset-search exchange guard.

The claim being defended is a data-integrity one, not a cosmetic one. Asset
search feeds the watchlist, and a watchlisted ticker joins the next analysis run.
A JSE listing that got that far would be priced as dollars when its quote is
actually rand cents, and would find no sentiment coverage at all — so it would
be scored, ranked and shown against US equities on numbers that mean nothing.
A JSE fund belongs in the funds catalogue, which reads published fact sheets.

The exchange codes are not invented here: they were read off live Yahoo search
responses for US and South African names.

No network: the filter is a pure function over the shape Yahoo returns.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.api import (  # noqa: E402
    SEARCH_RESULT_LIMIT,
    SEARCHABLE_QUOTE_TYPES,
    US_EXCHANGE_CODES,
    _filter_search_quotes,
    _is_us_listed,
)


def quote(symbol: str, exchange: str, quote_type: str = "EQUITY") -> dict:
    return {"symbol": symbol, "exchange": exchange, "quoteType": quote_type, "shortname": symbol}


class TestUsListings:
    @pytest.mark.parametrize(
        "symbol,exchange",
        [
            ("AAPL", "NMS"),    # NASDAQ
            ("QQQ", "NGM"),     # NASDAQ, second code
            ("BRK-B", "NYQ"),   # NYSE, share class written with a hyphen
            ("IVV", "PCX"),     # NYSE Arca, where most US ETFs answer
            ("SPYI", "BTS"),    # BATS
            ("NPSNY", "PNK"),   # US over-the-counter, deliberately included
            ("AAUKF", "OQX"),
        ],
    )
    def test_a_us_venue_passes(self, symbol, exchange):
        assert _is_us_listed(quote(symbol, exchange)) is True

    @pytest.mark.parametrize(
        "symbol,exchange",
        [
            ("STX40.JO", "JNB"),   # the case this guard exists for
            ("AGL.JO", "JNB"),
            ("AAL.L", "LSE"),
            ("SXR8.DE", "GER"),
            ("PRX.AS", "AMS"),
            ("XEQT.TO", "TOR"),
            ("MSFT34.SA", "SAO"),
            ("PRX.SW", "EBS"),
        ],
    )
    def test_a_foreign_venue_is_dropped(self, symbol, exchange):
        assert _is_us_listed(quote(symbol, exchange)) is False

    def test_a_missing_exchange_is_dropped(self):
        # Unknown provenance is not a US listing.
        assert _is_us_listed({"symbol": "AAPL"}) is False
        assert _is_us_listed({"symbol": "AAPL", "exchange": None}) is False

    def test_the_symbol_suffix_is_a_backstop_for_an_unknown_code(self):
        # A venue code we have never seen must not slip through on the strength
        # of the code alone. Every foreign listing Yahoo returns has a suffix.
        assert _is_us_listed(quote("STX40.JO", "NMS")) is False

    def test_the_code_check_is_case_insensitive(self):
        assert _is_us_listed(quote("AAPL", "nms")) is True


class TestTheFilter:
    def test_a_jse_fund_never_reaches_the_results(self):
        quotes = [quote("STX40.JO", "JNB"), quote("AAPL", "NMS")]
        assert [row["symbol"] for row in _filter_search_quotes(quotes)] == ["AAPL"]

    def test_crypto_futures_and_indices_are_still_dropped(self):
        quotes = [
            quote("BTC-USD", "CCC", "CRYPTOCURRENCY"),
            quote("^GSPC", "SNP", "INDEX"),
            quote("ES=F", "CME", "FUTURE"),
            quote("AAPL", "NMS"),
        ]
        assert [row["symbol"] for row in _filter_search_quotes(quotes)] == ["AAPL"]

    def test_us_etfs_are_kept(self):
        # The existing behaviour, unchanged: a US ETF is a legitimate search hit.
        quotes = [quote("IVV", "PCX", "ETF")]
        assert len(_filter_search_quotes(quotes)) == 1

    def test_filtering_happens_before_the_slice(self):
        # REGRESSION GUARD. Filtering after the slice would fill all six slots
        # with JSE listings, discard them, and return one result when seven
        # valid ones existed.
        quotes = [quote(f"X{i}.JO", "JNB") for i in range(6)] + [
            quote(f"US{i}", "NMS") for i in range(7)
        ]
        kept = _filter_search_quotes(quotes)
        assert len(kept) == SEARCH_RESULT_LIMIT
        assert all(row["exchange"] == "NMS" for row in kept)

    def test_the_result_count_is_capped(self):
        quotes = [quote(f"US{i}", "NMS") for i in range(20)]
        assert len(_filter_search_quotes(quotes)) == SEARCH_RESULT_LIMIT

    def test_no_quotes_gives_no_results(self):
        assert _filter_search_quotes([]) == []

    def test_order_is_preserved(self):
        # Yahoo returns its own relevance order and the endpoint does not
        # re-rank; the guard must not either.
        quotes = [quote("MSFT", "NMS"), quote("AAPL", "NMS"), quote("GOOG", "NMS")]
        assert [row["symbol"] for row in _filter_search_quotes(quotes)] == ["MSFT", "AAPL", "GOOG"]


class TestTheConstants:
    def test_the_venues_are_the_ones_observed_live(self):
        # PINNED VALUE. Read off live Yahoo search responses; a code removed
        # here silently stops a real US venue being searchable.
        assert US_EXCHANGE_CODES == {"NMS", "NGM", "NCM", "NYQ", "ASE", "PCX", "BTS", "PNK", "OQB", "OQX"}

    def test_no_foreign_venue_is_on_the_list(self):
        for code in ("JNB", "LSE", "GER", "AMS", "TOR", "SAO", "EBS", "MIL", "FRA", "SET"):
            assert code not in US_EXCHANGE_CODES, code

    def test_only_priceable_instruments_are_searchable(self):
        assert SEARCHABLE_QUOTE_TYPES == {"EQUITY", "ETF"}
