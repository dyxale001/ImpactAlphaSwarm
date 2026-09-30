"""Tests for the Big investors tab's reasoning trace (src/utils/ww_trace.py).

As with the Quant trace, the prose is never asserted on. What is asserted is that the
judgements handed to the model are made in code, that a paragraph quoting a number it
was not given or telling the reader what to do is refused, that the template passes the
same guard, and that a trace is written once per filing rather than once per visit.

Nothing external is touched. Groq is a fake and the store is a fake.
"""

from __future__ import annotations

import asyncio
import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.ww_config import WhaleConfig  # noqa: E402
from src.utils.ww_trace import (  # noqa: E402
    HolderStyleClassifier,
    InstitutionalEvidence,
    InstitutionalTraceGenerator,
    InstitutionalTraceGuard,
    InstitutionalTracePromptBuilder,
    InstitutionalTraceService,
    InstitutionalTraceTemplate,
    spell_date,
)

NOW = datetime.datetime(2026, 9, 30, 12, 0, tzinfo=datetime.timezone.utc)


def cfg(**overrides) -> WhaleConfig:
    base = dict(institutions_trace_enabled=True)
    base.update(overrides)
    return WhaleConfig(**base)


def holder(name, pct_held, pct_change, value=None, date="2026-06-30"):
    # A mega cap by default: each holding implies a company worth about $3.5tn.
    return {
        "holder": name,
        "pct_held": pct_held,
        "shares": 1,
        "value": value if value is not None else pct_held * 3.5e12,
        "pct_change": pct_change,
        "date_reported": date,
    }


def payload(**overrides) -> dict:
    base = {
        "institutions_pct": 0.863,
        "institutions_count": 4504,
        "insiders_pct": 0.003,
        "source": "yfinance",
        "holders": [
            holder("Vanguard Group Inc", 0.094, 0.016),
            holder("Blackrock Inc.", 0.078, 0.012),
            holder("State Street Corporation", 0.039, 0.004),
            holder("Invesco Ltd.", 0.021, 0.072),
            holder("Capital Research Global Investors", 0.018, -0.248),
            holder("FMR, LLC", 0.015, 0.03),
        ],
    }
    base.update(overrides)
    return base


def evidence(**overrides) -> InstitutionalEvidence:
    return InstitutionalEvidence.from_payload("aapl", payload(**overrides), top_n=5)


# ── classification and verdicts ──────────────────────────────────────────────

def test_classifier_tags_index_active_and_leaves_mixed_firms_unclassified():
    c = HolderStyleClassifier()
    assert c.classify("Vanguard Group Inc") == "index"
    assert c.classify("Blackrock Inc.") == "index"
    assert c.classify("Capital Research Global Investors") == "active"
    assert c.classify("Price (T.Rowe) Associates Inc") == "active"
    # Runs index and active money at scale: the model must not be told either.
    assert c.classify("FMR, LLC") == "unclassified"
    assert c.classify("JPMORGAN CHASE & CO") == "unclassified"
    assert c.classify(None) == "unclassified"


def test_evidence_reads_the_payload_as_the_tab_prints_it():
    ev = evidence()
    assert ev.ticker == "AAPL"
    assert ev.institutions_pct == 86.3
    assert ev.institutions_count == 4504
    assert ev.insiders_pct == 0.3
    assert ev.as_of == "2026-06-30"
    assert ev.size_band == "mega"
    # Capped at the five the tab shows.
    assert [h.name for h in ev.holders][-1] == "Capital Research Global Investors"
    assert len(ev.holders) == 5
    assert ev.holders[4].pct_change == -24.8
    assert ev.holders[4].change_size == "a large change"
    assert ev.holders[0].change_size == "a small change"


def test_verdicts_say_normal_for_a_mega_cap_and_flag_what_deviates():
    ev = evidence()
    assert "inside the 70 to 90 percent" in ev.institutional_verdict()
    assert ev.insider_verdict().startswith("normal")

    high_insider = evidence(insiders_pct=0.12)
    assert high_insider.insider_verdict().startswith("higher than")

    low_inst = evidence(institutions_pct=0.41)
    assert low_inst.institutional_verdict().startswith("below")


def test_a_small_company_gets_no_large_company_range():
    small = [holder("Vanguard Group Inc", 0.08, 0.01, value=0.08 * 900e6)]
    ev = evidence(holders=small)
    assert ev.size_band == "small"
    assert "varies widely" in ev.institutional_verdict()
    assert "70" not in ev.institutional_verdict()


# ── fingerprint ──────────────────────────────────────────────────────────────

