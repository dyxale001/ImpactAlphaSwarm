"""One fund's reasoning trace, on its own page: personal, and written on request.

The fund page's twin of the Compare page's fund paragraph (``src.compare.funds_trace``),
for a single fund. Two parts, in a beginner's register:

  * what the fund is on its own fact sheet: its category, tracker or active, what
    its largest parts are, what it costs, its risk rating and suggested term, and the
    return periods it reports;
  * whether it is among the funds matched to the reader's profile, and how its term,
    tax-free eligibility and income sit beside the reader's own answers.

The second part is worked out by fixed rules, never by the model. No AI selects funds
(D-153): the placing comes from ``placing_for``, the same reading of the same
``FundMatcher`` the Compare paragraph and the Funds page use. The model only puts the
reasons, and the fact-sheet figures, into words. D-218 asks for exactly this: a
reasoning trace for every fund match and exclusion.

The guard is Compare's: every number must appear in what the model was given, the
fund is named, and advice, verdict and suitability wording fails it. A paragraph that
fails is replaced by the template, which says the same things in fixed sentences.

On wherever the funds catalogue is: it needs no flag of its own. Every way it can
fall short still leaves the reader a paragraph. Without a Groq key, past the daily
limit, or when a paragraph fails the guard, the template is served instead.

Written on command and never stored. Each press of the button writes a fresh
paragraph from the fund's current fact sheet and the reader's current answers, so
there is nothing to keep in step with either, and nothing about the reader is
saved. Written with ``GROQ_API_KEY7``, the Compare paragraph's account, falling
back to ``GROQ_API_KEY4``.
"""

from __future__ import annotations

import dataclasses
import datetime
import logging
import re
import threading
from dataclasses import dataclass
from typing import Any

from src.compare.config import CompareConfig
from src.compare.funds_trace import (
    PERIOD_WORDS,
    PERIODS,
    PURPOSE_WORDS,
    VEHICLE_WORDS,
    FundComparisonGenerator,
    FundComparisonGuard,
    FundFacts,
    FundPlacing,
    FundProfile,
    _spell,
    _trim,
    normalise_fund_ids,
    placing_for,
)
from src.utils.llm_client import GroqClient

from .models import FundCandidate
from .risk_scale import ceiling_for
from .validators import as_number

logger = logging.getLogger("funds")

#: The horizon column's value for one fund's own paragraph.
FUND_HORIZON = "FUND"

#: How many allocation rows the paragraph is given. Enough to say what the fund is
#: mostly made of; every row would invite the model to list them.
ALLOCATION_ROWS = 4

#: A share class in brackets at the end of a name: "(P)", "(A1)". The paragraph names
#: the fund without it, and the guard checks for the name the paragraph was asked to use.
_CLASS_SUFFIX = re.compile(r"\s*\([^)]{1,12}\)\s*$")


def fund_trace_config() -> CompareConfig:
    """Compare's length and daily limits, always on.

    Not Compare's switch: the fund page's panel is part of the funds feature, so it
    is on wherever the catalogue is mounted, and it never needs a flag of its own.
    """
    return dataclasses.replace(CompareConfig.from_env(), trace_enabled=True)


# ── evidence ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FundTraceEvidence:
    """One fund's fact sheet and the reader's answers beside it."""

    fund: FundFacts
    #: The total investment charge, the figure the page leads with. TER is on ``fund``.
    tic: float | None
    distribution: str | None
    #: The largest allocation rows, as the sheet names them, largest first.
    allocation: tuple[tuple[str, float], ...]
    yours: FundProfile | None

    @property
    def labels(self) -> list[str]:
        return [self.fund.label]

    @property
    def key(self) -> str:
        return self.fund.fund_id

    @property
    def periods(self) -> list[str]:
        return [p for p in PERIODS if p in self.fund.performance]

    @property
    def placing(self) -> FundPlacing | None:
        return self.yours.placings.get(self.fund.fund_id) if self.yours else None

    @property
    def has_evidence(self) -> bool:
        # A fund with no sheet has nothing to explain beyond what the page already
        # says, so the panel is not offered for it.
        return bool(self.fund.label) and self.fund.as_of is not None


