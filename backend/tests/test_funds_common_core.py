"""Tests for the regulated common core added in migration 025.

Every column here is read off a manager's own document, and the risk is not that
one crashes — it is that one is plausibly wrong, or right but not comparable with
the same column on another fund. Two mistakes had already been made along that
line before these checks existed:

* the fee columns. Managers print TER, transaction cost and total investment
  charge for 1-Year and 3-Year, the figures differ, and the catalogue stored them
  in one place without recording which column they came from — so two funds'
  costs could be compared when one number was annual and the other three-year.

* the classification. The Satrix ILBI ETF's sheet prints "South African -
  Interest Bearing - Variable Term ILB" wrapped across a line break. Both the
  transcription and the regex reader stopped at the break, producing "Variable
  Term" — a real, different category that nothing downstream could tell apart
  from a correct reading.

`return_extremes_basis` exists because the second mistake was about to be made a
third time: Satrix publishes its best and worst year as rolling one-year periods,
FundRock publishes calendar years, and they are not the same statistic.

No Supabase, no network. The migration itself is validated against real Postgres
separately, since a check constraint cannot be tested by reading SQL.
"""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from src.funds.asisa import ASISA  # noqa: E402
from src.funds.repository import SNAPSHOT_COLUMNS  # noqa: E402
from src.funds.validators import (  # noqa: E402
    FEE_PERIODS,
    RETURN_EXTREMES_BASES,
    snapshot_validators,
)

MIGRATION = BACKEND_ROOT / "migrations" / "025_fund_snapshot_common_core.sql"
TODAY = date(2026, 9, 7)

# The columns migration 025 adds. Written out rather than parsed, so that adding
# a column to the migration and forgetting the read layer fails here.
COMMON_CORE = (
    "nav_cpu",
    "nav_date",
    "fee_period",
    "inception_date",
    "annual_management_fee",
    "return_high_12m",
    "return_low_12m",
    "return_extremes_basis",
    "risk_narrative",
    "horizon_words",
    "portfolio_manager",
    "regulation_28",
    "income_distribution",
)


def check(**row) -> list[str]:
    """Every finding for a row, as strings, blocking or not."""
    base = {"as_of": "2026-07-31"}
    return [str(p) for p in snapshot_validators(today=TODAY).check({**base, **row})]


def errors(**row) -> list[str]:
    base = {"as_of": "2026-07-31"}
    return [
        str(p) for p in snapshot_validators(today=TODAY).check({**base, **row}) if p.blocking
    ]


