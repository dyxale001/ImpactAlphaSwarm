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
    """A listed fund has listing details; an unlisted one must not.

    This is the rule that keeps the two vehicles honest. A unit trust with a JSE
    code would suggest a price feed that does not exist, and an ETF without one
    has no way to be priced at all — and both mistakes are easy to make when
    transcribing a fund house that runs both versions of the same index.
    """

    name = "vehicle"

    def check(self, row: dict[str, Any]) -> list[Problem]:
        vehicle = (row.get("vehicle") or "").strip().lower()
        if vehicle not in {"unit_trust", "etf"}:
            return [Problem("vehicle", f"{vehicle!r} is not 'unit_trust' or 'etf'")]

        problems: list[Problem] = []
        jse_code = row.get("jse_code")
        symbol = row.get("yahoo_symbol")

        if vehicle == "etf":
            if is_blank(jse_code):
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
        else:
            if not is_blank(jse_code):
                problems.append(
                    Problem("jse_code", f"a unit trust is not listed, so {jse_code!r} cannot be right")
                )
            if not is_blank(symbol):
                problems.append(
                    Problem(
                        "yahoo_symbol",
                        f"a unit trust has no free price feed, so {symbol!r} would be a "
                        f"different instrument (often an offshore share class)",
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
        category = ASISA.by_name(str(name).strip())
        if category is None:
            return [
                Problem(
                    "asisa_category",
                    f"{name!r} is not in the classification we cover. Either it is "
                    f"mistyped, or the catalogue is growing into a new category and "
                    f"asisa.py and migration 024 both need it.",
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
        ),
        label="snapshot",
    )
