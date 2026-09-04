"""Assembling "Why this appears" from a fact sheet, with no model involved.

Version one writes this prose from the snapshot's own fields through fixed
templates. That is not a placeholder for a model — it is the safer product. The
precedent is in this codebase: a model given a ticker and a name invented
plausible businesses, which is why company descriptions came off the LLM
entirely. A fund page is a worse place to invent than a company page, because
every figure on it is a number someone may act on.

So the guard is the interesting part, and it runs in production, not only in
tests. Two checks before any paragraph is returned:

*Forbidden terms* — the copy vocabulary, so a template edited later cannot
quietly turn a filter into a proposal.

*Number grounding* — every number in the output must appear in the snapshot it
was built from. A templated renderer cannot really hallucinate a figure, so
today this is close to a tautology. That is deliberate: when
``FUND_TRACES_ENABLED`` eventually points a model at the same context, the guard
it has to pass is already written, already tested, and already proven not to
reject honest output.

A failure is logged and the paragraph is replaced, never served. A missing
explanation is a small loss; a wrong number is the whole credibility of the page.
"""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Sequence

from . import copy as copytext
from .models import MatchResult, Profile
from .risk_scale import label_for
from .validators import as_number

logger = logging.getLogger(__name__)

# Any run of digits with optional decimals and separators. Deliberately loose:
# the guard's job is to notice a number that is not in the source, so it should
# find every candidate rather than only well-formed percentages.
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")

# Numbers a sentence can contain without them being claims about the fund: a
# year in a date, and small counts in ordinary prose.
_ALWAYS_ALLOWED = frozenset({"1", "2", "3", "4", "5"})


class CopyViolation(ValueError):
    """Generated prose failed a guard. Never shown to a user."""


@dataclass(frozen=True)
class ExplanationContext:
    """Everything a section is allowed to read.

    A dataclass rather than loose arguments so a new section cannot quietly
    start reading something that was never checked by the guard.
    """

    fund: dict[str, Any]
    snapshot: dict[str, Any]
    match: MatchResult | None = None
    profile: Profile | None = None
    today: date = date.today()

    def field(self, name: str) -> Any:
        return self.snapshot.get(name)

    def number(self, name: str) -> float | None:
        return as_number(self.snapshot.get(name))

    @property
    def as_of_display(self) -> str:
        """The sheet's date as it reads in a sentence, e.g. "31 July 2026"."""
        raw = self.snapshot.get("as_of")
        if isinstance(raw, date):
            return _spell_date(raw)
        text = str(raw or "").strip()
        try:
            parsed = datetime.strptime(text, "%Y-%m-%d").date()
        except ValueError:
            # Anything unparseable is shown exactly as stored rather than
            # guessed at: a wrong date on a figure is worse than an ugly one.
            return text
        return _spell_date(parsed)


class ExplanationSection(ABC):
    """One sentence of the explanation, rendered from its own fields.

    Returns None when its inputs are absent, which is what lets a thin fact
    sheet produce a shorter paragraph instead of one padded with blanks. Fund
    houses publish different amounts, and a sentence reading "What it holds:
    None" would be worse than silence.
    """

    name: str = "section"

    @abstractmethod
    def render(self, ctx: ExplanationContext) -> str | None:
        ...


class WhatItIsSection(ExplanationSection):
    """The fund's stated objective, quoted rather than paraphrased."""

    name = "what"

    def render(self, ctx: ExplanationContext) -> str | None:
        objective = ctx.field("objective")
        if not objective or not str(objective).strip():
            return None
        text = " ".join(str(objective).split())
        if not text.endswith("."):
            text += "."
        return copytext.WHY_WHAT.format(objective=text)


class HoldingsSection(ExplanationSection):
    """What the fund holds, largest slice first.

    Skipped entirely for a sheet with no allocation breakdown, which is common
    for an index tracker: the index is the answer, and inventing a split from
    the category would be a guess about someone's money.
    """

    name = "holds"

    def render(self, ctx: ExplanationContext) -> str | None:
        allocation = ctx.field("asset_allocation")
        if not isinstance(allocation, dict) or not allocation:
            return None
        parts: list[tuple[float, str]] = []
        for key, value in allocation.items():
            share = as_number(value)
            if share is None or share <= 0:
                continue
            label = str(key).replace("_", " ").strip()
            parts.append((share, f"{_trim(share)}% {label}"))
        if not parts:
            return None
        parts.sort(key=lambda pair: (-pair[0], pair[1]))
        return copytext.WHY_HOLDS.format(
            as_of=ctx.as_of_display,
            allocation=_join(part for _share, part in parts),
        )


