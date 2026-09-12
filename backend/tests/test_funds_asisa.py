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

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"

# Every migration that seeds categories, in the order they are applied. 024 laid
# down the first fourteen; 025 added the fifteenth, Variable Term ILB, after a
# fund was found filed under the nominal class because its own sheet wraps the
# name across two lines. Discovered by globbing rather than listed, so a later
# migration that adds a category is covered without editing this file — which is
# the point of the tripwire, and a hard-coded list would quietly stop being one.

# Matches one seeded row: ('version', 'code', 'tier1', 'tier2', 'tier3', 'name')
_SEED_ROW = re.compile(
    r"\('(?P<version>[\d-]+)',\s*"
    r"'(?P<code>\w+)',\s*"
    r"'(?P<tier1>[^']+)',\s*"
    r"'(?P<tier2>[^']+)',\s*"
    r"'(?P<tier3>[^']+)',\s*"
    r"'(?P<name>[^']+)'\)"
)


_SEED_STATEMENT = "insert into public.asisa_categories"
_SEED_END = "on conflict (version, code) do nothing"


def seeding_migrations() -> list[Path]:
    """The migrations that seed categories, in application order."""
    found = [
        path
        for path in sorted(MIGRATIONS.glob("*.sql"))
        if _SEED_STATEMENT in path.read_text(encoding="utf-8")
    ]
    assert found, f"no migration under {MIGRATIONS} seeds asisa_categories"
    return found


def seeded_rows() -> list[dict[str, str]]:
    """Every category row seeded across the migration set.

    Ordering matters only in that a later migration may not restate a row from an
    earlier one; `test_no_category_is_seeded_twice` holds that.
    """
    rows: list[dict[str, str]] = []
    for path in seeding_migrations():
        sql = path.read_text(encoding="utf-8")
        cursor = 0
        while True:
            try:
                start = sql.index(_SEED_STATEMENT, cursor)
            except ValueError:
                break
            end = sql.index(_SEED_END, start)
            rows.extend(m.groupdict() for m in _SEED_ROW.finditer(sql[start:end]))
            cursor = end
    return rows


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

    def test_no_category_is_seeded_twice(self):
        """Two migrations must not both claim the same code.

        The seed statements end in `on conflict (version, code) do nothing`, so a
        later migration restating an earlier row applies cleanly and changes
        nothing — including when the restated row DISAGREES. That is the one way
        the code-versus-database comparison above could pass while the database
        holds something else, so it is checked separately rather than trusted.
        """
        codes = [row["code"] for row in seeded_rows()]
        assert len(codes) == len(set(codes)), f"seeded twice: {sorted(set(codes))}"

    def test_the_fifteenth_category_is_the_ilb_one(self):
        """REGRESSION GUARD: Variable Term ILB is a category, not a suffix.

        The Satrix ILBI ETF's sheet prints "South African - Interest Bearing -
        Variable Term ILB" wrapped across a line break. Both the transcription
        and the regex reader stopped at the break, so the fund was filed under
        nominal Variable Term — a real, different category that its own document
        does not state, and one nothing downstream could tell apart.
        """
        nominal = ASISA.by_code("sa_ib_variable_term")
        linked = ASISA.by_code("sa_ib_variable_term_ilb")
        assert nominal is not None and linked is not None
        assert nominal.name != linked.name
        assert linked.tier3 == "Variable Term ILB"
        # And the truncated form must not resolve to the linked one.
        assert ASISA.resolve(nominal.name) is nominal
        assert ASISA.resolve(linked.name) is linked


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
        # Not a subset relation throughout — a moderate bracket deliberately
        # drops the cautious cash categories — but the count must not fall, or
        # "more risk tolerance, fewer options" would be the result. Writing the
        # aggressive bracket as a curated list is what first broke this.
        sizes = [len(BRACKET_CATEGORIES[bracket]) for bracket in BRACKET_ORDER]
        assert sizes == sorted(sizes)

    def test_the_top_bracket_contains_the_middle_one(self):
        # An aggressive profile must not be shown less than a moderate one.
        assert BRACKET_CATEGORIES["Moderate"] <= BRACKET_CATEGORIES["Aggressive"]

    def test_the_top_bracket_lifts_the_tracker_restriction(self):
        # Broad-market equity reaches a moderate bracket only as an index
        # tracker; above it, a stock-picking equity fund is a fair option.
        assert TRACKER_ONLY["Aggressive"] == frozenset()

    def test_every_category_we_seed_is_reachable_from_some_bracket(self):
        # A category stored in the database but named by no bracket can hold a
        # fund that never matches anyone. That is either a curation decision
        # nobody recorded or an orphan, and both want noticing here rather than
        # as "why does this fund never appear".
        reachable: set[str] = set()
        for codes in BRACKET_CATEGORIES.values():
            reachable |= codes
        orphans = ASISA.codes() - reachable
        assert not orphans, f"seeded but unreachable: {sorted(orphans)}"

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
