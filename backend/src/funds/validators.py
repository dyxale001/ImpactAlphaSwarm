"""Row validators for fund and fact-sheet data.

Every figure in this catalogue is transcribed or extracted from a PDF, so the
realistic failure is not a crash — it is a plausible wrong number. A total
expense ratio typed as 146 instead of 1.46, an allocation that sums to 60
because a row was missed, a risk level of 3 recorded next to a raw label that
says "High". None of those raise anything. All of them change what a user is
shown.

So the validators are the gate, and they run in the same place twice: the seed
loader refuses to write a row that fails, and the admin interface will refuse to
save one. The database check constraints behind them cover only the closed
vocabularies; everything requiring arithmetic or cross-field agreement is here,
where the message can say what to fix.

Severity is real: an error blocks a write, a warning is recorded and shown to
whoever is reviewing. "Transaction costs do not quite add up" is worth a human
glance and is not worth refusing a fact sheet over.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable, Sequence

from .asisa import ASISA
from .risk_scale import normalize as normalize_risk_indicator

ERROR = "error"
WARNING = "warning"

# A fact sheet older than this at load time is stale enough to question. Board
# Notice 92 requires the content to be updated at least quarterly, so ~4 months
# means either the fund stopped publishing or we are reading a cached copy — one
# platform-hosted sheet found during design was five years old.
MAX_FACTSHEET_AGE_DAYS = 120

# A total expense ratio is a percentage. Anything this side of it is a decimal
# point in the wrong place, which is the single likeliest transcription error and
# the one a reader would never catch.
MAX_PLAUSIBLE_FEE_PERCENT = 15.0

# Longest recommended minimum term any sheet realistically states.
MAX_PLAUSIBLE_TERM_YEARS = 30.0

# Asset allocation should sum to about 100. The tolerance absorbs rounding on a
# sheet that prints one decimal place, not a missing line item.
ALLOCATION_MIN_TOTAL = 95.0
ALLOCATION_MAX_TOTAL = 105.0

# A rolling one-year return, as a percentage. Wide on purpose: a South African
# property fund's worst year ran close to -50%, and a best year near +100% is
# implausible without being impossible. This catches a misplaced decimal point
# and a dropped sign, not an opinion about markets.
MIN_PLAUSIBLE_ANNUAL_RETURN = -100.0
MAX_PLAUSIBLE_ANNUAL_RETURN = 200.0

# Net asset value per unit, in cents. The range is only an absurdity check — see
# NavValidator on why a unit error cannot be caught by range alone.
MIN_PLAUSIBLE_NAV_CPU = 1.0
MAX_PLAUSIBLE_NAV_CPU = 10_000_000.0

# Under a rand a unit. Real for a few funds and not an error, but also exactly
# what a rand figure stored without converting looks like, so it is worth a look.
NAV_CPU_SECOND_LOOK = 100.0

# Which period the stored fee figures cover. Mirrors the check constraint in
# migration 025, in both places on purpose: the database refuses the row and this
# says which column to look at.
FEE_PERIODS = ("1y", "3y")

# On what basis the best and worst year were measured. Not a formatting choice:
# Satrix publishes rolling one-year periods and FundRock publishes calendar
# years, and the two are different statistics for the same question.
RETURN_EXTREMES_BASES = ("rolling_12m", "calendar_year")

# No collective investment scheme in this catalogue predates the legislation that
# created them. A date before this is a mistyped year, not a very old fund.
EARLIEST_PLAUSIBLE_INCEPTION = date(1965, 1, 1)


@dataclass(frozen=True)
class Problem:
    """One thing wrong with one row."""

    field: str
    message: str
    severity: str = ERROR

    @property
    def blocking(self) -> bool:
        return self.severity == ERROR

    def __str__(self) -> str:
        return f"[{self.severity}] {self.field}: {self.message}"


def as_number(value: Any) -> float | None:
    """Read a number out of a CSV cell, a JSON value or a database column.

    Returns None for absent values AND for unparseable ones; a caller that cares
    about the difference checks emptiness itself. Percent signs, thousands
    separators and stray whitespace are stripped, because they all appear in
    figures copied off a PDF.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    text = value.strip().replace("%", "").replace(" ", "").replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