class TestTheMigrationAndTheReadLayerAgree:
    """INVARIANT: a column the migration adds is a column the page can read.

    `SNAPSHOT_COLUMNS` is an explicit select rather than `*`, which is the right
    choice — a column added to the table should not silently start reaching
    users — but it means the two lists have to be kept in step, and nothing about
    a missing column fails loudly on its own. It just arrives as undefined.
    """

    def test_every_common_core_column_is_in_the_migration(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        for column in COMMON_CORE:
            assert re.search(rf"add column if not exists {column}\b", sql), column

    def test_every_common_core_column_is_selected(self):
        selected = {c.strip() for c in SNAPSHOT_COLUMNS.split(",")}
        assert set(COMMON_CORE) <= selected

    def test_the_closed_vocabularies_match_the_check_constraints(self):
        """The database and the validators must name the same allowed values.

        Both exist on purpose: the constraint is the guarantee and the validator
        is the message that says which column to look at. Two lists that drift
        apart give the worst of both — a row the form accepts and the database
        then refuses, with a constraint name for an explanation.
        """
        sql = MIGRATION.read_text(encoding="utf-8")
        for values in (FEE_PERIODS, RETURN_EXTREMES_BASES):
            quoted = ", ".join(f"'{v}'" for v in values)
            assert quoted in sql, quoted


class TestNav:
    """INVARIANT: a price is dated, and a suspicious unit is flagged not hidden.

    A unit trust is not traded, so the NAV on its sheet is the only price it has:
    eleven of nineteen seeded funds had none anywhere in the system while their
    own documents printed one.
    """

    def test_a_dated_price_is_accepted(self):
        assert errors(nav_cpu=923, nav_date="2026-07-31") == []

    def test_a_price_without_a_date_is_refused(self):
        assert any("nav_date" in e for e in errors(nav_cpu=923))

    def test_a_date_without_a_price_is_refused(self):
        assert any("nav_cpu" in e for e in errors(nav_date="2026-07-31"))

    def test_a_future_price_date_is_refused(self):
        assert any("future" in e for e in errors(nav_cpu=923, nav_date="2027-01-31"))

    def test_a_rand_figure_gets_a_warning_naming_the_conversion(self):
        """REGRESSION GUARD: the range alone does not catch a unit error.

        The first version of this validator had a floor of one cent and a comment
        claiming it caught an unconverted rand figure. Satrix's "NAV Price R9.23"
        passed it cleanly, because plausible rand prices and plausible cent prices
        overlap across nearly their whole range. A warning that names the
        conversion is what this can honestly offer.
        """
        found = check(nav_cpu=9.23, nav_date="2026-07-31")
        assert errors(nav_cpu=9.23, nav_date="2026-07-31") == []
        assert any("923" in f and "warning" in f for f in found)

    def test_a_unit_trust_priced_in_cents_is_not_flagged(self):
        assert check(nav_cpu=183.63, nav_date="2026-07-31") == []


class TestFeePeriod:
    """INVARIANT: a cost figure says which period it covers, or says nothing."""

    def test_the_published_periods_are_accepted(self):
        for period in FEE_PERIODS:
            assert errors(ter=1.26, fee_period=period) == []

    def test_an_unpublished_period_is_refused(self):
        assert any("fee_period" in e for e in errors(ter=1.26, fee_period="ytd"))

    def test_fees_without_a_period_are_a_warning_not_a_refusal(self):
        """The figures are still the manager's own.

        Fifteen of the nineteen seeded rows are in this state: transcribed before
        the column existed, so which fee column they came from is genuinely not
        known without re-reading the sheet. Refusing them would empty the
        catalogue to make a point.
        """
        assert errors(ter=1.26, tc=0.11, tic=1.37) == []
        assert any("fee_period" in f for f in check(ter=1.26, tc=0.11, tic=1.37))

    def test_a_row_with_no_fees_at_all_is_silent(self):
        assert check() == []

    def test_the_management_fee_counts_as_a_fee(self):
        assert any("fee_period" in f for f in check(annual_management_fee=0.58))


class TestManagementFee:
    """INVARIANT: the manager's cut is plausible, and its relation to the TER is
    a hint rather than a rule."""

    def test_a_normal_fee_is_accepted(self):
        assert check(annual_management_fee=0.18, ter=0.25, fee_period="1y") == []

    def test_a_percent_typed_as_a_whole_number_is_refused(self):
        assert any("annual_management_fee" in e for e in errors(annual_management_fee=58))

    def test_a_fee_above_the_ter_warns_without_refusing(self):
        """The TER includes VAT and is net of waivers, so inversion is possible.

        Refusing the row would mean refusing the document.
        """
        row = dict(annual_management_fee=1.8, ter=0.25, fee_period="1y")
        assert errors(**row) == []
        assert any("total expense ratio" in f for f in check(**row))


class TestReturnExtremes:
    """INVARIANT: the best and worst year travel with the basis they were measured on.

    Without the basis the two numbers are not comparable between funds, and the
    page has no way to know that.
    """

    def test_a_rolling_pair_with_its_basis_is_accepted(self):
        assert errors(
            return_high_12m=18.51, return_low_12m=-4.49, return_extremes_basis="rolling_12m"
        ) == []

    def test_a_calendar_pair_with_its_basis_is_accepted(self):
        assert errors(
            return_high_12m=26.22, return_low_12m=-6.10, return_extremes_basis="calendar_year"
        ) == []

    def test_a_pair_without_a_basis_is_refused(self):
        found = errors(return_high_12m=18.51, return_low_12m=-4.49)
        assert any("return_extremes_basis" in e for e in found)

    def test_an_unpublished_basis_is_refused(self):
        found = errors(
            return_high_12m=18.51, return_low_12m=-4.49, return_extremes_basis="ytd"
        )
        assert any("return_extremes_basis" in e for e in found)

    def test_a_swapped_pair_is_refused(self):
        """Managers print the negative one in brackets, not with a minus sign."""
        found = errors(
            return_high_12m=-4.49, return_low_12m=18.51, return_extremes_basis="rolling_12m"
        )
        assert any("swapped" in e for e in found)

    def test_a_positive_worst_year_is_accepted(self):
        """The Satrix 40 sheet's lowest annual rolling return is +1.17%.

        It measures ten non-overlapping one-year periods, and none of them was
        negative. A validator that assumed the worst year must be a loss would
        refuse a correct transcription.
        """
        assert errors(
            return_high_12m=25.34, return_low_12m=1.17, return_extremes_basis="rolling_12m"
        ) == []

    def test_a_return_typed_without_its_decimal_point_is_refused(self):
        found = errors(
            return_high_12m=1851, return_low_12m=-4.49, return_extremes_basis="rolling_12m"
        )
        assert any("return_high_12m" in e for e in found)


class TestInceptionDate:
    def test_a_past_date_is_accepted(self):
        assert errors(inception_date="2017-02-24") == []

    def test_a_future_date_is_refused(self):
        assert any("future" in e for e in errors(inception_date="2027-01-01"))

    def test_a_date_after_the_sheet_is_refused(self):
        assert any(
            "after the sheet" in e for e in errors(inception_date="2026-08-01")
        )

    def test_a_mistyped_century_is_refused(self):
        assert any("before collective" in e for e in errors(inception_date="1917-02-24"))


class TestIncomeDistribution:
    """INVARIANT: a declared zero is kept, a negative is refused.

    The Satrix ILBI sheet prints "Feb-26 0.00" — a real declared nothing — while
    the FundRock sheet prints a dash for the same thing. The dash is omitted and
    the zero is stored, because they are different statements.
    """

    def test_a_history_with_a_declared_zero_is_accepted(self):
        assert errors(income_distribution={"2026-06": 3.93, "2026-02": 0.00}) == []

    def test_a_negative_distribution_is_refused(self):
        found = errors(income_distribution={"2026-06": -3.93})
        assert any("never negative" in e for e in found)

    def test_something_that_is_not_a_mapping_is_refused(self):
        assert any("income_distribution" in e for e in errors(income_distribution=[1, 2]))

    def test_an_absent_history_is_silent(self):
        assert check(income_distribution=None) == []


class TestTheFifteenthCategory:
    """REGRESSION GUARD: Variable Term ILB is a category, not a truncation."""

    def test_the_two_variable_term_categories_are_distinct(self):
        nominal = ASISA.by_code("sa_ib_variable_term")
        linked = ASISA.by_code("sa_ib_variable_term_ilb")
        assert nominal is not None and linked is not None
        assert nominal.name != linked.name

    def test_the_wrapped_name_resolves_to_the_linked_category(self):
        """As the sheet's text layer actually produces it, line break included."""
        wrapped = "South African - Interest Bearing - Variable Term \nILB"
        assert ASISA.resolve(wrapped) is ASISA.by_code("sa_ib_variable_term_ilb")

    def test_the_nominal_name_does_not_resolve_to_the_linked_one(self):
        nominal = "South African - Interest Bearing - Variable Term"
        assert ASISA.resolve(nominal) is ASISA.by_code("sa_ib_variable_term")

    def test_an_abbreviated_name_resolves(self):
        """Sheets and readers both shorten it; the published name is one string."""
        assert ASISA.resolve("SA Multi Asset High Equity") is ASISA.by_code(
            "sa_ma_high_equity"
        )

    def test_an_en_dash_resolves(self):
        """The Satrix Property sheet prints an en dash where the standard has a hyphen."""
        assert ASISA.resolve("South African – Real Estate - General") is ASISA.by_code(
            "sa_re_general"
        )

    def test_a_category_we_do_not_cover_stays_unresolved(self):
        assert ASISA.resolve("Global - Bond - Whatever") is None

    def test_the_linked_category_is_placed_in_the_same_brackets_as_the_nominal_one(self):
        """Splitting the category out must not narrow anyone's bracket.

        The ILBI ETF is what a Moderate profile currently matches on. Adding the
        category to the classification without placing it in the brackets would
        have removed a fund from that bracket as a side effect of a data fix.
        """
        from src.funds.asisa import BRACKET_CATEGORIES, INCOME_DISTRIBUTING

        for bracket, codes in BRACKET_CATEGORIES.items():
            if "sa_ib_variable_term" in codes:
                assert "sa_ib_variable_term_ilb" in codes, bracket
        assert "sa_ib_variable_term_ilb" in INCOME_DISTRIBUTING


class TestTheSeedCarriesTheCommonCore:
    """The point of the phase is coverage, so it is measured rather than assumed."""

    def test_the_four_readable_sheets_are_populated(self):
        import csv

        rows = {
            r["isin"]: r
            for r in csv.DictReader(
                (BACKEND_ROOT / "data" / "funds" / "snapshots.csv").open(
                    newline="", encoding="utf-8"
                )
            )
        }
        # The four funds whose Minimum Disclosure Document is readable locally.
        for isin in ("ZAE000240123", "ZAE000240131", "ZAE000027108", "ZAE000188538"):
            row = rows[isin]
            assert row["nav_cpu"], isin
            assert row["nav_date"], isin
            assert row["fee_period"] == "1y", isin
            assert row["inception_date"], isin
            assert row["annual_management_fee"], isin
            assert row["return_extremes_basis"], isin
            assert row["portfolio_manager"], isin
            assert row["income_distribution"], isin
            assert row["top_holdings"], isin

    def test_the_ilb_fund_is_filed_under_its_own_category(self):
        import csv

        funds = {
            r["isin"]: r
            for r in csv.DictReader(
                (BACKEND_ROOT / "data" / "funds" / "funds.csv").open(
                    newline="", encoding="utf-8"
                )
            )
        }
        assert (
            funds["ZAE000240123"]["asisa_category"]
            == "South African - Interest Bearing - Variable Term ILB"
        )
