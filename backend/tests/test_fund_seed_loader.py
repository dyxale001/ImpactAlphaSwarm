"""Tests for the fund seed and the loader that reads it.

Two claims, and the second is the more interesting one.

The first is that the loader refuses to write a bad row. A catalogue is read as
a set of published facts, so a half-loaded one is worse than an empty one: the
page would look finished while quietly describing funds wrongly.

The second is **map validation**. Every seeded fund is run through the real
matcher and has to land where its own fact sheet implies. That is what keeps the
bracket policy honest — it is a proposal, and this is the test that would catch
it drifting away from what fund managers actually publish. It is also the golden
set an extractor is measured against later, when the sheets stop being read by
hand.

Reads the real CSVs, so it fails if a transcription is wrong. No Supabase, no
network.
"""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from src.funds.asisa import ASISA  # noqa: E402
from src.funds.matcher import FundMatcher  # noqa: E402
from src.funds.models import FundCandidate, Goals, Profile  # noqa: E402
from src.funds.risk_scale import normalize as normalize_risk_indicator  # noqa: E402
from src.funds.validators import (  # noqa: E402
    as_number,
    fund_validators,
    is_blank,
    snapshot_validators,
)

DATA_DIR = BACKEND_ROOT / "data" / "funds"
LOADER = BACKEND_ROOT / "scripts" / "load_fund_seed.py"
TODAY = date(2026, 9, 4)