class RowValidator(ABC):
    """One check over one row. Returns findings rather than raising.

    Returning a list is what lets the loader report everything wrong with a
    sheet at once. Raising on the first problem would mean transcribing twenty
    funds, running the loader twenty times, and fixing one field per run.
    """

    name: str = "validator"

    @abstractmethod
    def check(self, row: dict[str, Any]) -> list[Problem]:
        ...


class NumericRangeValidator(RowValidator):
    """A named numeric field must parse, and must sit inside a plausible range.

    The shared behaviour of every "this number looks wrong" check: absent is
    fine unless required, present-but-unparseable is always an error, and
    out-of-range carries a message naming the range so the fix is obvious.
    """

    def __init__(
        self,
        field: str,
        minimum: float,
        maximum: float,
        *,
        required: bool = False,
        unit: str = "",
    ):
        self.field = field
        self.minimum = minimum
        self.maximum = maximum
        self.required = required
        self.unit = unit
        self.name = f"range:{field}"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        raw = row.get(self.field)
        if is_blank(raw):
            if self.required:
                return [Problem(self.field, "is required")]
            return []
        number = as_number(raw)
        if number is None:
            return [Problem(self.field, f"is not a number: {raw!r}")]
        if not (self.minimum <= number <= self.maximum):
            unit = f" {self.unit}" if self.unit else ""
            return [
                Problem(
                    self.field,
                    f"{number}{unit} is outside the plausible range "
                    f"{self.minimum}-{self.maximum}{unit}; check the decimal point",
                )
            ]
        return self.extra_checks(row, number)

    def extra_checks(self, row: dict[str, Any], number: float) -> list[Problem]:
        """Hook for a subclass that needs the parsed value for more than range."""
        return []


class RiskLabelValidator(NumericRangeValidator):
    """The normalised risk level must be on the scale AND agree with the words.

    The agreement half is the point. A level typed by hand next to a raw label
    it contradicts is invisible in the interface — the words are shown, the
    number does the filtering — so the two would disagree silently and a user
    would be matched on a rating nobody assigned.
    """

    def __init__(self):
        super().__init__("risk_indicator_1to5", 1, 5, unit="")
        self.name = "risk_label"

    def extra_checks(self, row: dict[str, Any], number: float) -> list[Problem]:
        problems: list[Problem] = []
        if not float(number).is_integer():
            problems.append(
                Problem(self.field, f"{number} is not one of the five published steps")
            )
        raw = row.get("risk_indicator_raw")
        if not is_blank(raw):
            expected = normalize_risk_indicator(raw)
            if expected is None:
                problems.append(
                    Problem(
                        "risk_indicator_raw",
                        f"{raw!r} is not a wording this scale recognises; add it to "
                        f"risk_scale._RISK_ALIASES or record the level as blank",
                        WARNING,
                    )
                )
            elif expected != int(number):
                problems.append(
                    Problem(
                        self.field,
                        f"{int(number)} disagrees with the sheet's own wording "
                        f"{raw!r}, which reads as {expected}",
                    )
                )
        return problems


class IsinValidator(RowValidator):
    """The identifier everything else keys on.

    Twelve characters: two-letter country code, nine alphanumeric, one check
    digit. Validated by shape rather than by the check-digit algorithm, which
    would reject a valid ISIN we mistyped in a way the shape check already
    catches, without helping anyone find it.
    """

    name = "isin"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        isin = row.get("isin")
        if is_blank(isin):
            return [Problem("isin", "is required; it is what every other table keys on")]
        candidate = str(isin).strip().upper()
        if len(candidate) != 12:
            return [Problem("isin", f"{candidate!r} is {len(candidate)} characters, expected 12")]
        if not candidate[:2].isalpha():
            return [Problem("isin", f"{candidate!r} does not start with a country code")]
        if not candidate[2:].isalnum():
            return [Problem("isin", f"{candidate!r} has a non-alphanumeric body")]
        if not candidate[-1].isdigit():
            return [Problem("isin", f"{candidate!r} does not end in a check digit")]
        return []