def test_fingerprint_is_stable_and_ignores_a_price_move_inside_a_band():
    a = evidence()
    # Same filing, values revalued 10 percent higher: still a mega cap.
    revalued = payload()
    for h in revalued["holders"]:
        h["value"] *= 1.1
    b = InstitutionalEvidence.from_payload("AAPL", revalued, top_n=5)
    assert a.fingerprint() == b.fingerprint()


def test_fingerprint_changes_when_the_filing_does():
    a = evidence()
    changed = payload()
    changed["holders"][4]["pct_change"] = -0.1
    b = InstitutionalEvidence.from_payload("AAPL", changed, top_n=5)
    assert a.fingerprint() != b.fingerprint()
    assert a.fingerprint() != evidence(institutions_count=4600).fingerprint()


# ── the guard ────────────────────────────────────────────────────────────────

GOOD = (
    "Institutions hold 86.3 percent of AAPL, inside the 70 to 90 percent usual for a large"
    " US company, so the stock is widely held rather than specially endorsed. Insiders hold"
    " 0.3 percent, which is normal for a company this size."
    " Capital Research cut its own position by 24.8 percent, a large change, while Vanguard"
    " grew its stake by 1.6 percent. These are holdings reported on 30 June 2026."
    " Use it alongside your own research, never on its own."
)


def test_guard_accepts_a_grounded_paragraph():
    assert InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40)).check(GOOD, evidence()) is None


def test_guard_rejects_a_number_it_was_not_given():
    text = GOOD.replace("24.8 percent", "31.5 percent")
    reason = InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40)).check(text, evidence())
    assert reason and "31.5" in reason


def test_guard_holds_decimals_to_their_last_digit_but_lets_whole_numbers_round():
    guard = InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40))
    assert guard.ungrounded_numbers("about 86 percent", evidence()) == []
    assert guard.ungrounded_numbers("86.7 percent", evidence()) == ["86.7"]


def test_guard_rejects_advice():
    guard = InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40))
    for phrase in ("You should buy it.", "It is a good investment.", "Funds are selling.", "The outlook is strong."):
        assert guard.check(GOOD + " " + phrase, evidence()) is not None, phrase


def test_guard_ignores_forbidden_words_and_numbers_inside_a_holders_name():
    names = [holder("1832 Asset Management Advisors", 0.05, 0.01)]
    ev = evidence(holders=names)
    text = GOOD.replace("Capital Research cut its own position by 24.8 percent, a large change, while Vanguard", "1832 Asset Management Advisors")
    text = text.replace("grew its stake by 1.6 percent", "grew its stake by 1 percent")
    assert InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40)).check(text, ev) is None


def test_guard_rejects_a_figure_spelled_out_but_allows_thousands_of_holders():
    # Seen live: "Eight thousand one hundred eighty-three" slipped past the digit check.
    guard = InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40))
    assert guard.check(GOOD + " Eight thousand one hundred funds own it.", evidence()) is not None
    assert guard.check(GOOD + " Thousands of holders is normal.", evidence()) is None


def test_guard_refuses_a_style_guessed_for_an_unclassified_holder():
    # Seen live: "FMR, LLC is not described as an index fund, so it is an active manager".
    ev = InstitutionalEvidence.from_payload("AAPL", payload(), top_n=6)
    guard = InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40))
    guessed = GOOD + " FMR, LLC is an active manager that chose the stock."
    assert "FMR, LLC" in (guard.check(guessed, ev) or "")
    quoted = GOOD + " FMR, LLC grew its own position by 3 percent."
    assert guard.check(quoted, ev) is None


def test_guard_allows_the_word_holding():
    guard = InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40))
    assert guard.check(GOOD + " Holding a stock is not an endorsement.", evidence()) is None


# ── template and prompt ──────────────────────────────────────────────────────

def test_template_passes_its_own_guard_for_a_mega_cap():
    ev = evidence()
    text = InstitutionalTraceTemplate().render(ev)
    assert InstitutionalTraceGuard(cfg()).check(text, ev) is None
    # One paragraph, like the Sentiment tab's summary it is modelled on.
    assert "\n" not in text
    assert "Capital Research Global Investors is an active manager" in text


def test_template_passes_its_own_guard_for_a_small_company_with_no_holders_classified():
    small = [holder("Some Adviser LLC", 0.05, -0.02, value=0.05 * 500e6)]
    ev = evidence(holders=small, institutions_pct=0.35, insiders_pct=0.18)
    text = InstitutionalTraceTemplate().render(ev)
    assert InstitutionalTraceGuard(cfg()).check(text, ev) is None