class CostsSection(ExplanationSection):
    """What the fund charges, in the terms its own sheet uses.

    The most comparable disclosed number across every fund, and the one a
    beginner cannot read. Both figures when both are published, the expense
    ratio alone when it is all there is.
    """

    name = "costs"

    def render(self, ctx: ExplanationContext) -> str | None:
        ter = ctx.number("ter")
        tic = ctx.number("tic")
        if ter is not None and tic is not None:
            return copytext.WHY_COSTS.format(tic=_trim(tic), ter=_trim(ter))
        if ter is not None:
            return copytext.WHY_COSTS_TER_ONLY.format(ter=_trim(ter))
        return None


class PerformanceSection(ExplanationSection):
    """How the fund has done, as the sheet reports it, with its date attached.

    Always dated, and only ever the manager's own figures. Computing a return
    from a price feed is what a platform does; doing it here would put a number
    on the page that no published document backs.
    """

    name = "performance"

    def render(self, ctx: ExplanationContext) -> str | None:
        performance = ctx.field("performance")
        benchmark = ctx.field("benchmark")
        if not isinstance(performance, dict) or not performance:
            return None
        stated = _describe_performance(performance)
        if not stated:
            return None
        if not benchmark or not str(benchmark).strip():
            return None
        return copytext.WHY_PERFORMANCE.format(
            performance=stated,
            benchmark=" ".join(str(benchmark).split()),
            as_of=ctx.as_of_display,
        )


class DistributionSection(ExplanationSection):
    """When the fund pays out, for someone who said they want an income."""

    name = "distribution"

    def render(self, ctx: ExplanationContext) -> str | None:
        frequency = ctx.field("distribution_frequency")
        if not frequency or not str(frequency).strip():
            return None
        purpose = ctx.profile.goals.purpose if (ctx.profile and ctx.profile.goals) else None
        if purpose != "income":
            return None
        return copytext.WHY_DISTRIBUTION.format(frequency=str(frequency).strip().lower())


class RuleSection(ExplanationSection):
    """Which filters put this fund in front of this user.

    The sentence that makes the personalisation inspectable: the rules that ran,
    named in the user's own terms rather than by their internal names.
    """

    name = "rule"

    def render(self, ctx: ExplanationContext) -> str | None:
        if ctx.match is None or not ctx.match.rules_applied:
            return None
        notes = [
            copytext.RULE_NOTES[rule]
            for rule in ctx.match.rules_applied
            if rule in copytext.RULE_NOTES
        ]
        if not notes:
            return None
        return copytext.WHY_RULE.format(rules=_join(notes))


DEFAULT_SECTIONS: tuple[ExplanationSection, ...] = (
    WhatItIsSection(),
    HoldingsSection(),
    CostsSection(),
    PerformanceSection(),
    DistributionSection(),
    RuleSection(),
)


class CopyGuard:
    """Refuses prose that breaks the copy line or invents a number."""

    def __init__(self, extra_allowed: Sequence[str] = ()):
        self.extra_allowed = frozenset(extra_allowed)

    def vocabulary(self, ctx: ExplanationContext) -> set[str]:
        """Every number the source material can justify.

        Built from the snapshot rather than from the rendered text, so a figure
        that appears in the output and nowhere in the document is caught.
        """
        allowed: set[str] = set(_ALWAYS_ALLOWED) | set(self.extra_allowed)

        def add(value: Any) -> None:
            for token in _NUMBER.findall(str(value)):
                allowed.add(_canonical(token))

        for value in ctx.snapshot.values():
            if isinstance(value, dict):
                for inner_key, inner in value.items():
                    add(inner_key)
                    add(inner)
                    number = as_number(inner)
                    if number is not None:
                        allowed.add(_canonical(_trim(number)))
            elif isinstance(value, (list, tuple)):
                for inner in value:
                    add(inner)
            elif value is not None:
                add(value)
                number = as_number(value)
                if number is not None:
                    allowed.add(_canonical(_trim(number)))

        if ctx.profile and ctx.profile.goals:
            for value in (
                ctx.profile.goals.horizon_target_year,
                ctx.profile.goals.horizon_years(ctx.today),
            ):
                if value is not None:
                    add(value)
        return allowed

    def check(self, text: str, ctx: ExplanationContext) -> None:
        """Raise ``CopyViolation`` if the text may not be shown."""
        forbidden = copytext.find_forbidden_terms(text)
        if forbidden:
            raise CopyViolation(f"forbidden terms in generated copy: {forbidden}")

        allowed = self.vocabulary(ctx)
        ungrounded = sorted(
            {
                _canonical(token)
                for token in _NUMBER.findall(text)
                if _canonical(token) not in allowed
            }
        )
        if ungrounded:
            raise CopyViolation(f"numbers not present in the fact sheet: {ungrounded}")