class VehicleConsistencyValidator(RowValidator):
    """A listed fund has a price feed; an unlisted one must not claim one.

    The discriminator is the Yahoo symbol, NOT the presence of a code. That was
    the first draft of this rule and real fact sheets disproved it: FundRock
    prints "JSE Code: BBBCF" on a unit trust, where the code identifies the fund
    for dealing rather than a listing. Rejecting those funds would have thrown
    out a large part of the catalogue for looking wrong.

    What must hold is narrower and still worth enforcing. An ETF needs a
    '.JO' symbol or it cannot be priced at all, and a unit trust must not carry
    one — a symbol found for a unit trust is almost always a different
    instrument, typically an offshore share class quoted in dollars, which is
    the mistake that would put a foreign price on a rand fund.
    """

    name = "vehicle"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        vehicle = (row.get("vehicle") or "").strip().lower()
        if vehicle not in {"unit_trust", "etf"}:
            return [Problem("vehicle", f"{vehicle!r} is not 'unit_trust' or 'etf'")]

        problems: list[Problem] = []
        symbol = row.get("yahoo_symbol")

        if vehicle == "etf":
            if is_blank(row.get("jse_code")):
                problems.append(Problem("jse_code", "an ETF is listed and needs its JSE code"))
            if is_blank(symbol):
                problems.append(
                    Problem("yahoo_symbol", "an ETF needs a '<code>.JO' symbol for its price feed")
                )
            elif not str(symbol).strip().upper().endswith(".JO"):
                problems.append(
                    Problem(
                        "yahoo_symbol",
                        f"{symbol!r} does not end in '.JO'; a JSE listing is priced in "
                        f"rand cents and any other suffix is a different market",
                    )
                )
        elif not is_blank(symbol):
            problems.append(
                Problem(
                    "yahoo_symbol",
                    f"a unit trust has no free price feed, so {symbol!r} would be a "
                    f"different instrument (often an offshore share class in dollars)",
                )
            )
        return problems


class AsisaCategoryValidator(RowValidator):
    """The fund's category must be one the bracket policy has an opinion about."""

    name = "asisa_category"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        name = row.get("asisa_category")
        if is_blank(name):
            return [Problem("asisa_category", "is required; the match is a lookup on it")]
        printed = str(name).strip()
        category = ASISA.by_name(printed)
        if category is None:
            # Named the right class in the wrong words is the common case, and it
            # deserves a message naming the words to use rather than the same
            # "not covered" as a genuinely new category. A near miss is still an
            # error: the column is joined by name, with no foreign key behind it,
            # so a loose name stores cleanly and then matches nobody.
            near = ASISA.resolve(printed)
            if near is not None:
                return [
                    Problem(
                        "asisa_category",
                        f"{printed!r} is the published name of {near.name!r} written "
                        f"differently. Record it verbatim — this column is joined by "
                        f"name, so a near miss stores fine and then matches nobody.",
                    )
                ]
            return [
                Problem(
                    "asisa_category",
                    f"{name!r} is not in the classification we cover. Either it is "
                    f"mistyped, or the catalogue is growing into a new category and "
                    f"asisa.py and the migration seed both need it.",
                )
            ]
        problems: list[Problem] = []
        # The tier columns are denormalised for filtering, so they have to agree
        # with the category they were derived from.
        for field_name, expected in (
            ("asisa_geography", category.tier1),
            ("asisa_asset_class", category.tier2),
        ):
            actual = row.get(field_name)
            if not is_blank(actual) and str(actual).strip() != expected:
                problems.append(
                    Problem(field_name, f"{actual!r} does not match the category's {expected!r}")
                )
        return problems


