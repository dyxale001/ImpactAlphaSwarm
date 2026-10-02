"""Tests for the Insider trading tab's AI summary (src/utils/ww_insider_trace.py).

The prose is never asserted on. What is asserted: the facts are decided in code from the
SEC codes (the named dealing, clusters, which chief), the price move is a fact that never
joins the fingerprint, the guard allows describing what insiders bought or sold but not
advising the reader or claiming a cause, and the note is written once and reused. Groq,
yfinance and the store are fakes.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.ww_config import WhaleConfig  # noqa: E402
from src.utils.ww_insider_trace import (  # noqa: E402
    InsiderEvidence,
    InsiderMeaning,
    InsiderPriceMove,
    InsiderTraceGenerator,
    InsiderTraceGuard,
    InsiderTracePromptBuilder,
    InsiderTraceService,
    InsiderTraceTemplate,
    PriceMove,
    format_name,
    money,
)

NOW = datetime.datetime(2026, 10, 1, 12, 0, tzinfo=datetime.timezone.utc)


def cfg(**overrides) -> WhaleConfig:
    base = dict(insider_trace_enabled=True)
    base.update(overrides)
    return WhaleConfig(**base)


def deal(name, code, day, role=None, value=None, shares=1000):
    return {
        "name": name, "transaction_code": code, "transaction_date": day, "filing_date": day,
        "role": role, "value": value, "shares": shares,
    }


def evidence(*deals) -> InsiderEvidence:
    return InsiderEvidence.from_payload("gme", {"transactions": list(deals)})


PURCHASE_CLUSTER = (
    deal("COHEN RYAN", "P", "2026-09-21", "Chief Executive Officer", 26_400_000),
    deal("COHEN RYAN", "P", "2026-09-10", "Chief Executive Officer", 20_400_000),
    deal("LEE ANNA", "P", "2026-09-12", "Director", 300_000),
    deal("COHEN RYAN", "A", "2026-08-01"),
)
SALE_CLUSTER = (
    deal("LEVINSON ARTHUR D", "S", "2026-05-06", "Director", 42_600_000),
    deal("B", "S", "2026-05-10", value=1_000_000), deal("C", "S", "2026-05-20", value=500_000),
    deal("A", "F", "2026-04-01"), deal("B", "F", "2026-04-01"), deal("C", "M", "2026-04-01"),
    deal("D", "A", "2026-04-01"),
)

GOOD = (
    "Ryan Cohen, Chief Executive Officer, bought $26.4 million of GME shares on 21 September"
    " 2026, which markets often read as a vote of confidence. By 30 September 2026 the share"
    " price was 8 percent higher than on the day of the purchase. Insider filings arrive after"
    " the trade. So this means it is worth seeing whether the Sentiment and Quant tabs tell the"
    " same story before you decide."
)


def with_price(ev: InsiderEvidence) -> InsiderEvidence:
    import dataclasses

    return dataclasses.replace(ev, price=PriceMove(change_pct=8.3, since="2026-09-21", as_of="2026-09-30"))


# ── what the code decides ────────────────────────────────────────────────────

def test_names_read_in_prose_order():
    assert format_name("COHEN RYAN") == "Ryan Cohen"
    assert format_name("LEVINSON ARTHUR D") == "Arthur D. Levinson"
    assert format_name("WILSON-THOMPSON KATHLEEN") == "Kathleen Wilson-Thompson"
    assert format_name("SMITH JOHN JR") == "John Smith Jr."
    assert format_name("") == "an insider"


def test_amounts_read_as_people_say_them():
    assert money(26_400_000) == "$26.4 million"
    assert money(1_000_000) == "$1 million"
    assert money(2_100_000_000) == "$2.1 billion"
    assert money(450_000) == "$450,000"


def test_the_biggest_purchase_is_named_ahead_of_a_bigger_sale():
    ev = evidence(*PURCHASE_CLUSTER, deal("X", "S", "2026-09-01", value=90_000_000))
    assert ev.main.name == "Ryan Cohen" and ev.main.is_purchase
    assert ev.main.amount == "$26.4 million" and ev.main.day == "2026-09-21"
    assert len(ev.highlights) == 1


def test_without_open_market_dealings_the_biggest_entry_is_named_as_routine():
    ev = evidence(deal("X", "A", "2026-09-01", value=None, shares=50_000), deal("Y", "F", "2026-09-02", shares=10))
    assert ev.main.code == "A"
    assert "compensation mechanics" in InsiderMeaning.dealing(ev.main)


def test_clusters_and_the_chief_are_decided_in_code():
    ev = evidence(*PURCHASE_CLUSTER)
    assert ev.purchase_cluster and ev.chief_purchased == "the chief executive"
    assert "including the chief executive" in InsiderMeaning.pattern(ev)
    sales = evidence(*SALE_CLUSTER)
    assert sales.sale_cluster and "none made a purchase" in InsiderMeaning.pattern(sales)
    assert "Most other entries are grants" in InsiderMeaning.routine(sales)


def test_purchase_size_changes_how_it_is_read():
    big = InsiderMeaning.dealing(evidence(*PURCHASE_CLUSTER).main)
    assert "a purchase of this size as a vote of confidence" in big
    small = InsiderMeaning.dealing(evidence(deal("A", "P", "2026-09-01", value=50_000)).main)
    assert "read a purchase as a vote of confidence" in small


def test_the_note_has_no_so_this_means_closing():
    # Taken out at the user's request; the Big investors summary keeps its own.
    ev = with_price(evidence(*PURCHASE_CLUSTER))
    assert "So this means" not in InsiderTracePromptBuilder().build(ev)
    for e in (ev, evidence(*SALE_CLUSTER), evidence(deal("A", "S", "2026-09-01", value=900_000))):
        text = InsiderTraceTemplate().render(e)
        assert "So this means" not in text
        assert text.endswith("Filings arrive after the trade, so the signal is late and noisy.")
    # Without the closing rule, a note that never says "So this means" still passes.
    note = GOOD.split(" So this means")[0]
    assert InsiderTraceGuard(cfg()).check(note, ev) is None


# ── the price move ───────────────────────────────────────────────────────────

class FakePrices:
    def __init__(self, closes):
        self.closes, self.calls = closes, 0

    def history_between(self, ticker, start, end):
        self.calls += 1
        index = pd.to_datetime(list(self.closes))
        return pd.DataFrame({"Close": list(self.closes.values())}, index=index)


def test_price_move_is_measured_from_the_dealing_day_to_the_latest_close():
    source = FakePrices({"2026-09-21": 100.0, "2026-09-25": 104.0, "2026-09-30": 108.3})
    move = InsiderPriceMove(source, today=lambda: datetime.date(2026, 10, 1)).since("GME", "2026-09-21")
    assert move == PriceMove(change_pct=8.3, since="2026-09-21", as_of="2026-09-30")
    sentence = InsiderMeaning.price(with_price(evidence(*PURCHASE_CLUSTER)))
    assert sentence == "By 30 September 2026 the share price was 8 percent higher than on the day of the purchase."


def test_price_move_is_skipped_when_there_is_nothing_to_compare():
    prices = InsiderPriceMove(FakePrices({"2026-09-30": 10.0}), today=lambda: datetime.date(2026, 10, 1))
    assert prices.since("GME", "2026-09-30") is None
    assert prices.since("GME", None) is None


def test_price_never_joins_the_fingerprint():
    ev = evidence(*PURCHASE_CLUSTER)
    assert with_price(ev).fingerprint() == ev.fingerprint()
    assert with_price(ev).facts()["price"]["change_pct"] == 8.3


# ── prompt, template, guard ──────────────────────────────────────────────────

def test_prompt_matches_the_other_summaries_and_never_advises():
    prompt = InsiderTracePromptBuilder().build(with_price(evidence(*PURCHASE_CLUSTER)))
    assert "four or five sentences, no more than 110 words" in prompt
    assert len(prompt.split()) < 600
    assert "Never tell the reader to buy, sell or hold anything" in prompt
    assert "Never say or suggest that a dealing caused" in prompt
    assert "never as he, she, his or her" in prompt
    assert "Ryan Cohen, Chief Executive Officer, bought $26.4 million of shares on the open market" in prompt


def test_template_passes_the_guard_and_is_summary_length():
    guard = InsiderTraceGuard(cfg())
    for ev in (with_price(evidence(*PURCHASE_CLUSTER)), evidence(*SALE_CLUSTER), evidence(deal("A", "S", "2026-09-01", value=900_000))):
        text = InsiderTraceTemplate().render(ev)
        assert guard.check(text, ev) is None, text
        assert len(text.split()) <= 110, len(text.split())


def test_guard_allows_describing_what_insiders_bought_or_sold():
    guard = InsiderTraceGuard(cfg())
    ev = with_price(evidence(*PURCHASE_CLUSTER))
    assert guard.check(GOOD, ev) is None
    assert guard.check("Several insiders sold shares, and others were buying. " + GOOD, ev) is None


def test_guard_refuses_advice_causes_and_gendered_pronouns():
    guard = InsiderTraceGuard(cfg())
    ev = with_price(evidence(*PURCHASE_CLUSTER))
    for bad in (
        "Now is the time to buy. ",
        "You could sell the shares. ",
        "Investors might buy this stock. ",
        "The price rose because of the purchase. ",
        "The purchase drove the price higher. ",
        "His purchase was large. ",
    ):
        assert guard.check(bad + GOOD, ev) is not None, bad
    # Buy, sell or hold in the closing sentence reads as an instruction.
    assert guard.check(GOOD.replace("it is worth seeing", "you could buy and see"), ev) is not None


def test_guard_reads_millions_as_figures_and_refuses_invented_ones():
    guard = InsiderTraceGuard(cfg())
    ev = with_price(evidence(*PURCHASE_CLUSTER))
    assert guard.check(GOOD.replace("$26.4 million", "$31.7 million"), ev) is not None


# ── caching ──────────────────────────────────────────────────────────────────

class FakeRepository:
    def __init__(self):
        self.row, self.writes = None, 0

    def read(self, ticker):
        return dict(self.row) if self.row else None

    def write(self, ticker, row):
        self.writes += 1
        self.row = {"ticker": ticker, **row}


class CountingGenerator:
    model = "fake-model"

    def __init__(self, text):
        self.text, self.calls, self.seen = text, 0, None

    def generate(self, ev):
        self.calls += 1
        self.seen = ev
        return self.text


def test_service_writes_once_and_looks_up_the_price_only_when_writing():
    prices = FakePrices({"2026-09-21": 100.0, "2026-09-30": 108.3})
    repo, gen = FakeRepository(), CountingGenerator(GOOD)
    svc = InsiderTraceService(
        config=cfg(), repository=repo, generator=gen, now=lambda: NOW,
        prices=InsiderPriceMove(prices, today=lambda: datetime.date(2026, 10, 1)),
    )
    payload = {"transactions": list(PURCHASE_CLUSTER)}
    first, second = svc.trace_for("GME", payload), svc.trace_for("GME", payload)
    assert first["trace"] == GOOD and second["trace"] == GOOD
    assert gen.calls == 1 and repo.writes == 1
    # The price is fetched for the one note that was written, never for a cached read.
    assert prices.calls == 1
    assert gen.seen.price.change_pct == 8.3
    assert repo.row["trace_facts"]["price"]["as_of"] == "2026-09-30"


def test_service_is_quiet_when_disabled_or_empty():
    gen = CountingGenerator(GOOD)
    off = InsiderTraceService(config=cfg(insider_trace_enabled=False), repository=FakeRepository(), generator=gen)
    assert off.trace_for("GME", {"transactions": list(PURCHASE_CLUSTER)}) is None
    on = InsiderTraceService(config=cfg(), repository=FakeRepository(), generator=gen)
    assert on.trace_for("GME", {"transactions": []}) is None
    assert gen.calls == 0


def test_both_whale_summaries_use_key_5_with_key_4_as_fallback():
    from src.utils.ww_trace import InstitutionalTraceGenerator

    for cls in (InstitutionalTraceGenerator, InsiderTraceGenerator):
        assert cls.KEY_ENV == "GROQ_API_KEY5"
        assert cls.FALLBACK_KEY_ENV == "GROQ_API_KEY4"
    assert InsiderTraceGenerator.PURPOSE == "insider_trace"
