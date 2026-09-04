"""Matching a user's profile to funds, as a chain of published-label filters.

The shape of this module is the argument for the feature. Every rule reads one
attribute a fund manager already publishes and compares it to one answer the
user already gave. Nothing scores a fund, nothing ranks one above another, and
nothing computes an allocation — so what comes out is "these funds' own
documents say they fit what you told us", which is information, not advice.

The chain is ordered and each rule appends its name, so a match arrives knowing
which rules produced it. That is what the interface renders as "why you are
seeing this", and it is also what makes the whole thing debuggable: an empty
result names the rule that emptied it.

Precedence is "most conservative signal wins", and it is not a special case
buried in a condition — it is ``min()`` over ``BRACKET_ORDER``. A user who says
they are aggressive but needs the money for an emergency fund is shown money
market funds, because one of those answers is about appetite and the other is
about when they need it back.

Adding a rule is a new subclass in the default chain. Nothing in ``FundMatcher``
changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, replace
from datetime import date
from typing import Callable, Sequence

from .asisa import (
    BRACKET_CATEGORIES,
    BRACKET_ORDER,
    HORIZON_CAP,
    INCOME_DISTRIBUTING,
    LIQUIDITY,
    TRACKER_ONLY,
)
from .config import PLATFORM_MIN_DEBIT_ORDER
from .models import Bracket, FundCandidate, MatchOutcome, MatchResult, Profile
from .risk_scale import ceiling_for, label_for, within_ceiling
from .validators import as_number

# Rule names, also the keys into copy.RULE_NOTES. Constants rather than literals
# so a rename cannot leave the explanation naming a rule that no longer runs.
RULE_RISK_CEILING = "risk_ceiling"
RULE_CATEGORY = "category"
RULE_HORIZON = "horizon"
RULE_PURPOSE = "purpose"
RULE_ELIGIBILITY = "eligibility"
RULE_SKIPPED_NO_GOALS = "skipped_no_goals"

ORDER_BY_NAME = "name"
ORDER_BY_COST = "tic"


@dataclass(frozen=True)
class MatchState:
    """What the chain has decided so far. Immutable; each rule returns a new one."""

    profile: Profile
    today: date
    effective: str
    ceiling: int
    categories: frozenset[str]
    tracker_only: frozenset[str]
    candidates: tuple[FundCandidate, ...]
    rules_applied: tuple[str, ...] = ()

    def with_rule(self, name: str, **changes) -> "MatchState":
        applied = self.rules_applied + (name,) if name not in self.rules_applied else self.rules_applied
        return replace(self, rules_applied=applied, **changes)

    def most_conservative(self, other: str) -> str:
        """The more cautious of the current bracket and another one."""
        return min(
            (self.effective, other),
            key=lambda bracket: BRACKET_ORDER.index(bracket),
        )


class MatchRule(ABC):
    """One filter over the candidate set, or over the categories in play.

    Rules are pure: state in, state out. That is what lets the five worked
    examples in the tests be read as specifications rather than as traces.
    """

    name: str = "rule"

    @abstractmethod
    def apply(self, state: MatchState) -> MatchState:
        ...


class ThresholdRule(MatchRule):
    """Compares one number on a fund's fact sheet to a limit from the profile.

    The shared shape of the two rules that drop individual funds. A fund keeps
    its place only if ``permits`` says so, and a rule that has no limit to apply
    (no horizon on file, say) says so once rather than filtering on nothing.
    """

    def applies(self, state: MatchState) -> bool:
        return True

    def permits(self, candidate: FundCandidate, state: MatchState) -> bool:
        raise NotImplementedError

    def apply(self, state: MatchState) -> MatchState:
        if not self.applies(state):
            return state
        kept = tuple(c for c in state.candidates if self.permits(c, state))
        return self.after(state.with_rule(self.name, candidates=kept))

    def after(self, state: MatchState) -> MatchState:
        """Hook for a rule that also adjusts the bracket, not just the funds."""
        return state


class RiskCeilingRule(ThresholdRule):
    """A fund's own published risk label must sit at or below the user's ceiling.

    The rule the whole feature rests on: both sides are published, so nothing
    here is our judgement. A fund whose manager publishes no indicator never
    clears — see ``risk_scale.within_ceiling`` — which is why the browse view
    exists and says so for those funds.
    """

    name = RULE_RISK_CEILING

    def permits(self, candidate: FundCandidate, state: MatchState) -> bool:
        return within_ceiling(candidate.risk_level, state.profile.risk_tolerance)


class HorizonRule(ThresholdRule):
    """The fact sheet's minimum investment term must fit inside the user's horizon.

    Two effects. It drops funds asking for longer than the user has, and it caps
    the bracket: someone who needs the money in eighteen months is not shown a
    five-year proposition however much risk they say they can take. It never
    raises a bracket — see the ordering test.

    A fund whose sheet states no minimum term is kept: silence is not a claim,
    and dropping it would penalise the manager for publishing less.
    """

    name = RULE_HORIZON

    def applies(self, state: MatchState) -> bool:
        return state.profile.goals is not None and state.profile.goals.horizon_years(state.today) is not None

    def permits(self, candidate: FundCandidate, state: MatchState) -> bool:
        if not candidate.snapshot:
            return False
        years_left = state.profile.goals.horizon_years(state.today)
        stated = as_number(candidate.snapshot.get("recommended_min_term_years"))
        if stated is None:
            return True
        return stated <= years_left

    def after(self, state: MatchState) -> MatchState:
        band = state.profile.goals.horizon_band(state.today)
        capped = state.most_conservative(HORIZON_CAP.get(band, state.effective))
        if capped == state.effective:
            return state
        return replace(
            state,
            effective=capped,
            categories=BRACKET_CATEGORIES[capped],
            tracker_only=TRACKER_ONLY[capped],
        )


class CategorySetRule(MatchRule):
    """Rewrites which published categories are in play.

    Separate from the threshold rules because it changes the question rather
    than filtering the answers: the candidate set is untouched, and the final
    selection applies whatever set is left.
    """

    def categories_for(self, state: MatchState) -> frozenset[str] | None:
        raise NotImplementedError

    def apply(self, state: MatchState) -> MatchState:
        categories = self.categories_for(state)
        if categories is None:
            return state
        return state.with_rule(self.name, categories=categories)


class CategoryRule(CategorySetRule):
    """The bracket table: which categories this risk profile covers."""

    name = RULE_CATEGORY

    def categories_for(self, state: MatchState) -> frozenset[str]:
        return BRACKET_CATEGORIES[state.effective]


class PurposeRule(CategorySetRule):
    """What the money is for can override the category set entirely.

    Money that has to be available at short notice is a liquidity question
    before it is a risk question. That is the panel's own worked example — a
    conservative saver wanting surety and access wants a money market fund — and
    it is the case the equity side of the product cannot serve at all.

    Growth and a general goal deliberately do nothing here: the ceiling is
    already what bounds them, and inventing a second opinion on top would be a
    judgement with no published label behind it.
    """

    name = RULE_PURPOSE

    def categories_for(self, state: MatchState) -> frozenset[str] | None:
        goals = state.profile.goals
        if goals is None or goals.purpose is None:
            return None
        if goals.purpose == "emergency_fund":
            return LIQUIDITY
        if goals.purpose == "income":
            return state.categories & INCOME_DISTRIBUTING or INCOME_DISTRIBUTING
        return None

    def apply(self, state: MatchState) -> MatchState:
        state = super().apply(state)
        goals = state.profile.goals
        if goals is not None and goals.purpose == "emergency_fund":
            # An emergency fund also caps the bracket, so the ceiling drops with
            # the categories rather than leaving an aggressive ceiling applied
            # to cash funds.
            capped = state.most_conservative("Conservative")
            state = replace(state, effective=capped, ceiling=ceiling_for(capped))
        return state


class EligibilityFilters(MatchRule):
    """Practical availability: the account type, and the monthly minimum.

    Not risk, not category — just whether a user can actually put money into
    this fund the way they said they would. A tax-free account is the one that
    bites; the debit-order minimum is a hook, because the platform this
    catalogue is bounded to has none.
    """

    name = RULE_ELIGIBILITY

    def apply(self, state: MatchState) -> MatchState:
        goals = state.profile.goals
        if goals is None:
            return state

        kept = state.candidates
        touched = False

        if goals.account_type == "tfsa":
            kept = tuple(c for c in kept if c.fund.get("tfsa_eligible"))
            touched = True

        if goals.contribution_style == "monthly" and PLATFORM_MIN_DEBIT_ORDER is not None:
            limit = PLATFORM_MIN_DEBIT_ORDER
            kept = tuple(c for c in kept if _minimum_within(c, limit))
            touched = True

        if not touched:
            return state
        return state.with_rule(self.name, candidates=kept)


def _minimum_within(candidate: FundCandidate, limit: float) -> bool:
    if not candidate.snapshot:
        return False
    minimum = as_number(candidate.snapshot.get("min_debit_order"))
    return minimum is None or minimum <= limit


DEFAULT_RULES: tuple[MatchRule, ...] = (
    RiskCeilingRule(),
    CategoryRule(),
    HorizonRule(),
    PurposeRule(),
    EligibilityFilters(),
)


class FundMatcher:
    """Runs the rule chain and turns what survives into results.

    ``today`` is injected because the horizon rule reads the current year, and a
    rule that depends on the clock is untestable without one.
    """

    def __init__(
        self,
        rules: Sequence[MatchRule] | None = None,
        clock: Callable[[], date] = date.today,
    ):
        self.rules = tuple(rules) if rules is not None else DEFAULT_RULES
        self.clock = clock

    def match(
        self,
        profile: Profile,
        candidates: Sequence[FundCandidate],
        order_by: str = ORDER_BY_NAME,
    ) -> MatchOutcome:
        today = self.clock()
        state = MatchState(
            profile=profile,
            today=today,
            effective=_starting_bracket(profile),
            ceiling=ceiling_for(profile.risk_tolerance),
            categories=BRACKET_CATEGORIES[_starting_bracket(profile)],
            tracker_only=TRACKER_ONLY[_starting_bracket(profile)],
            candidates=tuple(candidates),
        )

        for rule in self.rules:
            state = rule.apply(state)

        selected = [c for c in state.candidates if self._in_play(c, state)]
        results = tuple(
            _to_result(candidate, state) for candidate in _ordered(selected, order_by)
        )

        rules_applied = state.rules_applied
        if profile.fallback_risk_only:
            rules_applied = rules_applied + (RULE_SKIPPED_NO_GOALS,)

        return MatchOutcome(
            bracket=self.bracket(state),
            matches=results,
            rules_applied=rules_applied,
            fallback_risk_only=profile.fallback_risk_only,
            profile_found=True,
        )

    def bracket(self, state: MatchState) -> Bracket:
        goals = state.profile.goals
        return Bracket(
            risk_tolerance=state.profile.risk_tolerance,
            effective=state.effective,
            ceiling=state.ceiling,
            categories=tuple(sorted(state.categories)),
            tracker_only=tuple(sorted(state.tracker_only)),
            horizon_years=goals.horizon_years(state.today) if goals else None,
            horizon_band=goals.horizon_band(state.today) if goals else None,
            purpose=goals.purpose if goals else None,
        )

    @staticmethod
    def _in_play(candidate: FundCandidate, state: MatchState) -> bool:
        """Final selection: the fund's category is in play, tracker rule included."""
        code = _category_code(candidate)
        if code is None or code not in state.categories:
            return False
        if code in state.tracker_only and not candidate.is_index_tracker:
            return False
        return True