class FeeRelationValidator(RowValidator):
    """Total investment charge is the expense ratio plus transaction costs.

    Checked as a relation rather than recomputed, because the sheet prints all
    three and the published figures are what we show. A TIC below the TER means
    two numbers were read off the wrong rows — which is easy, since managers
    print them adjacent and per fee class.
    """

    name = "fees"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        ter = as_number(row.get("ter"))
        tc = as_number(row.get("tc"))
        tic = as_number(row.get("tic"))
        problems: list[Problem] = []

        if ter is not None and tic is not None and tic < ter:
            problems.append(
                Problem(
                    "tic",
                    f"total investment charge {tic} is below the expense ratio {ter}; "
                    f"the two figures look swapped",
                )
            )
        if ter is not None and tc is not None and tic is not None:
            drift = abs((ter + tc) - tic)
            if drift > 0.05:
                problems.append(
                    Problem(
                        "tic",
                        f"{ter} + {tc} is {round(ter + tc, 4)}, not {tic} "
                        f"(off by {round(drift, 4)}); confirm against the sheet",
                        WARNING,
                    )
                )
        return problems


class AllocationValidator(RowValidator):
    """If an allocation is recorded, it has to account for the whole fund.

    Optional because an index-tracking ETF sheet often prints no allocation
    breakdown at all — the index is the answer. But a partial one is worse than
    none: a donut summing to 60% reads as a fund holding 40% of nothing.
    """

    name = "allocation"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        allocation = row.get("asset_allocation")
        if allocation in (None, "", {}, []):
            return []
        if not isinstance(allocation, dict):
            return [Problem("asset_allocation", f"expected an object of percentages, got {type(allocation).__name__}")]

        problems: list[Problem] = []
        total = 0.0
        for key, value in allocation.items():
            number = as_number(value)
            if number is None:
                problems.append(Problem("asset_allocation", f"{key!r} is not a number: {value!r}"))
                continue
            if number < 0:
                problems.append(Problem("asset_allocation", f"{key!r} is negative: {number}"))
            total += number

        if problems:
            return problems
        if not (ALLOCATION_MIN_TOTAL <= total <= ALLOCATION_MAX_TOTAL):
            problems.append(
                Problem(
                    "asset_allocation",
                    f"sums to {round(total, 2)}%, outside {ALLOCATION_MIN_TOTAL}-"
                    f"{ALLOCATION_MAX_TOTAL}%; a line item is probably missing",
                )
            )
        return problems


class FreshnessValidator(RowValidator):
    """The sheet's own as-at date must be real, past, and recent enough."""

    name = "freshness"

    def __init__(self, today: date | None = None, max_age_days: int = MAX_FACTSHEET_AGE_DAYS):
        self._today = today
        self.max_age_days = max_age_days

    @property
    def today(self) -> date:
        return self._today or date.today()

    def check(self, row: dict[str, Any]) -> list[Problem]:
        raw = row.get("as_of")
        if is_blank(raw):
            return [Problem("as_of", "is required; every figure shown is dated by it")]

        if isinstance(raw, date):
            as_of = raw
        else:
            try:
                as_of = datetime.strptime(str(raw).strip(), "%Y-%m-%d").date()
            except ValueError:
                return [Problem("as_of", f"{raw!r} is not a YYYY-MM-DD date")]

        if as_of > self.today:
            return [
                Problem("as_of", f"{as_of.isoformat()} is in the future; a sheet cannot be dated ahead")
            ]
        age = (self.today - as_of).days
        if age > self.max_age_days:
            return [
                Problem(
                    "as_of",
                    f"{as_of.isoformat()} is {age} days old. Fact-sheet content is "
                    f"updated at least quarterly, so fetch the current sheet from the "
                    f"manager's own site rather than a platform's copy.",
                    WARNING,
                )
            ]
        return []