def _allocation(snapshot: dict[str, Any]) -> tuple[tuple[str, float], ...]:
    rows = []
    for name, value in (snapshot.get("asset_allocation") or {}).items():
        share = as_number(value)
        if share is not None and share > 0:
            rows.append((str(name).replace("_", " ").strip(), share))
    rows.sort(key=lambda row: (-row[1], row[0]))
    return tuple(rows[:ALLOCATION_ROWS])


def _lead_lower(text: str) -> str:
    """'Semi-annually (March & September)' as it reads mid-sentence, months intact."""
    text = text.strip()
    return text[:1].lower() + text[1:]


# ── the facts block, which is also the grounding ─────────────────────────────

class FundTraceFactsBlock:
    """The text the model is given. Its numbers are the only numbers it may write."""

    def build(self, evidence: FundTraceEvidence) -> str:
        f = evidence.fund
        lines = [
            f"=== {f.label} ===",
            f"- {f.name}, {VEHICLE_WORDS.get(f.vehicle, 'a fund')} from {f.fund_house}",
            f"- ASISA category: {f.category}",
            (
                f"- Index tracker, following {f.benchmark}"
                if f.is_index_tracker and f.benchmark
                else "- Index tracker"
                if f.is_index_tracker
                else f"- Actively managed, measured against {f.benchmark}"
                if f.benchmark
                else "- Actively managed"
            ),
        ]
        if evidence.allocation:
            lines.append(
                "- Largest parts of the portfolio: "
                + "; ".join(f"{name} {_trim(share, 1)} percent" for name, share in evidence.allocation)
            )
        if evidence.tic is not None and f.ter is not None:
            lines.append(
                f"- Total investment charge: {_trim(evidence.tic)} percent a year, "
                f"of which the total expense ratio (TER) is {_trim(f.ter)} percent"
            )
        elif evidence.tic is not None:
            lines.append(f"- Total investment charge: {_trim(evidence.tic)} percent a year")
        elif f.ter is not None:
            lines.append(f"- Total expense ratio (TER): {_trim(f.ter)} percent a year")
        lines.append(
            f"- Risk rating on its fact sheet: {f.risk_label} ({f.risk_level} of 5)"
            if f.risk_level is not None
            else "- Risk rating: its manager publishes none"
        )
        if f.min_term_years is not None:
            lines.append(f"- Suggested minimum term: {_trim(f.min_term_years)} years")
        lines.append(f"- Tax-free account eligible: {'yes' if f.tfsa_eligible else 'no'}")
        if f.regulation_28 is not None:
            lines.append(f"- Regulation 28 compliant: {'yes' if f.regulation_28 else 'no'}")
        if evidence.distribution:
            lines.append(f"- Pays income: {evidence.distribution}")
        if evidence.periods:
            lines.append(
                "- Returns as published on its fact sheet, for periods ending on the sheet date: "
                + "; ".join(f"{PERIOD_WORDS[p]} {_trim(f.performance[p], 1)} percent" for p in evidence.periods)
            )
        if f.as_of:
            lines.append(f"- Fact sheet dated {_spell(f.as_of)}")
        return "\n".join(lines) + "\n\n" + self._yours(evidence)

    @staticmethod
    def _yours(evidence: FundTraceEvidence) -> str:
        yours = evidence.yours
        if yours is None:
            return "=== The reader's profile ===\nThe reader has not completed a risk profile, so there is no match to explain."
        f = evidence.fund
        lines = [
            "=== The reader's profile ===",
            f"- Risk profile: {yours.risk_tolerance}, which is matched to funds rated up to {yours.ceiling} of 5",
        ]
        if yours.horizon_years is not None:
            lines.append(f"- Time to their goal: {yours.horizon_years} years")
        if yours.purpose in PURPOSE_WORDS:
            lines.append(f"- Investing for: {PURPOSE_WORDS[yours.purpose]}")
        if yours.tfsa:
            lines.append("- Account: a tax-free savings account")
        if yours.fallback_risk_only:
            lines.append("- Only the risk profile is on file, so only the risk rules applied")
        lines.append(
            "How funds are matched: fixed rules over each fund's own published labels. The risk rating must be at or "
            "below the profile's limit, the category must be one the profile covers, the suggested minimum term must be "
            "no longer than the time to the goal, and a tax-free account needs a tax-free eligible fund. Nothing scores or "
            "ranks the funds."
        )
        placing = evidence.placing
        if placing is not None:
            state = "among the reader's matches" if placing.matched else "not among the reader's matches"
            lines.append(f"- {f.label}: {state}, because {placing.because}")
        # The reader's own answers beside the fund's figures, whether or not they were
        # the rule that decided. Facts on both sides; the model says what they are.
        if yours.horizon_years is not None and f.min_term_years is not None:
            lines.append(
                f"- Beside the reader's answers: a suggested minimum term of {_trim(f.min_term_years)} years, "
                f"and a goal {yours.horizon_years} years away"
            )
        if yours.tfsa:
            lines.append(
                "- Beside the reader's answers: they chose a tax-free account, and this fund "
                + ("is eligible for one" if f.tfsa_eligible else "is not eligible for one")
            )
        if yours.purpose == "income":
            lines.append(
                f"- Beside the reader's answers: they are investing for an income, and the fund pays income {evidence.distribution}"
                if evidence.distribution
                else "- Beside the reader's answers: they are investing for an income, and the fact sheet lists no income payments"
            )
        return "\n".join(lines)


