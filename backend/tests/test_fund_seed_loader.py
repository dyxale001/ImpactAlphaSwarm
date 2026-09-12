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
import importlib.util
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


def _load_loader():
    """The seed loader itself, imported from the script it ships as.

    Imported by path because `scripts/` is not a package. Worth the four lines:
    this test used to keep its own copy of the CSV parsing, and the copy drifted
    the moment migration 025 added columns — the test passed a JSON string
    straight to a validator that expects an object, and reported it as a broken
    seed rather than a broken test. Now the row the validators see here is the
    row the loader would actually write.
    """
    spec = importlib.util.spec_from_file_location("_fund_seed_loader", LOADER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_LOADER = _load_loader()
as_snapshot = _LOADER.parse_snapshot
as_fund = _LOADER.parse_fund


def candidates(fund_rows, snapshot_rows) -> list[FundCandidate]:
    by_isin = {row["isin"]: as_snapshot(row) for row in snapshot_rows}
    built = []
    for row in fund_rows:
        fund = as_fund(row)
        fund["id"] = row["isin"]
        built.append(FundCandidate(fund=fund, snapshot=by_isin.get(row["isin"])))
    return built


def profile(risk: str, **goals) -> Profile:
    return Profile(user_id="u-1", risk_tolerance=risk, goals=Goals(**goals) if goals else None)


class TestReloadingCannotReviveARetiredFund:
    """INVARIANT: the loader never writes `is_active`, so a re-run cannot revive.

    This matters because retiring is the only removal the schema allows. The
    whole catalogue was retired on 2026-09-09 to start a new seed, while these
    CSVs still hold the 19 funds that were retired. If the loader wrote
    `is_active`, running it again — which is meant to be a safe no-op — would
    quietly put all 19 back on the public page.

    It does not, for two independent reasons, and both are asserted because
    either one alone could be undone by a plausible edit: the CSV has no such
    column, and `upsert_fund` sends only the columns it is given. A PostgREST
    upsert names just the payload's columns in its `on conflict do update`, so a
    column that is never sent keeps the value the database already holds.

    Asserted rather than reasoned about because a live check was not available:
    verifying it against the real database would have meant running the loader
    against it, which is exactly the write this is here to make safe.
    """

    def test_the_seed_has_no_is_active_column(self, fund_rows):
        for row in fund_rows:
            assert "is_active" not in row, sorted(row)

    def test_a_parsed_fund_row_carries_no_is_active(self, fund_rows):
        for row in fund_rows:
            assert "is_active" not in as_fund(row), row["isin"]

    def test_upserting_a_seed_row_never_sends_is_active(self, fund_rows):
        """Through the real repository, so the payload is the one that ships."""
        from fund_fakes import FakeClient

        from src.funds.repository import FundRepository

        if not fund_rows:
            pytest.skip("the seed is empty, so there is no row to upsert")

        client = FakeClient()
        repo = FundRepository(client)
        for row in fund_rows:
            fund = as_fund(row)
            fund.pop("id", None)
            repo.upsert_fund(fund)

        upserts = [c for c in client.calls_on("funds") if c[0] == "upsert"]
        assert len(upserts) == len(fund_rows)
        for call in upserts:
            payload = call[1][0]
            assert "is_active" not in payload, sorted(payload)


class TestTheSeedIsWellFormed:
    def test_there_is_a_seed_at_all(self, fund_rows, snapshot_rows):
        assert fund_rows, "funds.csv is empty"
        assert snapshot_rows, "snapshots.csv is empty"

    def test_every_fund_passes_its_validators(self, fund_rows):
        findings = fund_validators().check_all([as_fund(row) for row in fund_rows])
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
        # A Moderate-High label cannot clear a conservative ceiling of 2. The
        # assertion is about this fund rather than an empty result: a cautious
        # saver should see the money market fund, and once one was seeded an
        # "empty" assertion started testing the wrong thing.
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Conservative", purpose="emergency_fund", horizon_target_year=2028),
            candidates(fund_rows, snapshot_rows),
        )
        assert "FR Best Blend Balanced Fund (C)" not in {m.name for m in outcome.matches}

    def test_the_same_fund_is_not_shown_on_a_short_horizon(self, fund_rows, snapshot_rows):
        # Its sheet asks for five years; eighteen months is not five years.
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Aggressive", purpose="growth", horizon_target_year=2027),
            candidates(fund_rows, snapshot_rows),
        )
        assert "FR Best Blend Balanced Fund (C)" not in {m.name for m in outcome.matches}

    def test_a_fund_with_no_published_rating_never_matches(self, fund_rows, snapshot_rows):
        # Harvard House prints a continuous gradient with no named steps, so no
        # level is recorded and no profile can be compared against it.
        #
        # This test used to name the Satrix 40 ETF, on the belief that ETF sheets
        # generally publish no rating. That was wrong: Satrix does publish one,
        # labelled by temperament rather than by risk, and a text search that did
        # not know those words reported it as absent. The fund is rated
        # Aggressive and the seed now says so.
        for risk in ("Conservative", "Moderate", "Aggressive"):
            outcome = FundMatcher(clock=lambda: TODAY).match(
                profile(risk, purpose="growth", horizon_target_year=2035),
                candidates(fund_rows, snapshot_rows),
            )
            assert "Harvard House FR Property Fund (A)" not in {m.name for m in outcome.matches}, risk

    def test_a_cautious_saver_has_something_to_see(self, fund_rows, snapshot_rows):
        # The panel's own worked example, and the case the equity side of the
        # product cannot serve: someone who wants surety and access. Until a
        # money market fund was seeded this matched nothing at all, which made
        # the feature look broken while behaving correctly.
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Conservative", purpose="emergency_fund", horizon_target_year=2028),
            candidates(fund_rows, snapshot_rows),
        )
        assert outcome.matches, "a Conservative profile matches nothing; seed a low-risk fund"
        assert all(m.risk_indicator_1to5 <= 2 for m in outcome.matches)

    def test_a_growth_profile_has_something_to_see(self, fund_rows, snapshot_rows):
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Aggressive", purpose="growth", horizon_target_year=2033),
            candidates(fund_rows, snapshot_rows),
        )
        assert outcome.matches

    def test_the_middle_profile_has_something_to_see(self, fund_rows, snapshot_rows):
        # Closed by the Satrix bond ETFs, which are rated Cautious and sit in
        # Interest Bearing Variable Term — a Moderate category. Every one of the
        # three profiles now matches something, which is the point at which the
        # catalogue stops looking broken to whoever is testing it.
        outcome = FundMatcher(clock=lambda: TODAY).match(
            profile("Moderate", purpose="goal", horizon_target_year=2029),
            candidates(fund_rows, snapshot_rows),
        )
        assert outcome.matches, "a Moderate profile matches nothing"
        assert all(m.risk_indicator_1to5 <= 3 for m in outcome.matches)

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