class NavValidator(RowValidator):
    """A price must be dated, and its unit has to be watched rather than checked.

    A unit trust is not traded, so the NAV its manager publishes on the sheet is
    the only price it has — eleven of the nineteen seeded funds had no price
    anywhere in the system while their own documents printed one. That makes this
    column load-bearing, and its unit with it: managers print unit trusts in
    cents ("1 234,56 cpu") and ETFs in rand ("NAV Price R9.23").

    **A range cannot catch a unit error here, and the first version of this
    validator pretended otherwise.** It had a floor of one cent with a comment
    claiming that caught an unconverted rand figure; Satrix's R9.23 passed it
    cleanly, because plausible rand prices and plausible cent prices overlap
    across almost their whole range. So the range is an absurdity check only, and
    the sub-rand case gets a warning that names the conversion rather than an
    error that would refuse the several funds legitimately priced there. The
    conversion itself belongs in one named place in the reader, beside the quote
    the reviewer sees.

    A check constraint already requires the date. It cannot say which date is
    implausible, and this can.
    """

    name = "nav"

    def __init__(self, today: date | None = None):
        self._today = today
        self._range = NumericRangeValidator(
            "nav_cpu", MIN_PLAUSIBLE_NAV_CPU, MAX_PLAUSIBLE_NAV_CPU, unit="cents"
        )

    @property
    def today(self) -> date:
        return self._today or date.today()

    def check(self, row: dict[str, Any]) -> list[Problem]:
        nav = row.get("nav_cpu")
        raw_date = row.get("nav_date")

        if is_blank(nav):
            if not is_blank(raw_date):
                return [
                    Problem(
                        "nav_cpu",
                        "a NAV date was recorded with no price; either give the price "
                        "the sheet prints or clear the date",
                    )
                ]
            return []

        problems = list(self._range.check(row))
        if is_blank(raw_date):
            problems.append(
                Problem(
                    "nav_date",
                    "a price means nothing without the day it was struck; use the "
                    "sheet's own as-at date if it prints no other",
                )
            )
            return problems

        value = as_number(nav)
        if value is not None and value < NAV_CPU_SECOND_LOOK:
            problems.append(
                Problem(
                    "nav_cpu",
                    f"{value} cents is under a rand a unit. Real for a few funds, but "
                    f"also what a rand figure looks like stored without converting — if "
                    f"the sheet printed 'R{value}', this should be {round(value * 100, 2)}.",
                    WARNING,
                )
            )

        priced = _as_date(raw_date)
        if priced is None:
            problems.append(Problem("nav_date", f"{raw_date!r} is not a YYYY-MM-DD date"))
        elif priced > self.today:
            problems.append(Problem("nav_date", f"{priced.isoformat()} is in the future"))
        return problems


class FeePeriodValidator(RowValidator):
    """Which period the fees cover, asked for as soon as any fee is recorded.

    Managers print the expense ratio, transaction cost and total investment
    charge in two columns — 1-Year and 3-Year — and the figures differ. Before
    this column existed the catalogue mixed them, so two funds' costs could be
    compared when one number was annual and the other three-year annualised.
    Recording the period is what makes that comparison honest, or makes it
    visibly refusable.

    A warning rather than an error, because the figures themselves are still the
    manager's own and a sheet with an unlabelled single figure should not be
    unrecordable. Wrong vocabulary IS an error: it means a column was guessed at.
    """

    name = "fee_period"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        period = row.get("fee_period")
        has_fees = any(
            not is_blank(row.get(field))
            for field in ("ter", "tc", "tic", "annual_management_fee")
        )

        if is_blank(period):
            if has_fees:
                return [
                    Problem(
                        "fee_period",
                        "fees were recorded without saying which period they cover; one "
                        f"of {', '.join(FEE_PERIODS)}. Where the sheet prints both "
                        "columns, take the 1-Year one.",
                        WARNING,
                    )
                ]
            return []

        if str(period).strip() not in FEE_PERIODS:
            return [
                Problem("fee_period", f"{period!r} is not one of {', '.join(FEE_PERIODS)}")
            ]
        if not has_fees:
            return [
                Problem(
                    "fee_period",
                    "names a fee period but no fee figures were recorded",
                    WARNING,
                )
            ]
        return []