# ── the prompt ───────────────────────────────────────────────────────────────

class FundTracePromptBuilder:
    def __init__(self, block: FundTraceFactsBlock | None = None):
        self.block = block or FundTraceFactsBlock()

    def build(self, evidence: FundTraceEvidence) -> str:
        name = evidence.fund.label
        cover_yours = (
            """- Then, in two or three sentences, whether the fund is among the reader's matches and why, using only the reasons listed under "The reader's profile", and how its suggested term, tax-free eligibility and income sit beside the reader's own answers where those are listed. Speak to the reader as "your profile" and "your goal". Say "is among your matches" or "is not among your matches"."""
            if evidence.yours is not None
            else "- Say nothing about matches: the reader has no profile to match against."
        )
        return f"""You are writing one short paragraph for a retail investing app, on the page of one fund, {name}, for one reader. The reader is a beginner who can see these same figures on the page.

{self.block.build(evidence)}

Write five to seven short sentences, no more than 150 words in total, as one paragraph with no headings, no bullet points and no title.

Cover, in this order:
- First, in two or three sentences, what the fund is and what it costs: its category, whether it tracks an index or is actively managed, what its largest parts are, and its yearly charge. Do not list every figure.
- Then its risk rating and suggested minimum term, in its manager's own terms. If returns are listed, say plainly that they are the fund's own past figures and describe the past.
{cover_yours}

Rules you must follow:
- Name {name} at least once, exactly as written there.
- Use ONLY the figures listed above. Do not work out new numbers: no differences, no totals, no averages, no rand amounts.
- Never call the fund good, bad, cheap, expensive, safe or risky, and never compare it with other funds. Say what each figure is.
- A match is the result of fixed rules over the fund's own labels, not a judgement. Never say or imply that the fund suits, fits or is right for the reader. Do not use the words suit, suitable, fit, ideal, appropriate or recommend.
- Never say what the fund will do next, and never tell the reader to buy, sell, hold, invest, switch or avoid. Do not use the words should, must, consider, advice, expect, potential, opportunity, outlook, hold, holds or holding.
- Keep every sentence under 30 words. Do not join sentences with semicolons.
- Write British English, in a plain, level voice. Never use a dash of any kind as punctuation.
- Plain prose only. No markdown, no quotation marks around the paragraph.

Write only the paragraph itself."""