class TestCorrectingATranscription:
    """INVARIANT: fixing a mis-read figure actually reaches the database.

    Snapshots are append-only and de-duplicated on the document's hash, so that
    re-running the loader is a no-op and a re-issued sheet lands beside its
    predecessor rather than overwriting it. Where no PDF was archived, that hash
    stands in for the document.

    The first version of that stand-in hashed only ISIN, date and URL. It made
    re-runs idempotent and it silently discarded every correction: same sheet,
    same URL, same date, so a fixed figure looked like a duplicate. The Satrix 40
    risk rating was wrong in a live database for exactly this reason — the CSV
    said Aggressive and the loader kept reporting success without changing
    anything.
    """

    @staticmethod
    def _identity():
        import importlib.util

        spec = importlib.util.spec_from_file_location("_seed_loader", LOADER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.transcription_identity

    def test_an_unchanged_row_keeps_its_identity(self):
        # Idempotence is the property the de-duplication exists for; a correction
        # must not be bought at the price of a new row on every run.
        identity = self._identity()
        row = {"as_of": "2026-07-31", "mdd_url": "https://x/y.pdf", "risk_indicator_1to5": 5}
        assert identity("ZAE000027108", dict(row)) == identity("ZAE000027108", dict(row))

    def test_a_corrected_figure_changes_the_identity(self):
        # The whole point: same fund, same sheet, same URL, different reading.
        identity = self._identity()
        base = {"as_of": "2026-07-31", "mdd_url": "https://x/y.pdf"}
        was_unrated = identity("ZAE000027108", base | {"risk_indicator_raw": None, "risk_indicator_1to5": None})
        now_rated = identity("ZAE000027108", base | {"risk_indicator_raw": "Aggressive", "risk_indicator_1to5": 5})
        assert was_unrated != now_rated

    def test_column_order_does_not_change_the_identity(self):
        # Otherwise re-ordering a column in the CSV would re-insert every row.
        identity = self._identity()
        assert identity("X", {"a": 1, "b": 2}) == identity("X", {"b": 2, "a": 1})

    def test_two_funds_never_share_an_identity(self):
        identity = self._identity()
        row = {"as_of": "2026-07-31", "mdd_url": "https://x/y.pdf"}
        assert identity("ZAE000027108", dict(row)) != identity("ZAE000240123", dict(row))

    def test_bookkeeping_columns_are_ignored(self):
        # fund_id is assigned after the hash is taken, and the two mdd_* columns
        # are what the hash is being computed *for*; including any of them would
        # make the identity depend on itself or on a database id.
        identity = self._identity()
        bare = {"as_of": "2026-07-31"}
        assert identity("X", dict(bare)) == identity(
            "X", bare | {"fund_id": "abc", "mdd_sha256": "def", "mdd_pdf_ref": "ghi"}
        )
