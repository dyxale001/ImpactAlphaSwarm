"""Tests for the ASISA classification and the bracket policy over it.

Two claims. The first is that the classification in code and the classification
seeded into the database are the same list — they are written in two files, and a
category present in one but not the other means either a fund cannot be stored or
a filter offers something the catalogue cannot answer.

The second is that the bracket policy only ever names categories that exist. A
typo in a bracket does not raise: it silently shows a user fewer funds, or none,
which is the failure mode hardest to notice from the outside.

No Supabase, no network: the migration is read as text.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds import asisa  # noqa: E402
from src.funds.asisa import (  # noqa: E402
    ASISA,
    ASISA_VERSION,
    BRACKET_CATEGORIES,
    BRACKET_ORDER,
    HORIZON_CAP,
    INCOME_DISTRIBUTING,
    LIQUIDITY,
    TRACKER_ONLY,
    AsisaClassification,
)

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "024_funds.sql"

# Matches one seeded row: ('version', 'code', 'tier1', 'tier2', 'tier3', 'name')
_SEED_ROW = re.compile(
    r"\('(?P<version>[\d-]+)',\s*"
    r"'(?P<code>\w+)',\s*"
    r"'(?P<tier1>[^']+)',\s*"
    r"'(?P<tier2>[^']+)',\s*"
    r"'(?P<tier3>[^']+)',\s*"
    r"'(?P<name>[^']+)'\)"
)


def seeded_rows() -> list[dict[str, str]]:
    sql = MIGRATION.read_text(encoding="utf-8")
    start = sql.index("insert into public.asisa_categories")
    end = sql.index("on conflict (version, code) do nothing", start)
    return [m.groupdict() for m in _SEED_ROW.finditer(sql[start:end])]


class TestMigrationAgreesWithCode:
    """INVARIANT: the seeded classification and the one in code are identical.

    REGRESSION GUARD by construction: adding a category to one file and not the
    other is the mistake this catches, and it is the likeliest one, because the
    two files are edited for different reasons.
    """

    def test_the_migration_actually_seeds_rows(self):
        # Guards the test itself: a parser that silently matched nothing would
        # make every comparison below trivially true.
        assert len(seeded_rows()) == len(ASISA.categories)
        assert len(seeded_rows()) > 0

    def test_every_seeded_row_matches_its_code_entry(self):
        for row in seeded_rows():
            category = ASISA.by_code(row["code"])
            assert category is not None, f"{row['code']} is seeded but not in code"
            assert category.tier1 == row["tier1"]
            assert category.tier2 == row["tier2"]
            assert category.tier3 == row["tier3"]
            assert category.name == row["name"]

    def test_every_code_entry_is_seeded(self):
        seeded_codes = {row["code"] for row in seeded_rows()}
        assert ASISA.codes() == seeded_codes

    def test_the_version_is_the_same_in_both(self):
        assert {row["version"] for row in seeded_rows()} == {ASISA_VERSION}


class TestClassification:
    """INVARIANT: lookups are exact, and an uncovered category is None not a guess."""

    def test_lookup_by_name_and_code_round_trips(self):
        for category in ASISA.categories:
            assert ASISA.by_name(category.name) is category
            assert ASISA.by_code(category.code) is category
            assert ASISA.code_for(category.name) == category.code
            assert ASISA.is_known(category.name)

    def test_an_uncovered_category_is_not_guessed(self):
        # A near miss must not resolve. A fund transcribed into a category the
        # policy has no opinion about is a curation decision, and silently
        # snapping it to the closest match would hide that.
        for name in (
            "South African - Equity - Financial",
            "south african - interest bearing - money market",
            "South African-Interest Bearing-Money Market",
            "",
        ):
            assert ASISA.by_name(name) is None
            assert ASISA.code_for(name) is None
            assert not ASISA.is_known(name)

    def test_names_and_codes_are_unique(self):
        assert len(set(ASISA.names())) == len(ASISA.categories)
        assert len(ASISA.codes()) == len(ASISA.categories)

    def test_the_display_name_is_built_from_the_three_tiers(self):
        # The interface quotes this name back as the fund's own classification,
        # so it has to read the way a fact sheet prints it.
        for category in ASISA.categories:
            assert category.name == f"{category.tier1} - {category.tier2} - {category.tier3}"

    def test_tree_covers_every_category_and_nothing_else(self):
        tree = ASISA.tree()
        flattened = {
            (tier1, tier2, tier3)
            for tier1, classes in tree.items()
            for tier2, focuses in classes.items()
            for tier3 in focuses
        }
        assert flattened == {(c.tier1, c.tier2, c.tier3) for c in ASISA.categories}

    def test_a_different_revision_can_be_handed_in(self):
        # The seam the class exists for: the standard was revised once already,
        # and the next revision has to be testable before it ships.
        future = AsisaClassification("2099-01-01", ASISA.categories[:2])
        assert future.version == "2099-01-01"
        assert len(future.categories) == 2
        assert ASISA.version == ASISA_VERSION  # the shipped one is untouched


class TestBracketPolicy:
    """INVARIANT: the policy is expressible in the vocabulary it claims to use."""

    def test_every_bracket_names_only_real_categories(self):
        for bracket, codes in BRACKET_CATEGORIES.items():
            unknown = codes - ASISA.codes()
            assert not unknown, f"{bracket} names categories that do not exist: {unknown}"

    def test_every_policy_set_names_only_real_categories(self):
        for label, codes in (("LIQUIDITY", LIQUIDITY), ("INCOME_DISTRIBUTING", INCOME_DISTRIBUTING)):
            unknown = codes - ASISA.codes()
            assert not unknown, f"{label} names categories that do not exist: {unknown}"

    def test_tracker_restrictions_apply_to_categories_the_bracket_has(self):
        # Restricting a category a bracket never shows would be dead policy that
        # reads as though it were doing something.
        for bracket, restricted in TRACKER_ONLY.items():
            assert restricted <= BRACKET_CATEGORIES[bracket], bracket

    def test_brackets_and_order_cover_the_same_three_profiles(self):
        assert set(BRACKET_CATEGORIES) == set(BRACKET_ORDER)
        assert set(TRACKER_ONLY) == set(BRACKET_ORDER)
        # Order is the precedence rule, so its direction is load-bearing.
        assert BRACKET_ORDER == ("Conservative", "Moderate", "Aggressive")

    def test_horizon_caps_name_real_brackets(self):
        assert set(HORIZON_CAP.values()) <= set(BRACKET_ORDER)
        assert set(HORIZON_CAP) == {"under_2", "2_to_5", "5_plus"}

    def test_a_horizon_cap_never_raises_a_bracket(self):
        # The bands are ordered least to most patient, and the caps they map to
        # must be ordered the same way, or a short horizon could widen the list.
        caps = [BRACKET_ORDER.index(HORIZON_CAP[band]) for band in ("under_2", "2_to_5", "5_plus")]
        assert caps == sorted(caps)

    def test_no_bracket_is_empty(self):
        for bracket, codes in BRACKET_CATEGORIES.items():
            assert codes, f"{bracket} would show nothing at all"

    def test_the_emergency_fund_override_can_always_be_satisfied(self):
        # PurposeRule collapses an emergency fund to the liquidity categories
        # whatever the risk answers. If those are not inside the most cautious
        # bracket, the most cautious user asking for accessible money gets an
        # empty list — the exact case the panel raised.
        assert LIQUIDITY <= BRACKET_CATEGORIES["Conservative"]

    def test_the_cautious_bracket_holds_no_pure_equity_or_property(self):
        # PINNED VALUE with teeth: the bracket table is a proposal, but this
        # property of it is not up for quiet revision.
        cautious = BRACKET_CATEGORIES["Conservative"]
        for code in ("sa_eq_general", "gl_eq_general", "sa_re_general", "gl_re_general"):
            assert code not in cautious

    def test_brackets_widen_as_risk_tolerance_rises(self):
        # Not a subset relation — a moderate bracket deliberately drops the
        # cautious cash categories — but the count must not fall, or "more risk
        # tolerance, fewer options" would be the result.
        sizes = [len(BRACKET_CATEGORIES[bracket]) for bracket in BRACKET_ORDER]
        assert sizes == sorted(sizes)

    def test_module_exports_what_the_matcher_imports(self):
        # Cheap guard against a rename landing in one file only.
        for name in (
            "ASISA",
            "ASISA_VERSION",
            "BRACKET_CATEGORIES",
            "BRACKET_ORDER",
            "TRACKER_ONLY",
            "LIQUIDITY",
            "INCOME_DISTRIBUTING",
            "HORIZON_CAP",
        ):
            assert hasattr(asisa, name), name
