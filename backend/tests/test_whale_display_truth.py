"""Tests for the whale watching data fixes found in the iteration 4 review.

What is asserted: Vanguard's two 13F filers show as one firm with its filer names kept
and a change worked out from shares, the Big investors summary no longer guesses at a
founder or family, a non-finite figure from yfinance cannot reach the JSON, and both
whale endpoints say whether their AI summary is switched on.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.whale_watching import FilerFamilies, WhaleWatcher  # noqa: E402
from src.utils.ww_config import WhaleConfig  # noqa: E402
from src.utils.ww_sources import YFinanceInstitutionalSource  # noqa: E402
from src.utils.ww_trace import InstitutionalEvidence, PlainMeaning  # noqa: E402

pytestmark = pytest.mark.core  # tier: core -- see TESTING.md, 'Tiers'


def fund(name, total, *positions):
    return {"fund": name, "total_value": total, "positions": list(positions)}


def pos(ticker, value, pct_held, shares=None, pct_change=None):
    return {"ticker": ticker, "universe": "Technology", "value": value,
            "pct_held": pct_held, "shares": shares, "pct_change": pct_change}


# ── Vanguard files under two names ───────────────────────────────────────────

@pytest.mark.smoke  # tier: smoke -- one happy path per file (TESTING.md, 'Tiers')
def test_one_firms_filers_are_shown_as_one_fund_and_named():
    funds = [
        fund("Blackrock Inc.", 3_393, pos("AAPL", 300, 0.06)),
        fund("Vanguard Capital Management LLC", 2_664,
             pos("AAPL", 200, 0.05, shares=1_000, pct_change=0.10), pos("MSFT", 100, 0.04)),
        fund("Vanguard Portfolio Management LLC", 910,
             pos("AAPL", 100, 0.02, shares=500, pct_change=-0.50)),
    ]
    merged = FilerFamilies().merge(funds)
    assert [f["fund"] for f in merged] == ["Vanguard", "Blackrock Inc."]
    vanguard = merged[0]
    assert vanguard["filers"] == [
        "Vanguard Capital Management LLC", "Vanguard Portfolio Management LLC",
    ]
    assert vanguard["total_value"] == 3_574
    aapl = next(p for p in vanguard["positions"] if p["ticker"] == "AAPL")
    assert aapl["value"] == 300 and aapl["pct_held"] == pytest.approx(0.07)
    # Before: 1000/1.1 + 500/0.5 = 1909.09 shares; now 1500. Not the average of +10%
    # and -50%, which would weight the small filer equally.
    assert aapl["pct_change"] == pytest.approx(1500 / (1000 / 1.1 + 1000) - 1)
    # A ticker only one filer holds keeps that filer's figures.
    msft = next(p for p in vanguard["positions"] if p["ticker"] == "MSFT")
    assert msft["value"] == 100


def test_merged_change_is_unknown_rather_than_guessed_without_shares():
    funds = [
        fund("Vanguard Capital Management LLC", 1, pos("AAPL", 1, 0.01, pct_change=0.1)),
        fund("Vanguard Portfolio Management LLC", 1, pos("AAPL", 1, 0.01, shares=5, pct_change=0.1)),
    ]
    assert FilerFamilies().merge(funds)[0]["positions"][0]["pct_change"] is None


def test_a_firm_with_one_filer_and_a_merged_list_are_left_alone():
    single = [fund("Vanguard Group Inc", 10, pos("AAPL", 10, 0.08))]
    assert FilerFamilies().merge(single) == single
    merged = FilerFamilies().merge([
        fund("Vanguard Capital Management LLC", 1), fund("Vanguard Portfolio Management LLC", 1),
    ])
    assert FilerFamilies().merge(merged) == merged


# ── the Big investors summary ────────────────────────────────────────────────

def test_a_large_insider_stake_is_not_read_as_a_founder_or_family():
    # Apple's 1.65 percent was described as "often means a founder or family".
    evidence = InstitutionalEvidence(
        ticker="AAPL", institutions_pct=66.3, institutions_count=7687, insiders_pct=1.65,
        as_of="2026-06-30", size_band="mega",
    )
    text = PlainMeaning.insiders(evidence)
    assert text == "they own a noticeable slice, more than is usual for a company this big."
    assert "founder" not in evidence.insider_verdict() and "family" not in evidence.insider_verdict()


# ── yfinance figures ─────────────────────────────────────────────────────────

def test_non_finite_figures_never_reach_the_response():
    clean = YFinanceInstitutionalSource.clean_num
    assert clean(float("inf")) is None and clean(float("-inf")) is None
    assert clean(float("nan")) is None and clean("0.25") == 0.25


# ── whether the AI summary is on ─────────────────────────────────────────────

class _Cache:
    def __init__(self, payload):
        self.payload = payload

    async def serve(self, key, fetch):
        return dict(self.payload)


class _Service:
    def __init__(self, enabled):
        self.enabled = enabled


class _KeyedSource:
    @staticmethod
    def api_key():
        return "key"


@pytest.mark.parametrize("enabled", [True, False])
def test_both_endpoints_say_whether_their_summary_is_switched_on(enabled):
    watcher = WhaleWatcher(
        config=WhaleConfig(),
        insider_cache=_Cache({"ticker": "AAPL", "transactions": []}),
        institutions_cache=_Cache({"ticker": "AAPL", "holders": []}),
        insider_source=_KeyedSource(),
        insider_trace=_Service(enabled),
        institutions_trace=_Service(not enabled),
    )
    assert asyncio.run(watcher.insider("aapl"))["summary_enabled"] is enabled
    assert asyncio.run(watcher.institutional("aapl"))["summary_enabled"] is (not enabled)
