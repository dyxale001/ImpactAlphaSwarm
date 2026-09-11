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
* every box is called what the screen calls it, read out of the form's own
  source, because the prompt's whole job is telling a person where to type
  thirty-odd values;
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

# There is no exemption list, and there was one until the prompt started naming
# every box after the form's own label. Each field now appears with its column
# name in brackets beside that label, `mdd_url` included - which is named and
# then explicitly NOT asked of the model, because it is the address of the
# document being read and typing a link back is a way to introduce a typo into
# the one field that makes every other figure checkable.


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


ADD_FORM = BACKEND_ROOT.parent / "frontend" / "src" / "components" / "admin" / "AddFundForm.tsx"

#: Boxes whose label the form builds at render time, or that are not a `Field`
#: at all, so the regex below cannot see them. Listed by hand with the stable
#: part of the label, which is what the prompt says: the form renders
#: "JSE code (required)" when the vehicle is an ETF and
#: "JSE code (unit trusts may print one)" when it is not.
LABELS_NOT_IN_THE_REGEX = (
    "JSE code",           # label={isEtf ? ... : ...}
    "Price symbol",       # label={isEtf ? ... : ...}
    "Fund type",          # a <select>, labelled by a <span>
    "ASISA category",     # a <select>, labelled by a <span>
    "Index tracker",      # a <Check>
    "Tax-free eligible",  # a <Check>
)


def form_labels() -> list[tuple[str, str]]:
    """Every `label="..." name="..."` pair the add form renders as a Field."""
    import re

    return re.findall(
        r'label="([^"]+)"\s+name="([a-z_0-9]+)"', ADD_FORM.read_text(encoding="utf-8")
    )


def form_box_titles() -> list[str]:
    """The four multi-line boxes, which are PairRows with a title."""
    import re

    return re.findall(r'title="([^"]+)"', ADD_FORM.read_text(encoding="utf-8"))


class TestThePromptNamesTheBoxesTheFormShows:
    """INVARIANT: the prompt calls each box what the screen calls it.

    The point is a person typing thirty-odd values off a chat reply into a form.
    If the prompt says `fund_house` and the box says "Manager (the brand)",
    every value costs a moment's translation and a mis-typed field is easy. So
    the labels are read out of the form's own source rather than written down
    again here, and renaming a box fails this test instead of quietly drifting.
    """

    def test_every_field_label_appears_verbatim(self, prompt):
        missing = [(label, name) for label, name in form_labels() if label not in prompt]
        assert not missing, f"boxes the prompt does not name: {missing}"

    def test_there_are_as_many_labels_as_expected(self):
        """Guards the regex: nothing matched would pass the test above silently."""
        labels = form_labels()
        assert len(labels) >= 25, f"only found {len(labels)} - has the form changed shape?"

    def test_every_multi_line_box_appears_verbatim(self, prompt):
        titles = form_box_titles()
        assert len(titles) == 4, titles
        for title in titles:
            assert title in prompt, title

    def test_the_labels_the_regex_cannot_see_are_named_too(self, prompt):
        for label in LABELS_NOT_IN_THE_REGEX:
            assert label in prompt, label

    def test_each_label_carries_its_field_name(self, prompt):
        """Both, because they answer different questions.

        The label is where to type it; the field name is what gets quoted back
        when the form refuses a row, and what the column is called in the CSV.
        """
        for label, name in form_labels():
            where = prompt.index(label)
            following = prompt[where : where + len(label) + 40]
            assert f"({name})" in following, f"{label!r} is not followed by ({name})"


class TestItAsksForTheWholeForm:
    def test_every_snapshot_field_is_asked_for(self, prompt):
        """INVARIANT: the schema cannot grow a column the prompt never mentions.

        A column added to `SnapshotIn` becomes a box on an admin form. If the
        prompt does not ask for it, the box gets filled from memory or left
        blank, and neither is a transcription of the document.
        """
        missing = sorted(f for f in SnapshotIn.model_fields if f not in prompt)
        assert not missing, f"asked for nowhere in the prompt: {missing}"

    def test_the_four_fields_with_no_box_are_still_asked_for(self, prompt):
        """The add form has no box for these, and the prompt says where they go.

        Two are on the fund's edit screen and two have no box anywhere. Asked
        for regardless, because the alternative is a figure read off the sheet
        and then dropped on the floor. `recommended_min_term_years` is the one
        that matters: the matcher's horizon rule reads it, so a fund added
        through the add form alone never narrows by term until somebody opens
        its edit screen.
        """
        assert "NOT ON THE ADD FORM" in prompt
        for field in (
            "recommended_min_term_years",
            "regulation_28",
            "min_lump_sum",
            "min_debit_order",
        ):
            assert field in prompt, field
        assert "EDIT screen" in prompt

    def test_the_identity_half_is_asked_for(self, prompt):
        # Not on `SnapshotIn` - these identify the fund rather than dating a
        # document - so they are checked separately.
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

    def test_the_url_box_is_not_asked_of_the_model(self, prompt):
        """It is the address of the document being read. Typing it back is a way
        to introduce a typo into the one field that makes the rest checkable."""
        assert "mdd_url" in prompt
        assert "I paste that myself" in prompt


class TestNothingIsAskedTwice:
    """The identity and fact-sheet halves were separate prompts once.

    Joined, three fields appeared in both lists - isin, jse_code and
    asisa_category - which asks a model the same question twice and gives a
    person two boxes to reconcile.
    """

    @pytest.mark.parametrize("field", ["isin", "jse_code", "asisa_category"])
    def test_an_identity_field_is_asked_for_once(self, prompt, field):
        asked = [line for line in prompt.splitlines() if f"({field})" in line]
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
    def test_the_default_walks_the_form_in_order(self, prompt):
        """The three sections, numbered as the screen presents them."""
        one = prompt.index("FORM SECTION 1")
        two = prompt.index('FORM SECTION 2: "What identifies the fund"')
        three = prompt.index('FORM SECTION 3: "Its first fact sheet"')
        assert one < two < three, "the sections are out of order"

    def test_sheet_only_drops_the_identity_half(self):
        """For recording a later monthly sheet against an existing fund."""
        sheet_only = render("--sheet-only")
        assert 'FORM SECTION 2: "What identifies the fund"' not in sheet_only
        assert "FORM SECTION 3" in sheet_only
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