class ExplanationBuilder:
    """Composes the sections into one paragraph, guarded.

    Sections and guard are injected so a caller can compose a different
    explanation — a fund page shows all of it, a match card may show less —
    without a second renderer growing beside this one.
    """

    def __init__(
        self,
        sections: Sequence[ExplanationSection] | None = None,
        guard: CopyGuard | None = None,
    ):
        self.sections = tuple(sections) if sections is not None else DEFAULT_SECTIONS
        self.guard = guard if guard is not None else CopyGuard()

    def build(self, ctx: ExplanationContext) -> str:
        """The explanation, or the unavailable notice if it cannot be trusted."""
        rendered = [section.render(ctx) for section in self.sections]
        text = " ".join(part.strip() for part in rendered if part and part.strip())
        if not text:
            return copytext.EXPLANATION_UNAVAILABLE
        try:
            self.guard.check(text, ctx)
        except CopyViolation as violation:
            # Logged loudly: this means a template or a model produced something
            # that must not be shown, and somebody needs to know which.
            logger.error(
                "Fund explanation rejected for %s: %s",
                ctx.fund.get("isin") or ctx.fund.get("id"),
                violation,
            )
            return copytext.EXPLANATION_UNAVAILABLE
        return text


class ReasonSentence:
    """The one-line reason a fund appears, naming its sources and the user's answers.

    Deterministic and per user. This is the sentence that has to survive the
    advice test, so it says who classified the fund, what they classified it as,
    when they said so, what the user told us, and what it is not.
    """

    def __init__(self, guard: CopyGuard | None = None):
        self.guard = guard if guard is not None else CopyGuard()

    def render(self, match: MatchResult, profile: Profile, today: date | None = None) -> str:
        now = today or date.today()
        label = match.risk_indicator_raw or label_for(match.risk_indicator_1to5) or "unrated"
        ctx = ExplanationContext(
            fund={"isin": match.isin, "id": match.fund_id},
            snapshot={
                "as_of": match.as_of,
                "risk_indicator_raw": match.risk_indicator_raw,
                "risk_indicator_1to5": match.risk_indicator_1to5,
                "ter": match.ter,
                "tic": match.tic,
            },
            match=match,
            profile=profile,
            today=now,
        )
        text = copytext.MATCH_REASON.format(
            manco=match.manco or match.fund_house,
            risk_label=label,
            category=match.asisa_category,
            as_of=ctx.as_of_display,
            risk_tolerance=profile.risk_tolerance,
            goals_clause=self._goals_clause(profile, now),
        )
        try:
            self.guard.check(text, ctx)
        except CopyViolation as violation:
            logger.error("Fund match reason rejected for %s: %s", match.isin, violation)
            return copytext.EXPLANATION_UNAVAILABLE
        return text

    @staticmethod
    def _goals_clause(profile: Profile, today: date) -> str:
        goals = profile.goals
        if goals is None:
            return ""
        parts: list[str] = []
        if goals.horizon_target_year is not None:
            parts.append(copytext.GOALS_CLAUSE_HORIZON.format(target_year=goals.horizon_target_year))
        if goals.purpose in copytext.GOALS_CLAUSE_PURPOSE:
            parts.append(copytext.GOALS_CLAUSE_PURPOSE[goals.purpose])
        return "".join(parts)


# ── small helpers ───────────────────────────────────────────────────────────

def _spell_date(value: date) -> str:
    """"31 July 2026". Built by hand because the no-padding directive for a day
    number differs between platforms, and this string ends up on screen."""
    return f"{value.day} {value.strftime('%B')} {value.year}"


def _trim(number: float) -> str:
    """Render a figure the way a fact sheet prints it: 1.26, 0.4, 60."""
    if float(number).is_integer():
        return str(int(number))
    return f"{number:.2f}".rstrip("0").rstrip(".")


def _canonical(token: str) -> str:
    """Compare numbers by value, not by punctuation: "1,26" and "1.26" agree."""
    cleaned = str(token).replace(",", ".").strip()
    try:
        value = float(cleaned)
    except ValueError:
        return cleaned
    return _trim(value)


def _join(items) -> str:
    parts = list(items)
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return f"{', '.join(parts[:-1])} and {parts[-1]}"


def _describe_performance(performance: dict[str, Any]) -> str | None:
    """Turn a sheet's annualised figures into a phrase, longest horizon first.

    Longest first because a single year of a fund's life is the least
    informative number on the sheet and the most likely to be read as a
    forecast.
    """
    order = ("10y", "5y", "3y", "1y")
    described: list[str] = []
    for horizon in order:
        value = as_number(performance.get(horizon))
        if value is None:
            continue
        years = horizon.rstrip("y")
        described.append(f"{_trim(value)}% a year over {years} years")
    if not described:
        return None
    return _join(described[:2])