# ── the template ─────────────────────────────────────────────────────────────

class FundTraceTemplate:
    """The same facts in fixed sentences: what the reader gets when the model cannot
    be used, and the proof that the paragraph needs no judgement to be written."""

    def render(self, evidence: FundTraceEvidence) -> str:
        f = evidence.fund
        managed = (
            f"that tracks {f.benchmark}"
            if f.is_index_tracker and f.benchmark
            else "that tracks an index"
            if f.is_index_tracker
            else f"that is actively managed against {f.benchmark}"
            if f.benchmark
            else "that is actively managed"
        )
        sentences = [f"{f.label} is {VEHICLE_WORDS.get(f.vehicle, 'a fund')} in {f.category} {managed}."]
        if evidence.allocation:
            parts = [f"{name.lower()} at {_trim(share, 1)} percent" for name, share in evidence.allocation[:2]]
            sentences.append(f"Its largest parts are {' and '.join(parts)}.")
        if evidence.tic is not None:
            sentences.append(f"It costs {_trim(evidence.tic)} percent a year in total.")
        elif f.ter is not None:
            sentences.append(f"Its total expense ratio is {_trim(f.ter)} percent a year.")
        if f.risk_level is not None:
            term = (
                f", and its fact sheet suggests at least {_trim(f.min_term_years)} years"
                if f.min_term_years is not None
                else ""
            )
            sentences.append(f"Its manager rates it {f.risk_level} of 5{term}.")
        periods = evidence.periods
        if periods:
            longest = periods[-1]
            sentences.append(
                f"Over {PERIOD_WORDS[longest]} its published return was {_trim(f.performance[longest], 1)} percent, "
                "which describes the past."
            )

        yours = evidence.yours
        placing = evidence.placing
        if yours is not None and placing is not None:
            sentences.append(f"Your {yours.risk_tolerance} profile is matched to funds rated up to {yours.ceiling} of 5.")
            state = "is among your matches" if placing.matched else "is not among your matches"
            sentences.append(f"{f.label} {state}, because {placing.because}.")
        sentences.append("None of this says what to do with your money.")
        return " ".join(sentences)


# ── the generator ────────────────────────────────────────────────────────────

class FundTraceGenerator(FundComparisonGenerator):
    """Compare's fund generator, with this paragraph's prompt and grounding.

    The retry, the house style and the guard step are the same code, so the two
    paragraphs cannot drift apart in how they are checked.
    """

    KEY_ENV = "GROQ_API_KEY7"
    FALLBACK_KEY_ENV = "GROQ_API_KEY4"

    def __init__(
        self,
        config: CompareConfig | None = None,
        client: Any | None = None,
        guard: FundComparisonGuard | None = None,
        builder: FundTracePromptBuilder | None = None,
    ):
        config = config or fund_trace_config()
        block = FundTraceFactsBlock()
        super().__init__(
            config=config,
            client=client,
            guard=guard or FundComparisonGuard(config, block=block),  # type: ignore[arg-type]
            builder=builder or FundTracePromptBuilder(block),  # type: ignore[arg-type]
        )

    @property
    def client(self):
        if not self._client_built:
            self._client_built = True
            self._client = GroqClient.create(
                purpose="fund_page_trace",
                max_tokens=self.MAX_TOKENS,
                temperature=self.TEMPERATURE,
                key_env=self.KEY_ENV,
                fallback_key_env=self.FALLBACK_KEY_ENV,
            )
        return self._client


# ── the service ──────────────────────────────────────────────────────────────