def test_prompt_hands_over_the_verdicts_and_labels():
    prompt = InstitutionalTracePromptBuilder().build(evidence())
    assert "30 June 2026" in prompt
    assert "86.3 percent, inside the 70 to 90 percent" in prompt
    assert "0.3 percent, normal" in prompt
    assert "Active managers, who choose which stocks to own: Capital Research Global Investors." in prompt
    # A name that already ends in a full stop is not given a second one.
    assert "Invesco Ltd.." not in prompt
    # The live model named the company from the ticker alone; it is told not to.
    assert "Refer to the company only as AAPL" in prompt
    assert spell_date("2026-06-30") == "30 June 2026"


def test_prompt_matches_the_quant_and_sentiment_length():
    prompt = InstitutionalTracePromptBuilder().build(evidence())
    assert "four or five sentences, no more than 110 words" in prompt
    # The Quant prompt runs to about 600 words; this one must not outgrow it.
    assert len(prompt.split()) < 600


def test_prompt_picks_the_one_style_instruction_that_fits():
    build = InstitutionalTracePromptBuilder().build
    mixed = build(evidence())
    # Index funds are grouped by count, not named; the active manager is named.
    assert "4 of the top 5 holders run mostly index funds" in mixed
    assert "Do not name the index funds" in mixed
    assert "while Capital Research Global Investors is an active manager" in mixed

    index_only = build(evidence(holders=payload()["holders"][:3]))
    assert "3 of the top 3 holders run mostly index funds" in index_only
    assert "do not reflect a stock picker's decision" in index_only

    none = build(evidence(holders=[holder("FMR, LLC", 0.02, 0.01)]))
    assert "index funds" not in none.split("Cover, in whatever order reads best:")[1].split("Rules")[0]


def test_prompt_leaves_out_an_unclassified_holder_that_is_not_the_example():
    ev = InstitutionalEvidence.from_payload("AAPL", payload(), top_n=6)
    prompt = InstitutionalTracePromptBuilder().build(ev)
    # Nothing to narrate, so nothing to guess a style for. The tab's list still shows it.
    assert "FMR" not in prompt
    assert "classified" not in prompt


def test_the_example_is_chosen_in_code_active_first():
    assert evidence().example_holder.name == "Capital Research Global Investors"
    prompt = InstitutionalTracePromptBuilder().build(evidence())
    assert "The example: Capital Research Global Investors cut its own position by 24.8 percent" in prompt
    assert "a large change" in prompt

    unlabelled = [holder("FMR, LLC", 0.05, -0.12), holder("Vanguard Group Inc", 0.07, 0.03)]
    # No active manager: the index holder, never the unlabelled one.
    assert evidence(holders=unlabelled).example_holder.name == "Vanguard Group Inc"


# ── the generator ────────────────────────────────────────────────────────────

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


def generator(reply) -> InstitutionalTraceGenerator:
    g = InstitutionalTraceGenerator(cfg(institutions_trace_min_chars=40), client=FakeClient(reply))
    g.BACKOFF_SECONDS = (0.0, 0.0)
    return g


def test_generator_strips_dashes():
    out = generator(GOOD.replace("so the stock", "— so the stock")).generate(evidence())
    assert out is not None
    assert "—" not in out


def test_guard_requires_the_closing_sentence_and_still_refuses_buy_or_sell():
    guard = InstitutionalTraceGuard(cfg(institutions_trace_min_chars=40))
    without = GOOD.replace(" Use it alongside your own research, never on its own.", "")
    assert "closing sentence" in guard.check(without, evidence())
    # Not in the prompt at all, and refused wherever the model writes them.
    assert guard.check(GOOD + " Now is the time to buy.", evidence()) is not None
    assert guard.check(GOOD + " It is never a reason to buy or sell.", evidence()) is not None


def test_prompt_only_talks_about_active_managers_when_one_is_listed():
    with_active = InstitutionalTracePromptBuilder().build(evidence())
    assert "is an active manager that chose the stock" in with_active

    unlabelled = [
        holder("Vanguard Group Inc", 0.07, 0.03),
        holder("FMR, LLC", 0.05, -0.12),
        holder("Renaissance Technologies LLC", 0.03, 0.4),
    ]
    without = InstitutionalTracePromptBuilder().build(evidence(holders=unlabelled))
    assert "active manager that chose" not in without
    # Unlabelled holders are left out altogether, so there is nothing to guess about.
    assert "Renaissance" not in without and "FMR" not in without