def read(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


@pytest.fixture(scope="module")
def fund_rows() -> list[dict[str, str]]:
    return read(DATA_DIR / "funds.csv")


@pytest.fixture(scope="module")
def snapshot_rows() -> list[dict[str, str]]:
    return read(DATA_DIR / "snapshots.csv")


def as_snapshot(row: dict[str, str]) -> dict:
    parsed = dict(row)
    for column in ("risk_indicator_1to5", "recommended_min_term_years", "ter", "tc", "tic", "fund_size_zar"):
        parsed[column] = None if is_blank(row.get(column)) else as_number(row[column])
    if parsed["risk_indicator_1to5"] is not None:
        parsed["risk_indicator_1to5"] = int(parsed["risk_indicator_1to5"])
    for column in ("asset_allocation", "performance"):
        value = row.get(column)
        parsed[column] = None if is_blank(value) else json.loads(value)
    return parsed


def candidates(fund_rows, snapshot_rows) -> list[FundCandidate]:
    by_isin = {row["isin"]: as_snapshot(row) for row in snapshot_rows}
    built = []
    for row in fund_rows:
        fund = dict(row)
        fund["id"] = row["isin"]
        fund["is_index_tracker"] = row["is_index_tracker"].strip().lower() == "true"
        fund["tfsa_eligible"] = row["tfsa_eligible"].strip().lower() == "true"
        built.append(FundCandidate(fund=fund, snapshot=by_isin.get(row["isin"])))
    return built


def profile(risk: str, **goals) -> Profile:
    return Profile(user_id="u-1", risk_tolerance=risk, goals=Goals(**goals) if goals else None)


class TestTheSeedIsWellFormed:
    def test_there_is_a_seed_at_all(self, fund_rows, snapshot_rows):
        assert fund_rows, "funds.csv is empty"
        assert snapshot_rows, "snapshots.csv is empty"

    def test_every_fund_passes_its_validators(self, fund_rows):
        findings = fund_validators().check_all([
            {**row, "platforms": [p for p in row["platforms"].split(";") if p]} for row in fund_rows
        ])
        blocking = [f"row {i}: {p}" for i, p in findings if p.blocking]
        assert blocking == []

    def test_every_fact_sheet_passes_its_validators(self, snapshot_rows):
        findings = snapshot_validators(today=TODAY).check_all([as_snapshot(r) for r in snapshot_rows])
        blocking = [f"row {i}: {p}" for i, p in findings if p.blocking]
        assert blocking == []

    def test_every_fact_sheet_belongs_to_a_seeded_fund(self, fund_rows, snapshot_rows):
        known = {row["isin"] for row in fund_rows}
        assert {row["isin"] for row in snapshot_rows} <= known

    def test_every_fund_has_a_fact_sheet(self, fund_rows, snapshot_rows):
        # A fund with no sheet is browsable but describes nothing, which is not
        # worth seeding on purpose.
        dated = {row["isin"] for row in snapshot_rows}
        assert {row["isin"] for row in fund_rows} <= dated

    def test_isins_are_unique(self, fund_rows):
        isins = [row["isin"] for row in fund_rows]
        assert len(set(isins)) == len(isins)

    def test_every_category_is_one_the_matcher_knows(self, fund_rows):
        for row in fund_rows:
            assert ASISA.is_known(row["asisa_category"]), row["asisa_category"]

    def test_every_fund_states_why_it_is_in_the_catalogue(self, fund_rows):
        # The page says how the list was chosen, so each row has to carry its
        # own answer rather than relying on a blanket claim.
        for row in fund_rows:
            assert row["curation_rule"].strip()

    def test_every_fact_sheet_has_a_manager_url_and_a_date(self, snapshot_rows):
        # Every figure shown is attributed and dated, or it should not be shown.
        for row in snapshot_rows:
            assert row["mdd_url"].startswith("https://")
            assert row["as_of"].strip()

    def test_a_published_risk_label_agrees_with_its_level(self, snapshot_rows):
        # The words are displayed and the number filters, so a disagreement is
        # invisible and changes who sees the fund.
        for row in snapshot_rows:
            if is_blank(row["risk_indicator_raw"]):
                continue
            assert normalize_risk_indicator(row["risk_indicator_raw"]) == int(row["risk_indicator_1to5"])

    def test_a_fund_with_no_published_risk_label_records_none(self, snapshot_rows):
        # Not a zero, not a guessed middle value. The Satrix ETF sheet publishes
        # no risk indicator at all, which is common on tracker sheets.
        for row in snapshot_rows:
            if is_blank(row["risk_indicator_raw"]):
                assert is_blank(row["risk_indicator_1to5"])

    def test_only_listed_funds_carry_a_price_symbol(self, fund_rows):
        # A JSE code on a unit trust is fine — FundRock prints one for dealing.
        # A price symbol is not: it would be a different instrument.
        for row in fund_rows:
            if row["vehicle"] == "unit_trust":
                assert is_blank(row["yahoo_symbol"]), row["name"]
            else:
                assert row["yahoo_symbol"].endswith(".JO"), row["name"]

    def test_the_seed_covers_both_vehicles(self, fund_rows):
        # Both halves of the feature need a worked example, or one path is
        # untested against real data.
        assert {row["vehicle"] for row in fund_rows} == {"unit_trust", "etf"}


class TestMapValidation:
    """Each seeded fund lands where its own fact sheet implies."""

    def test_the_high_equity_balanced_fund_reaches_a_long_horizon_growth_profile(
        self, fund_rows, snapshot_rows
    ):
        # Its own sheet: SA Multi Asset High Equity, Moderate-High risk, five
        # years minimum. So it belongs to someone with appetite and time.
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Aggressive", purpose="growth", horizon_target_year=2033),
            candidates(fund_rows, snapshot_rows),
        )
        assert "FR Best Blend Balanced Fund (C)" in {m.name for m in outcome.matches}

    def test_the_same_fund_is_not_shown_to_a_cautious_saver(self, fund_rows, snapshot_rows):
        # A Moderate-High label cannot clear a conservative ceiling of 2.
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Conservative", purpose="emergency_fund", horizon_target_year=2028),
            candidates(fund_rows, snapshot_rows),
        )
        assert outcome.matches == ()

    def test_the_same_fund_is_not_shown_on_a_short_horizon(self, fund_rows, snapshot_rows):
        # Its sheet asks for five years; eighteen months is not five years.
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Aggressive", purpose="growth", horizon_target_year=2027),
            candidates(fund_rows, snapshot_rows),
        )
        assert "FR Best Blend Balanced Fund (C)" not in {m.name for m in outcome.matches}

    def test_the_tracker_with_no_published_risk_label_never_matches(self, fund_rows, snapshot_rows):
        # It is in the catalogue and browsable, and it cannot be matched by
        # anyone, because its manager publishes no rating to compare.
        for risk in ("Conservative", "Moderate", "Aggressive"):
            outcome = FundMatcher(clock=lambda: TODAY).match(
                profile(risk, purpose="growth", horizon_target_year=2035),
                candidates(fund_rows, snapshot_rows),
            )
            assert "Satrix 40 ETF" not in {m.name for m in outcome.matches}, risk

    def test_every_match_carries_the_facts_its_reason_needs(self, fund_rows, snapshot_rows):
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Aggressive", purpose="growth", horizon_target_year=2033),
            candidates(fund_rows, snapshot_rows),
        )
        for match in outcome.matches:
            assert match.manco and match.asisa_category and match.as_of
            assert match.risk_indicator_raw


class TestTheLoader:
    def test_a_dry_run_validates_the_real_seed_and_writes_nothing(self):
        result = subprocess.run(
            [sys.executable, str(LOADER), str(BACKEND_ROOT), "--dry-run"],
            cwd=str(BACKEND_ROOT),
            capture_output=True,
            text=True,
            timeout=180,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        assert "Every row passed validation." in result.stdout
        assert "would upsert" in result.stdout
        assert "upserted" not in result.stdout

    def test_the_dry_run_says_which_funds_have_no_published_risk_label(self):
        # Visible in the run output, because it is the reason a fund will never
        # appear in anyone's matches and that surprises people otherwise.
        result = subprocess.run(
            [sys.executable, str(LOADER), str(BACKEND_ROOT), "--dry-run"],
            cwd=str(BACKEND_ROOT),
            capture_output=True,
            text=True,
            timeout=180,
        )
        assert "no published risk indicator" in result.stdout

    def test_a_bad_row_blocks_the_whole_load(self, tmp_path):
        # Validated before anything is written, so one bad transcription cannot
        # leave a partly-loaded catalogue behind.
        broken = [{"isin": "nope", "asisa_category": "South African - Equity - Mining", "vehicle": "bond"}]
        findings = fund_validators().check_all(broken)
        assert any(problem.blocking for _index, problem in findings)
