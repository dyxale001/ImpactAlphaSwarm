"""Tests for the hand-entry prompt.

`scripts/factsheet_prompt.py` prints the rules to paste into a chat with a fact
sheet attached, for typing a fund into the admin form. It is the whole of the
reading path now: the in-app readers were removed on 2026-09-09 and funds are
entered by hand.

That makes this file's job narrow and worth stating. The prompt is not checkable
the way a reader was — nothing verifies a chat's answers against the document,
so there is no accuracy number to defend. What CAN be checked is that the prompt
still describes the form it feeds:

* every field the API will accept is asked for, so a new column cannot be added
  to the schema and quietly go unasked, leaving a box the admin fills from
  nowhere;
* the ASISA categories match `asisa.py` exactly, because they are a closed
  vocabulary and a near-miss is a different real category rather than a typo;
* no field is asked for twice, which is how the identity and fact-sheet halves
  first came out when they were joined.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from src.funds.admin_routes import SnapshotIn  # noqa: E402
from src.funds.asisa import ASISA  # noqa: E402

SCRIPT = BACKEND_ROOT / "scripts" / "factsheet_prompt.py"

#: Fields the prompt deliberately does not ask for BY NAME, and why. Anything
#: else missing is a gap, which is the point of the test below.
NOT_ASKED_BY_NAME = {
    # The four list fields are asked for under headings a person reads
    # ("WHAT IT HOLDS", "TOP HOLDINGS", "PAST RETURNS", "PAID OUT") rather than
    # by their column names, because they are the boxes on the form that take
    # several lines each and the heading is what the admin is looking at.
    "asset_allocation",
    "top_holdings",
    "performance",
    "income_distribution",
    # The document's own address. The person pastes it into the form's URL box;
    # asking a model to repeat a link back is a way to introduce a typo into the
    # one field that makes every figure on the row checkable.
    "mdd_url",
}


def render(*args: str) -> str:
    done = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout


@pytest.fixture(scope="module")
def prompt() -> str:
    return render()


class TestItAsksForTheWholeForm:
    def test_every_snapshot_field_is_asked_for(self, prompt):
        """INVARIANT: the schema cannot grow a column the prompt never mentions.

        A column added to `SnapshotIn` becomes a box on the admin form. If the
        prompt does not ask for it, the box gets filled from memory or left
        blank, and neither is a transcription of the document.
        """
        missing = sorted(
            field
            for field in SnapshotIn.model_fields
            if field not in prompt and field not in NOT_ASKED_BY_NAME
        )
        assert not missing, f"asked for nowhere in the prompt: {missing}"

    def test_the_list_fields_are_asked_for_under_their_headings(self, prompt):
        for heading in ("WHAT IT HOLDS", "TOP HOLDINGS", "PAST RETURNS", "PAID OUT"):
            assert heading in prompt, heading

    def test_the_identity_half_is_asked_for(self, prompt):
        # These are not on `SnapshotIn` — they identify the fund rather than
        # dating a document — so they are checked separately.
        for field in (
            "isin",
            "name",
            "fund_house",
            "manco",
            "vehicle",
            "asisa_category",
            "jse_code",
            "yahoo_symbol",
            "mdd_page_url",
            "curation_rule",
            "is_index_tracker",
            "tfsa_eligible",
        ):
            assert field in prompt, field

    def test_the_form_fills_geography_and_asset_class_itself(self, prompt):
        """Both come off the chosen category, so asking invites disagreement.

        The form sets all three from one ASISA record precisely so the columns
        cannot contradict each other. A model asked for them separately would
        sometimes give a third answer.
        """
        assert "asisa_geography" not in prompt
        assert "asisa_asset_class" not in prompt


class TestNothingIsAskedTwice:
    """The identity and fact-sheet halves were separate prompts once.

    Joined, three fields appeared in both lists — isin, jse_code and
    asisa_category — which asks a model to answer the same question twice and
    gives a person two boxes to reconcile.
    """

    @pytest.mark.parametrize("field", ["isin", "jse_code", "asisa_category"])
    def test_an_identity_field_is_asked_for_once(self, prompt, field):
        asked = [
            line
            for line in prompt.splitlines()
            if line.strip().startswith(f"- {field}:") or line.strip().startswith(f"{field}  ")
        ]
        assert len(asked) == 1, asked


class TestTheAsisaListMatchesTheCode:
    """INVARIANT: the categories offered are the ones the validator accepts.

    Written out in the prompt but generated from `asisa.py`, because a list
    copied into the script would drift the first time a category changed and the
    drift would look like a model mistake. Migration 025 adding
    "Variable Term ILB" is the case that happened.
    """

    def test_every_category_appears(self, prompt):
        for category in ASISA.categories:
            assert category.name in prompt, category.name

    def test_no_extra_category_is_offered(self, prompt):
        start = prompt.index("ASISA CATEGORIES")
        offered = {
            line.strip()
            for line in prompt[start:].splitlines()
            if line.startswith("  ") and line.strip()
        }
        known = {c.name for c in ASISA.categories}
        assert offered == known, f"offered but unknown: {sorted(offered - known)}"


class TestTheModes:
    def test_the_default_covers_identity_and_the_sheet(self, prompt):
        assert "IDENTITY" in prompt
        assert "THE FACT SHEET" in prompt

    def test_sheet_only_drops_the_identity_half(self):
        """For recording a later monthly sheet against an existing fund."""
        sheet_only = render("--sheet-only")
        assert "IDENTITY" not in sheet_only
        assert "THE FACT SHEET" in sheet_only
        # The category list goes with it: the fund already has one, and it is
        # the longest block in the prompt.
        assert "ASISA CATEGORIES" not in sheet_only

    def test_research_is_opt_in_and_splits_identifiers_from_figures(self):
        assert "[RESEARCHED]" not in render()
        research = render("--research")
        assert "[RESEARCHED]" in research
        # The split is the whole point: an ISIN is permanent, a fee is dated and
        # class-specific and would be shown under this sheet's date.
        assert "WHAT YOU MUST NOT RESEARCH" in research
        for figure in ("TER", "NAV", "fund size"):
            after = research[research.index("WHAT YOU MUST NOT RESEARCH") :]
            assert figure in after, figure

    def test_every_mode_still_renders(self):
        for args in ([], ["--sheet-only"], ["--research"], ["--sheet-only", "--research"]):
            assert len(render(*args)) > 2000, args


class TestItCarriesTheRulesThatCostSomething:
    """Each of these was added because a real sheet produced a wrong answer.

    They are asserted individually rather than by length, because the failure
    they guard is silent: a prompt missing the fee rule still reads perfectly
    well and quietly takes the 3-year column.
    """

    def test_the_fee_column_rule(self, prompt):
        assert "1-YEAR" in prompt
        assert "fee_period" in prompt

    def test_the_stated_fee_reduction_beats_the_column(self, prompt):
        assert "reduced" in prompt

    def test_the_fee_arithmetic_self_check(self, prompt):
        assert "TER + TC = TIC" in prompt or "expense ratio plus the transaction cost" in prompt

    def test_the_risk_graphic_refusal(self, prompt):
        assert "shading" in prompt or "shaded" in prompt

    def test_the_temperament_scale_warning(self, prompt):
        # Satrix words its scale by temperament, where "conservative" is the
        # LOWEST step. This is what put an AGGRESSIVE-rated ETF in as unrated.
        assert "CONSERVATIVE" in prompt
        assert "lowest step" in prompt.lower()

    def test_the_nav_is_in_cents(self, prompt):
        assert "cents" in prompt.lower()

    def test_the_two_return_bases_are_distinguished(self, prompt):
        assert "rolling_12m" in prompt
        assert "calendar_year" in prompt

    def test_the_maximum_is_not_a_minimum(self, prompt):
        # A tax-free fund prints a MAXIMUM lump sum, because SARS caps
        # contributions. Read as a minimum it inverts the meaning, and it was
        # returned as one on the first live run.
        assert "maximum is not a minimum" in prompt.lower() or "MAXIMUM" in prompt