def _starting_bracket(profile: Profile) -> str:
    return profile.risk_tolerance if profile.risk_tolerance in BRACKET_CATEGORIES else "Moderate"


def _category_code(candidate: FundCandidate) -> str | None:
    from .asisa import ASISA

    name = candidate.category
    return ASISA.code_for(name) if name else None


def _ordered(candidates: list[FundCandidate], order_by: str) -> list[FundCandidate]:
    """Alphabetical, or by total cost. Never by past performance.

    Cost ordering puts funds with no published charge last rather than first:
    absent is not cheap.
    """
    if order_by == ORDER_BY_COST:
        def cost_key(candidate: FundCandidate):
            charge = as_number((candidate.snapshot or {}).get("tic"))
            return (charge is None, charge if charge is not None else 0.0, candidate.fund.get("name") or "")

        return sorted(candidates, key=cost_key)
    return sorted(candidates, key=lambda c: (c.fund.get("name") or "").casefold())


def _to_result(candidate: FundCandidate, state: MatchState) -> MatchResult:
    fund = candidate.fund
    snap = candidate.snapshot or {}
    level = candidate.risk_level
    return MatchResult(
        fund_id=fund.get("id") or "",
        isin=fund.get("isin") or "",
        name=fund.get("name") or "",
        vehicle=fund.get("vehicle") or "",
        fund_house=fund.get("fund_house") or "",
        manco=fund.get("manco") or "",
        asisa_category=fund.get("asisa_category") or "",
        as_of=str(snap.get("as_of") or ""),
        risk_indicator_1to5=level if level is not None else 0,
        risk_indicator_raw=snap.get("risk_indicator_raw") or label_for(level),
        recommended_min_term_years=as_number(snap.get("recommended_min_term_years")),
        ter=as_number(snap.get("ter")),
        tic=as_number(snap.get("tic")),
        tfsa_eligible=bool(fund.get("tfsa_eligible")),
        is_index_tracker=bool(fund.get("is_index_tracker")),
        rules_applied=state.rules_applied,
    )
