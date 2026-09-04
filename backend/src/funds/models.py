"""Value objects for the funds catalogue.

Frozen dataclasses, following ``ranking.py``: a match is a decision about a
person's money, and a mutable result that some later stage could quietly adjust
is not something you want to explain to an examiner. Every stage returns a new
object.

The one piece of real logic here is horizon. The onboarding answer is a band
("two to five years"), but a band is only true on the day it is answered — a
five-year horizon becomes a two-year horizon after three years, and nobody goes
back to update it. So a *target year* is stored and the band is DERIVED from what
is left of it. That is the difference between personalisation that ages and
personalisation that quietly goes stale while still claiming to be based on your
answers.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

Purpose = Literal["emergency_fund", "goal", "growth", "income"]
AccountType = Literal["tfsa", "discretionary", "unsure"]
Contribution = Literal["lump_sum", "monthly", "both"]
HorizonBand = Literal["under_2", "2_to_5", "5_plus"]

PURPOSES: frozenset[str] = frozenset({"emergency_fund", "goal", "growth", "income"})
ACCOUNT_TYPES: frozenset[str] = frozenset({"tfsa", "discretionary", "unsure"})
CONTRIBUTIONS: frozenset[str] = frozenset({"lump_sum", "monthly", "both"})
HORIZON_BANDS: frozenset[str] = frozenset({"under_2", "2_to_5", "5_plus"})

# Where a horizon answer is written inside user_analysis.survey_answers. Nested
# under one key, and never with a `q_` or `demo_` prefix, because the frontend
# risk scorer sums every answer whose id starts with `q_`: a goal question named
# that way would silently become part of the risk score.
GOALS_KEY = "goals"


def _clean(value: Any, allowed: frozenset[str]) -> str | None:
    """Keep a stored answer only if it is one of the values we defined.

    A value outside the set means either an old shape or a hand-edit. Dropping
    it degrades that one axis to "not answered" rather than failing the match, so
    a user with three good answers still gets three axes of filtering.
    """
    if not isinstance(value, str):
        return None
    candidate = value.strip().lower()
    return candidate if candidate in allowed else None


@dataclass(frozen=True)
class Goals:
    """What the user said the money is for, and by when.

    Every field is optional on purpose: these questions arrived after the first
    users onboarded, so a profile with none of them is normal and has to work.
    """

    horizon_target_year: int | None = None
    horizon_band_answered: str | None = None
    purpose: str | None = None
    account_type: str | None = None
    contribution_style: str | None = None
    answered_at: str | None = None

    @classmethod
    def from_survey_answers(cls, survey_answers: Any) -> "Goals | None":
        """Read the goals object out of a stored ``survey_answers`` value.

        Tolerant of a JSON string as well as a dict, because that column is
        already read both ways elsewhere in the codebase. Returns None when
        there is nothing to read, which is what puts a match into
        risk-tolerance-only mode.
        """
        if isinstance(survey_answers, str):
            try:
                survey_answers = json.loads(survey_answers)
            except (ValueError, TypeError):
                return None
        if not isinstance(survey_answers, dict):
            return None

        raw = survey_answers.get(GOALS_KEY)
        if not isinstance(raw, dict):
            return None

        year = raw.get("horizon_target_year")
        if isinstance(year, bool) or not isinstance(year, (int, float)):
            year = None
        else:
            year = int(year)

        goals = cls(
            horizon_target_year=year,
            horizon_band_answered=_clean(raw.get("horizon_band"), HORIZON_BANDS),
            purpose=_clean(raw.get("purpose"), PURPOSES),
            account_type=_clean(raw.get("account_type"), ACCOUNT_TYPES),
            contribution_style=_clean(raw.get("contribution_style"), CONTRIBUTIONS),
            answered_at=raw.get("answered_at") if isinstance(raw.get("answered_at"), str) else None,
        )
        # An object with every field empty is indistinguishable from no object,
        # and saying "risk profile only" is more honest than showing a horizon
        # rule that had nothing to work with.
        return goals if goals.has_any() else None

    def has_any(self) -> bool:
        return any(
            value is not None
            for value in (
                self.horizon_target_year,
                self.purpose,
                self.account_type,
                self.contribution_style,
            )
        )

    def horizon_years(self, today: date) -> int | None:
        """Years left of the stated horizon, never negative.

        A target year already past means the horizon has run out, which is a
        real answer (nothing long-dated) rather than a missing one.
        """
        if self.horizon_target_year is None:
            return None
        return max(0, self.horizon_target_year - today.year)

    def horizon_band(self, today: date) -> str | None:
        """The band the REMAINING horizon falls into, not the one answered."""
        years = self.horizon_years(today)
        if years is None:
            return None
        if years < 2:
            return "under_2"
        if years < 5:
            return "2_to_5"
        return "5_plus"


@dataclass(frozen=True)
class Profile:
    """The inputs a match is allowed to use.

    Nothing else from the user's record belongs here. Age is captured at
    onboarding and deliberately absent: mapping an age to an asset allocation is
    the advice this product does not give, and horizon asks the same question
    directly.
    """

    user_id: str
    risk_tolerance: str
    goals: Goals | None = None

    @property
    def fallback_risk_only(self) -> bool:
        """True when only the risk profile is available to filter on.

        Surfaced to the user rather than hidden, because a shorter list of
        reasons is worth saying out loud: it is also the prompt to answer the
        remaining questions.
        """
        return self.goals is None


@dataclass(frozen=True)
class FundCandidate:
    """A fund and its newest approved fact sheet.

    ``snapshot`` is None for a fund we hold but have no approved sheet for. Such
    a fund can never match — there is no published risk label to compare — but it
    still appears in the browse view, with that stated.
    """

    fund: dict[str, Any]
    snapshot: dict[str, Any] | None = None

    @property
    def fund_id(self) -> str | None:
        return self.fund.get("id")

    @property
    def category(self) -> str | None:
        return self.fund.get("asisa_category")

    @property
    def is_index_tracker(self) -> bool:
        return bool(self.fund.get("is_index_tracker"))

    @property
    def risk_level(self) -> int | None:
        if not self.snapshot:
            return None
        level = self.snapshot.get("risk_indicator_1to5")
        return int(level) if isinstance(level, (int, float)) and not isinstance(level, bool) else None


@dataclass(frozen=True)
class FundFilters:
    """Browse filters. Every field None means "the whole catalogue"."""

    vehicle: str | None = None
    geography: str | None = None
    asset_class: str | None = None
    category: str | None = None
    tfsa: bool | None = None
    manco: str | None = None
    query: str | None = None


@dataclass(frozen=True)
class Bracket:
    """The categories a profile resolves to, and how it got there.

    Returned even when nothing matches, because "your profile covers these
    categories and our catalogue has nothing in them yet" is a different
    statement from "no matches", and only the first one is honest about whose
    limitation it is.
    """

    risk_tolerance: str
    effective: str
    ceiling: int
    categories: tuple[str, ...]
    tracker_only: tuple[str, ...] = ()
    horizon_years: int | None = None
    horizon_band: str | None = None
    purpose: str | None = None


@dataclass(frozen=True)
class MatchResult:
    """One matched fund, with everything needed to say why it appears."""

    fund_id: str
    isin: str
    name: str
    vehicle: str
    fund_house: str
    manco: str
    asisa_category: str
    as_of: str
    risk_indicator_1to5: int
    risk_indicator_raw: str | None = None
    recommended_min_term_years: float | None = None
    ter: float | None = None
    tic: float | None = None
    tfsa_eligible: bool = False
    is_index_tracker: bool = False
    rules_applied: tuple[str, ...] = ()
    reason: str = ""


@dataclass(frozen=True)
class MatchOutcome:
    """The whole answer to "what does this user's profile map to".

    ``profile_found`` is separate from an empty ``matches`` because an admin who
    never onboarded has no profile at all, and telling them to complete one is
    useful where "no matches" would just look broken.
    """

    bracket: Bracket | None = None
    matches: tuple[MatchResult, ...] = ()
    rules_applied: tuple[str, ...] = ()
    fallback_risk_only: bool = False
    profile_found: bool = False
    notes: tuple[str, ...] = field(default_factory=tuple)
