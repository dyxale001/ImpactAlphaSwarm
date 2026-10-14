"""Tests for the Insider trading tab's 90 day window (src/utils/ww_sources.py, ww_store.py).

"Recent" used to mean the newest 25 Finnhub rows, which was three days for AMD and seven
months for ENPH, with option exercises filling slots as fake trades. What is asserted:
derivative rows are gone, only dealings traded inside the window are kept and served,
batches of one dealing are summed, rows cached in the old shape are refetched, and the
note says what span its "no purchase" covers.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.ww_config import WhaleConfig  # noqa: E402
from src.utils.ww_insider_trace import InsiderEvidence, InsiderMeaning  # noqa: E402
from src.utils.ww_sources import FinnhubInsiderSource, InsiderWindow  # noqa: E402
from src.utils.ww_store import InsiderCache  # noqa: E402

TODAY = datetime.date(2026, 10, 12)
NOW = datetime.datetime(2026, 10, 12, 12, 0, tzinfo=datetime.timezone.utc).isoformat()


def window(days: int = 90) -> InsiderWindow:
    return InsiderWindow(days, today=TODAY)


def row(name, code, change, day, price=None, filed=None, derivative=False):
    return {
        "name": name, "transactionCode": code, "change": change, "transactionDate": day,
        "filingDate": filed or day, "transactionPrice": price, "isDerivative": derivative,
    }


def parse(*rows, days: int = 90) -> list[dict]:
    source = FinnhubInsiderSource(WhaleConfig(insider_window_days=days))
    return source._parse({"data": list(rows)}, window=window(days))


# ── the window ───────────────────────────────────────────────────────────────

def test_window_is_the_same_span_for_every_company_dated_by_the_trade():
    w = window()
    assert w.start == datetime.date(2026, 7, 14)
    assert w.contains("2026-07-14") and not w.contains("2026-07-13")
    # Dated by the trade, not the later filing.
    assert not w.contains("2026-07-01", "2026-07-20")
    # No trade date: the filing stands in.
    assert w.contains(None, "2026-09-01")
    assert not w.contains(None, None) and not w.contains("garbage")


def test_only_dealings_traded_inside_the_window_are_kept():
    out = parse(
        row("A", "S", -100, "2026-10-01", 10.0),
        row("B", "P", 500, "2026-05-04", 10.0),  # a purchase, but from May
    )
    assert [t["name"] for t in out] == ["A"]


def test_derivative_rows_are_dropped_so_an_exercise_is_not_a_fake_sale():
    # Musk's June exercise as Finnhub sends it: options out, shares in, tax withheld.
    out = parse(
        row("MUSK ELON", "M", -303_960_630, "2026-09-16", 0, derivative=True),
        row("MUSK ELON", "M", 303_960_630, "2026-09-16", 23.34),
        row("MUSK ELON", "F", -17_531_857, "2026-09-16", 404.66),
    )
    assert sorted((t["transaction_code"], t["type"]) for t in out) == [("F", "sell"), ("M", "buy")]


def test_batches_of_one_dealing_are_summed_into_one_row():
    out = parse(
        row("SU LISA", "S", -1000, "2026-09-15", 160.0, filed="2026-09-16"),
        row("SU LISA", "S", -3000, "2026-09-15", 162.0, filed="2026-09-17"),
        row("SU LISA", "S", -500, "2026-09-16", 165.0),
    )
    assert len(out) == 2
    day = next(t for t in out if t["transaction_date"] == "2026-09-15")
    assert day["shares"] == 4000 and day["lots"] == 2
    assert day["value"] == 646_000.0 and day["price"] == 161.5
    assert day["filing_date"] == "2026-09-17"


def test_a_batch_without_a_price_leaves_the_total_unpriced_not_understated():
    out = parse(
        row("X", "S", -1000, "2026-09-15", 10.0),
        row("X", "S", -1000, "2026-09-15", None),
    )
    assert out[0]["value"] is None and out[0]["price"] is None and out[0]["shares"] == 2000


def test_a_single_open_market_dealing_keeps_its_own_price():
    out = parse(row("X", "P", 1000, "2026-09-15", 12.5))
    assert out[0]["price"] == 12.5 and out[0]["value"] == 12_500.0 and out[0]["lots"] == 1


def test_only_open_market_dealings_carry_a_price_and_a_value():
    # The exercise priced at its $23.34 strike read as a $7.1B purchase by Musk.
    out = {t["transaction_code"]: t for t in parse(
        row("MUSK ELON", "M", 303_960_630, "2026-09-16", 23.34),
        row("MUSK ELON", "F", -17_531_857, "2026-09-16", 404.66),
        row("COOK TIMOTHY D", "A", 1000, "2026-09-15", 0),
        row("COOK TIMOTHY D", "S", -1000, "2026-09-17", 250.0),
    )}
    for code in ("M", "F", "A"):
        assert out[code]["price"] is None and out[code]["value"] is None
    assert out["S"]["value"] == 250_000.0
    # The shares still show, so the row is not empty.
    assert out["M"]["shares"] == 303_960_630


def test_the_backstop_cap_still_applies_inside_the_window():
    rows = [row(f"N{i}", "S", -10, "2026-09-15", 1.0) for i in range(5)]
    source = FinnhubInsiderSource(WhaleConfig(insider_window_days=90, insider_max_transactions=3))
    assert len(source._parse({"data": rows}, window=window())) == 3


# ── the cache ────────────────────────────────────────────────────────────────

def test_serving_applies_the_window_and_says_what_it_is():
    cache = InsiderCache(WhaleConfig(insider_window_days=30))
    recent = {"name": "A", "transaction_date": datetime.date.today().isoformat(), "lots": 1}
    old = {"name": "B", "transaction_date": "2020-01-01", "lots": 1}
    shaped = cache.shape("amd", {"transactions": [recent, old], "source": "Finnhub"}, True, NOW)
    assert [t["name"] for t in shaped["transactions"]] == ["A"]
    assert shaped["window_days"] == 30


def test_rows_cached_in_the_old_shape_are_refetched():
    cache = InsiderCache(WhaleConfig())
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    # Inside the TTL either way; only the shape differs.
    assert not cache.is_fresh({"transactions": [{"name": "A"}], "fetched_at": now})
    assert cache.is_fresh({"transactions": [{"name": "A", "lots": 1}], "fetched_at": now})
    assert cache.is_fresh({"transactions": [], "fetched_at": now})


# ── the note ─────────────────────────────────────────────────────────────────

def test_a_cluster_says_when_it_happened():
    def deal(name, code, day):
        return {"name": name, "transaction_code": code, "transaction_date": day,
                "filing_date": day, "value": 100_000, "shares": 10}

    ev = InsiderEvidence.from_payload("gme", {"transactions": [
        deal("A", "P", "2026-09-10"), deal("B", "P", "2026-09-21"), deal("C", "P", "2026-03-01"),
    ], "window_days": 90})
    assert ev.purchase_cluster and ev.purchase_cluster_span == ("2026-09-10", "2026-09-21")
    assert "between 10 September 2026 and 21 September 2026" in InsiderMeaning.pattern(ev)
    # The dates are figures the note may quote.
    assert {2026.0, 9.0, 10.0, 21.0} <= ev.numbers()

    sales = InsiderEvidence.from_payload("gme", {"transactions": [
        deal("A", "S", "2026-08-01"), deal("B", "S", "2026-08-05"), deal("C", "S", "2026-08-20"),
    ], "window_days": 90})
    assert InsiderMeaning.pattern(sales).startswith(
        "Several insiders sold between 1 August 2026 and 20 August 2026 and none made a purchase in the last 90 days"
    )


def test_no_purchase_says_over_what_span():
    sale = {"name": "A", "transaction_code": "S", "transaction_date": "2026-09-01",
            "filing_date": "2026-09-02", "value": 1_000_000, "shares": 100}
    ev = InsiderEvidence.from_payload("amd", {"transactions": [sale], "window_days": 90})
    assert InsiderMeaning.pattern(ev) == (
        "No insider made an open-market purchase in the last 90 days, the strongest kind of signal."
    )
    assert 90.0 in ev.numbers()
    # The window is part of what the note was written from, so changing it rewrites it.
    other = InsiderEvidence.from_payload("amd", {"transactions": [sale], "window_days": 30})
    assert ev.fingerprint() != other.fingerprint()
    # Without a window the sentence claims no span rather than a wrong one.
    bare = InsiderEvidence.from_payload("amd", {"transactions": [sale]})
    assert "in the last" not in InsiderMeaning.pattern(bare)