def test_prompt_never_mentions_buying_or_selling():
    import re

    prompt = InstitutionalTracePromptBuilder().build(evidence())
    assert re.findall(r"\b(buy|sell|bought|sold)\w*", prompt, re.IGNORECASE) == []


def test_template_covers_the_three_points_and_ends_with_the_closing_line():
    text = InstitutionalTraceTemplate().render(evidence())
    assert text.endswith("Use it alongside your own research, never on its own.")
    assert "4 of the top 5 holders run mostly index funds" in text
    assert "measured against its own previous stake, not against the whole company" in text
    # Quant and Sentiment length: well under the 1,000 character ceiling.
    assert len(text.split()) <= 120


def test_generator_reads_a_space_as_a_thousands_separator():
    # Seen live: "7 761" read as 7 and 761 failed the guard on a figure it was given.
    reply = GOOD + " The number of institutions is 4 504."
    out = generator(reply).generate(evidence())
    assert out is not None
    assert "4,504" in out


def test_generator_refuses_a_reply_that_fails_the_guard():
    assert generator(GOOD + " You should buy.").generate(evidence()) is None


def test_generator_returns_none_when_the_model_keeps_failing():
    assert generator(RuntimeError("down")).generate(evidence()) is None


# ── the service ──────────────────────────────────────────────────────────────

class FakeRepository:
    def __init__(self, row=None):
        self.row = row
        self.writes = 0

    def read(self, ticker):
        return dict(self.row) if self.row else None

    def write(self, ticker, row):
        self.writes += 1
        self.row = {"ticker": ticker, **row}


class CountingGenerator:
    model = "fake-model"

    def __init__(self, text):
        self.text = text
        self.calls = 0

    def generate(self, ev):
        self.calls += 1
        return self.text


def service(repo, gen, now=NOW, **config) -> InstitutionalTraceService:
    return InstitutionalTraceService(
        config=cfg(**config), repository=repo, generator=gen, now=lambda: now
    )


def test_service_is_quiet_when_disabled():
    repo, gen = FakeRepository(), CountingGenerator(GOOD)
    assert service(repo, gen, institutions_trace_enabled=False).trace_for("AAPL", payload()) is None
    assert gen.calls == 0


def test_service_writes_once_and_then_serves_the_stored_trace():
    repo, gen = FakeRepository(), CountingGenerator(GOOD)
    svc = service(repo, gen)
    first = svc.trace_for("AAPL", payload())
    second = svc.trace_for("AAPL", payload())
    assert first["trace"] == GOOD and first["source"] == "model"
    assert second["trace"] == GOOD
    assert gen.calls == 1
    assert repo.writes == 1
    assert first["as_of"] == "2026-06-30"


def test_service_regenerates_only_when_the_filing_changes():
    repo, gen = FakeRepository(), CountingGenerator(GOOD)
    svc = service(repo, gen)
    svc.trace_for("AAPL", payload())
    changed = payload()
    changed["holders"][0]["pct_change"] = 0.05
    svc.trace_for("AAPL", changed)
    assert gen.calls == 2
    assert repo.writes == 2


def test_service_falls_back_to_the_template_and_retries_the_model_a_day_later():
    repo, gen = FakeRepository(), CountingGenerator(None)
    first = service(repo, gen).trace_for("AAPL", payload())
    assert first["source"] == "template"

    # Within the retry window the template is served without another model call.
    service(repo, gen, now=NOW + datetime.timedelta(hours=2)).trace_for("AAPL", payload())
    assert gen.calls == 1

    gen.text = GOOD
    later = service(repo, gen, now=NOW + datetime.timedelta(hours=25)).trace_for("AAPL", payload())
    assert gen.calls == 2
    assert later["source"] == "model"


def test_service_returns_none_with_nothing_to_write_from():
    repo, gen = FakeRepository(), CountingGenerator(GOOD)
    empty = {"institutions_pct": None, "holders": []}
    assert service(repo, gen).trace_for("AAPL", empty) is None
    assert gen.calls == 0


def test_watcher_reports_disabled_without_fetching():
    from src.utils.whale_watching import WhaleWatcher

    class Boom:
        async def serve(self, *a, **k):  # pragma: no cover - must not be reached
            raise AssertionError("fetched while disabled")

    watcher = WhaleWatcher(
        config=cfg(institutions_trace_enabled=False),
        institutions_cache=Boom(),
        institutions_trace=InstitutionalTraceService(config=cfg(institutions_trace_enabled=False)),
    )
    out = asyncio.run(watcher.institutional_trace("aapl"))
    assert out["enabled"] is False
    assert out["trace"] is None
    assert out["ticker"] == "AAPL"