class FundTraceService:
    """Writes a reader's paragraph about one fund when they ask. Nothing is stored."""

    def __init__(
        self,
        config: CompareConfig | None = None,
        funds: Any | None = None,
        generator: FundTraceGenerator | None = None,
        template: FundTraceTemplate | None = None,
        today: Any = None,
        now: Any = None,
    ):
        self.config = config or fund_trace_config()
        #: The fund catalogue service: its repository, profile reader and matcher.
        self._funds = funds
        self.generator = generator or FundTraceGenerator(self.config)
        self.template = template or FundTraceTemplate()
        self._today = today or datetime.date.today
        self._now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))
        # Model calls per reader per day, in memory. The only thing kept, and only
        # so one reader pressing the button over and over cannot spend the key.
        self._calls: dict[str, int] = {}
        self._calls_day: str | None = None
        self._calls_guard = threading.Lock()

    @property
    def funds(self):
        if self._funds is None:
            from .routes import get_service

            self._funds = get_service()
        return self._funds

    @property
    def enabled(self) -> bool:
        return self.config.trace_enabled

    @staticmethod
    def valid(fund_id: str) -> str | None:
        found = normalise_fund_ids([fund_id])
        return found[0] if found else None

    def _candidate(self, fund_id: str) -> FundCandidate | None:
        fund = self.funds.funds.get(fund_id)
        if not fund:
            return None
        history = self.funds.funds.snapshots(fund_id)
        return FundCandidate(fund=fund, snapshot=history[0] if history else None)

    def explain(self, user_id: str, fund_id: str) -> dict[str, Any] | None:
        """A fresh paragraph about this fund for this reader, or None. Never raises."""
        if not self.enabled:
            return None
        try:
            found = self.valid(fund_id)
            if found is None:
                return None
            evidence = self.evidence(user_id, found)
            if evidence is None or not evidence.has_evidence:
                return None
            text = self.generator.generate(evidence) if self._spend(user_id) else None  # type: ignore[arg-type]
            source = "model"
            if not text:
                text = self.template.render(evidence)
                source = "template"
            logger.info("Wrote %s fund trace for %s", source, found)
            return {
                "trace": text,
                "source": source,
                "model": self.generator.model if source == "model" else None,
                "generated_at": self._now().isoformat(),
                # Personal when the reader had a profile to match against.
                "personal": evidence.yours is not None,
            }
        except Exception as e:
            logger.warning("Fund trace failed for %s: %s", fund_id, e)
            return None

    def evidence(self, user_id: str, fund_id: str) -> FundTraceEvidence | None:
        candidate = self._candidate(fund_id)
        if candidate is None:
            return None
        profile = self.funds.profiles.profile(user_id)
        yours = None
        if profile is not None:
            today = self._today()
            outcome = self.funds.matcher.match(profile, self.funds.funds.candidates())
            goals = profile.goals
            yours = FundProfile(
                risk_tolerance=profile.risk_tolerance,
                ceiling=ceiling_for(profile.risk_tolerance),
                horizon_years=goals.horizon_years(today) if goals else None,
                purpose=goals.purpose if goals else None,
                tfsa=bool(goals and goals.account_type == "tfsa"),
                fallback_risk_only=profile.fallback_risk_only,
                placings={fund_id: placing_for(candidate, profile, outcome, today)},
            )
        facts = FundFacts.from_candidate(candidate)
        # The JSE code where there is one, else the name without its share class.
        if not candidate.fund.get("jse_code"):
            facts = dataclasses.replace(facts, label=_CLASS_SUFFIX.sub("", facts.name).strip() or facts.name)
        snap = candidate.snapshot or {}
        distribution = snap.get("distribution_frequency") or candidate.fund.get("distribution_frequency")
        return FundTraceEvidence(
            fund=facts,
            tic=as_number(snap.get("tic")),
            distribution=_lead_lower(str(distribution)) if distribution else None,
            allocation=_allocation(snap),
            yours=yours,
        )

    def _spend(self, user_id: str) -> bool:
        day = self._today().isoformat()
        with self._calls_guard:
            if self._calls_day != day:
                self._calls_day = day
                self._calls = {}
            used = self._calls.get(user_id, 0)
            if used >= self.config.trace_daily_limit:
                logger.info("Fund trace daily limit reached for a reader; using the template")
                return False
            self._calls[user_id] = used + 1
            return True