class ManagementFeeValidator(NumericRangeValidator):
    """The manager's own cut, which sits inside the total expense ratio.

    Kept as its own field because a reader comparing two funds' costs is
    comparing different things if one fund's TER is mostly management fee and the
    other's is mostly trading.

    The containment relation is a warning, not an error. The TER is calculated
    including VAT and net of fee waivers, so an unusual sheet can legitimately
    print the two close together or even inverted, and refusing a fact sheet over
    that would be refusing the document.
    """

    def __init__(self):
        super().__init__("annual_management_fee", 0, MAX_PLAUSIBLE_FEE_PERCENT, unit="%")
        self.name = "management_fee"

    def extra_checks(self, row: dict[str, Any], number: float) -> list[Problem]:
        ter = as_number(row.get("ter"))
        if ter is not None and number > ter:
            return [
                Problem(
                    "annual_management_fee",
                    f"{number}% is above the total expense ratio {ter}%, which normally "
                    f"contains it; check the two were not read off different fee columns",
                    WARNING,
                )
            ]
        return []


class RollingReturnValidator(RowValidator):
    """The best and worst twelve months the fund has had, as published.

    The most useful volatility figure this catalogue carries, because a beginner
    cannot act on the word "Moderate" and can act on "its worst year was -8%".

    Each is range-checked, and the pair is checked for order: a highest below a
    lowest means the two rows were read the wrong way round. That is an easy
    mistake to make, because managers print them adjacent and print the negative
    one in brackets rather than with a minus sign.

    And the basis is required with the figures, because managers do not publish
    the same statistic. Satrix prints "Highest/Lowest Annual Rolling Return"
    over ten non-overlapping one-year periods; FundRock prints "Highest and
    Lowest: Calendar year performance since inception". Storing both in one pair
    of columns and showing them side by side would repeat, exactly, the fee-column
    mistake that `fee_period` was added to stop.
    """

    name = "rolling_returns"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        problems: list[Problem] = []
        basis = row.get("return_extremes_basis")
        has_extremes = any(
            not is_blank(row.get(field)) for field in ("return_high_12m", "return_low_12m")
        )
        if not is_blank(basis) and str(basis).strip() not in RETURN_EXTREMES_BASES:
            problems.append(
                Problem(
                    "return_extremes_basis",
                    f"{basis!r} is not one of {', '.join(RETURN_EXTREMES_BASES)}",
                )
            )
        elif has_extremes and is_blank(basis):
            problems.append(
                Problem(
                    "return_extremes_basis",
                    "a best and worst year were recorded without saying how they were "
                    f"measured; one of {', '.join(RETURN_EXTREMES_BASES)}. Read the "
                    "sheet's own heading — 'Annual Rolling Return' is rolling_12m, "
                    "'Calendar year performance' is calendar_year.",
                )
            )
        elif not has_extremes and not is_blank(basis):
            problems.append(
                Problem(
                    "return_extremes_basis",
                    "names a basis but no best or worst year was recorded",
                    WARNING,
                )
            )
        if problems:
            return problems

        for field_name in ("return_high_12m", "return_low_12m"):
            problems.extend(
                NumericRangeValidator(
                    field_name,
                    MIN_PLAUSIBLE_ANNUAL_RETURN,
                    MAX_PLAUSIBLE_ANNUAL_RETURN,
                    unit="%",
                ).check(row)
            )
        if problems:
            return problems

        high = as_number(row.get("return_high_12m"))
        low = as_number(row.get("return_low_12m"))
        if high is not None and low is not None and high < low:
            problems.append(
                Problem(
                    "return_high_12m",
                    f"the highest annual return {high}% is below the lowest {low}%; the "
                    f"two look swapped. Sheets print the negative one in brackets — "
                    f"(4.49) means -4.49.",
                )
            )
        return problems


class InceptionDateValidator(RowValidator):
    """When the fund started, which is also why a five-year return can be blank."""

    name = "inception"

    def __init__(self, today: date | None = None):
        self._today = today

    @property
    def today(self) -> date:
        return self._today or date.today()

    def check(self, row: dict[str, Any]) -> list[Problem]:
        raw = row.get("inception_date")
        if is_blank(raw):
            return []
        started = _as_date(raw)
        if started is None:
            return [Problem("inception_date", f"{raw!r} is not a YYYY-MM-DD date")]
        if started > self.today:
            return [Problem("inception_date", f"{started.isoformat()} is in the future")]
        if started < EARLIEST_PLAUSIBLE_INCEPTION:
            return [
                Problem(
                    "inception_date",
                    f"{started.isoformat()} is before collective investment schemes "
                    f"existed here; check the year",
                )
            ]
        as_of = _as_date(row.get("as_of"))
        if as_of is not None and started > as_of:
            return [
                Problem(
                    "inception_date",
                    f"{started.isoformat()} is after the sheet's own date "
                    f"{as_of.isoformat()}; a fund cannot report before it launched",
                )
            ]
        return []


class IncomeDistributionValidator(RowValidator):
    """The cents-per-unit history, as the sheet's distribution table prints it.

    A mapping of period to cents per unit. Zero is a real published value — a
    fund can declare nothing for a month, and the Satrix ILBI sheet prints
    exactly that for February — so only a negative distribution is wrong, and
    that would mean a figure was read out of an adjacent returns column.
    """

    name = "income_distribution"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        history = row.get("income_distribution")
        if history in (None, "", {}, []):
            return []
        if not isinstance(history, dict):
            return [
                Problem(
                    "income_distribution",
                    f"expected an object of period to cents per unit, got "
                    f"{type(history).__name__}",
                )
            ]
        problems: list[Problem] = []
        for period, value in history.items():
            number = as_number(value)
            if number is None:
                problems.append(
                    Problem("income_distribution", f"{period!r} is not a number: {value!r}")
                )
            elif number < 0:
                problems.append(
                    Problem(
                        "income_distribution",
                        f"{period!r} is {number} cents; a distribution is never negative, "
                        f"so this was probably read off a returns column",
                    )
                )
        return problems


def _as_date(value: Any) -> date | None:
    """A date column out of a CSV cell, a JSON string or a database value."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if is_blank(value):
        return None
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


class ValidatorChain:
    """Runs a set of validators over a row and collects everything they find.

    A chain rather than a function so the seed loader and the admin interface use
    the same object, and so a new check is a new class in a list instead of
    another branch inside a growing function.
    """

    def __init__(self, validators: Sequence[RowValidator], label: str = "row"):
        self.validators = tuple(validators)
        self.label = label

    def check(self, row: dict[str, Any]) -> list[Problem]:
        problems: list[Problem] = []
        for validator in self.validators:
            problems.extend(validator.check(row))
        return problems

    def errors(self, row: dict[str, Any]) -> list[Problem]:
        return [problem for problem in self.check(row) if problem.blocking]

    def is_valid(self, row: dict[str, Any]) -> bool:
        return not self.errors(row)

    def check_all(self, rows: Iterable[dict[str, Any]]) -> list[tuple[int, Problem]]:
        """Findings across many rows, each paired with its 1-based row number."""
        found: list[tuple[int, Problem]] = []
        for index, row in enumerate(rows, start=1):
            for problem in self.check(row):
                found.append((index, problem))
        return found


def fund_validators() -> ValidatorChain:
    """Checks for a row of the funds table."""
    return ValidatorChain(
        (
            IsinValidator(),
            VehicleConsistencyValidator(),
            AsisaCategoryValidator(),
        ),
        label="fund",
    )


def snapshot_validators(today: date | None = None) -> ValidatorChain:
    """Checks for a row of the fact-sheet snapshots table."""
    return ValidatorChain(
        (
            FreshnessValidator(today=today),
            RiskLabelValidator(),
            NumericRangeValidator("recommended_min_term_years", 0, MAX_PLAUSIBLE_TERM_YEARS, unit="years"),
            NumericRangeValidator("ter", 0, MAX_PLAUSIBLE_FEE_PERCENT, unit="%"),
            NumericRangeValidator("tc", 0, MAX_PLAUSIBLE_FEE_PERCENT, unit="%"),
            NumericRangeValidator("tic", 0, MAX_PLAUSIBLE_FEE_PERCENT, unit="%"),
            FeeRelationValidator(),
            AllocationValidator(),
            # The common core added in migration 025.
            NavValidator(today=today),
            FeePeriodValidator(),
            ManagementFeeValidator(),
            RollingReturnValidator(),
            InceptionDateValidator(today=today),
            IncomeDistributionValidator(),
        ),
        label="snapshot",
    )
