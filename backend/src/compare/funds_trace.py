"""The Compare page's written comparison for funds: personal, and written on request.

The stock paragraph's twin. Two parts, in a beginner's register:

  * what separates the funds on their own fact sheets: cost, the published risk
    label, the category, tracker or active, and the return periods every one of
    them reports;
  * why each fund is, or is not, among the funds matched to the reader's profile.

The second part is the personal one, and it is worked out here by fixed rules,
never by the model. No AI selects funds (D-153): the matches come from the same
``FundMatcher`` the Funds page runs, over the same catalogue and the same profile,
and the reason a fund is left out is the first of the matcher's own rules it
fails. The model only puts those reasons, and the fact-sheet figures, into words.

The guard is the stock paragraph's: every number must appear in what the model was
given, every fund is named, and advice, verdict and suitability wording fails it.
A paragraph that fails is replaced by the template, which says the same things in
fixed sentences.

Stored per reader in ``comparison_traces`` under the horizon ``FUNDS`` (migration
036), and served again only while it is current: the same fact sheet dates for
every fund, and the same profile answers.
"""

from __future__ import annotations

import datetime
import hashlib
import logging
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Iterable

from src.funds.asisa import ASISA
from src.funds.models import FundCandidate, MatchOutcome, Profile
from src.funds.risk_scale import ceiling_for, label_for, within_ceiling
from src.funds.validators import as_number
from src.quant.trace import FORBIDDEN_PATTERNS
from src.utils.gr_reasoningtracestyle import HOUSE_STYLE
from src.utils.llm_client import GroqClient

from .config import CompareConfig
from .trace import COMPARATIVE_PATTERNS, RETENTION_DAYS, SUITABILITY_PATTERNS, ComparisonTraceRepository, _join

logger = logging.getLogger("compare")

#: The horizon column's value for a fund comparison, which has no price window.
FUNDS_HORIZON = "FUNDS"

PERIODS: tuple[str, ...] = ("1y", "3y", "5y", "10y")
PERIOD_WORDS: dict[str, str] = {"1y": "1 year", "3y": "3 years", "5y": "5 years", "10y": "10 years"}

VEHICLE_WORDS: dict[str, str] = {"etf": "an exchange traded fund", "unit_trust": "a unit trust"}

PURPOSE_WORDS: dict[str, str] = {
    "emergency_fund": "money they may need at short notice",
    "goal": "money for a particular goal",
    "growth": "long-term growth",
    "income": "an income",
}

_FUND_ID = re.compile(r"^[A-Za-z0-9-]{1,64}$")
_NUMBER = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")
#: Small counts and the 1 to 5 scale itself, which prose uses without claiming a fact.
_ALWAYS_ALLOWED = frozenset({0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 100.0})


def normalise_fund_ids(ids: Iterable[str]) -> list[str]:
    """De-duplicated, in the order asked for. Junk is dropped, not raised."""
    out: list[str] = []
    for raw in ids:
        value = (raw or "").strip()
        if value and _FUND_ID.match(value) and value not in out:
            out.append(value)
    return out


def fund_set_key(ids: Iterable[str]) -> str:
    return "|".join(sorted(normalise_fund_ids(ids)))


def _trim(number: Any, places: int = 2) -> str:
    """A figure as a fact sheet prints it: 0.1, 1.26, 60."""
    value = float(number)
    if value.is_integer():
        return str(int(value))
    return f"{value:.{places}f}".rstrip("0").rstrip(".")


def _spell(value: Any) -> str:
    """'31 August 2026' from a date or an ISO string; the input unchanged otherwise."""
    try:
        d = value if isinstance(value, datetime.date) else datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return str(value)
    return f"{d.day} {d.strftime('%B')} {d.year}"


# ── evidence ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FundFacts:
    """One fund's fact sheet, as much of it as the paragraph may use."""

    fund_id: str
    #: What the paragraph calls it: the JSE code, or the name when there is none.
    label: str
    name: str
    vehicle: str
    fund_house: str
    category: str
    is_index_tracker: bool
    benchmark: str | None
    risk_level: int | None
    risk_label: str | None
    ter: float | None
    min_term_years: float | None
    tfsa_eligible: bool
    regulation_28: bool | None
    as_of: str | None
    performance: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_candidate(cls, candidate: FundCandidate) -> "FundFacts":
        fund = candidate.fund
        snap = candidate.snapshot or {}
        performance = {}
        for period, value in (snap.get("performance") or {}).items():
            number = as_number(value)
            if period in PERIODS and number is not None:
                performance[period] = number
        level = candidate.risk_level
        return cls(
            fund_id=str(fund.get("id") or ""),
            label=(fund.get("jse_code") or fund.get("name") or "").strip(),
            name=fund.get("name") or "",
            vehicle=fund.get("vehicle") or "",
            fund_house=fund.get("fund_house") or "",
            category=fund.get("asisa_category") or "",
            is_index_tracker=bool(fund.get("is_index_tracker")),
            benchmark=snap.get("benchmark"),
            risk_level=level,
            risk_label=snap.get("risk_indicator_raw") or label_for(level),
            ter=as_number(snap.get("ter")),
            min_term_years=as_number(snap.get("recommended_min_term_years")),
            tfsa_eligible=bool(fund.get("tfsa_eligible")),
            regulation_28=snap.get("regulation_28"),
            as_of=str(snap.get("as_of"))[:10] if snap.get("as_of") else None,
            performance=performance,
        )


@dataclass(frozen=True)
class FundPlacing:
    """Whether one fund is among the reader's matches, and the rule that decided it."""

    matched: bool
    because: str


@dataclass(frozen=True)
class FundProfile:
    """The reader's answers the matcher reads, and where each compared fund landed."""

    risk_tolerance: str
    ceiling: int
    horizon_years: int | None
    purpose: str | None
    tfsa: bool
    fallback_risk_only: bool
    placings: dict[str, FundPlacing] = field(default_factory=dict)


@dataclass(frozen=True)
class FundComparisonEvidence:
    funds: tuple[FundFacts, ...]
    yours: FundProfile | None

    @property
    def labels(self) -> list[str]:
        return [f.label for f in self.funds]

    @property
    def key(self) -> str:
        return fund_set_key(f.fund_id for f in self.funds)

    @property
    def periods(self) -> list[str]:
        """The return periods every fund reports, as the table shows them."""
        return [p for p in PERIODS if all(p in f.performance for f in self.funds)]

    @property
    def has_evidence(self) -> bool:
        return len(self.funds) >= 2 and all(f.label for f in self.funds)


# ── where each fund lands ────────────────────────────────────────────────────

def placing_for(candidate: FundCandidate, profile: Profile, outcome: MatchOutcome, today: datetime.date) -> FundPlacing:
    """Whether the matcher matched this fund for this reader, and why, in the
    matcher's own terms. For a fund left out, the first rule it fails, in the order
    the chain runs them; each check reads the same field the rule reads."""
    fund_id = str(candidate.fund.get("id") or "")
    matched_ids = {m.fund_id for m in outcome.matches}
    level = candidate.risk_level
    ceiling = ceiling_for(profile.risk_tolerance)
    goals = profile.goals
    years = goals.horizon_years(today) if goals else None
    snap = candidate.snapshot or {}
    min_term = as_number(snap.get("recommended_min_term_years"))
    bracket = outcome.bracket
    code = ASISA.code_for(candidate.category) if candidate.category else None

    if fund_id in matched_ids:
        parts = [
            f"its manager rates it {level} of 5, within the {ceiling} of 5 your {profile.risk_tolerance} profile allows",
            f"its category, {candidate.category}, is one your profile covers",
        ]
        if years is not None and min_term is not None:
            parts.append(f"its suggested minimum term of {_trim(min_term)} years is within the {years} years to your goal")
        return FundPlacing(True, _join(parts))

    if level is None:
        return FundPlacing(False, "its manager publishes no risk rating, so it is not matched to any profile")
    if not within_ceiling(level, profile.risk_tolerance):
        return FundPlacing(
            False, f"its manager rates it {level} of 5, above the {ceiling} of 5 your {profile.risk_tolerance} profile allows"
        )
    if years is not None and (not candidate.snapshot or (min_term is not None and min_term > years)):
        return FundPlacing(
            False,
            f"its fact sheet suggests at least {_trim(min_term)} years, and your goal is {years} years away"
            if min_term is not None
            else "it has no fact sheet to check against your time to your goal",
        )
    if goals is not None and goals.account_type == "tfsa" and not candidate.fund.get("tfsa_eligible"):
        return FundPlacing(False, "you chose a tax-free account, and this fund is not eligible for one")
    if bracket is not None and (code is None or code not in bracket.categories):
        return FundPlacing(False, f"its category, {candidate.category}, is not one your profile covers")
    if bracket is not None and code in bracket.tracker_only and not candidate.is_index_tracker:
        return FundPlacing(False, "in its category your profile is matched to index trackers only, and this fund is actively managed")
    return FundPlacing(False, "it is outside the rules your profile is matched by")


def profile_key(profile: Profile | None) -> str:
    """A short fingerprint of the answers the matcher reads, so a stored paragraph
    is retired when the reader changes them."""
    if profile is None:
        return "none"
    goals = profile.goals
    raw = "|".join(
        str(x)
        for x in (
            profile.risk_tolerance,
            goals.horizon_target_year if goals else None,
            goals.purpose if goals else None,
            goals.account_type if goals else None,
            goals.contribution_style if goals else None,
        )
    )
    return hashlib.sha1(raw.encode()).hexdigest()[:12]


def freshness_key(candidates: list[FundCandidate], profile: Profile | None) -> str:
    """'<id>:<sheet date>|...#<profile>': what a stored paragraph is checked against."""
    sheets = "|".join(
        f"{c.fund.get('id')}:{(c.snapshot or {}).get('as_of') or ''}" for c in sorted(candidates, key=lambda c: str(c.fund.get("id")))
    )
    return f"{sheets}#{profile_key(profile)}"


# ── the facts block, which is also the grounding ─────────────────────────────

class FundFactsBlock:
    """The text the model is given. Its numbers are the only numbers it may write."""

    def build(self, evidence: FundComparisonEvidence) -> str:
        periods = evidence.periods
        blocks = []
        for f in evidence.funds:
            lines = [
                f"=== {f.label} ===",
                f"- {f.name}, {VEHICLE_WORDS.get(f.vehicle, 'a fund')} from {f.fund_house}",
                f"- ASISA category: {f.category}",
                (
                    f"- Index tracker, following {f.benchmark}"
                    if f.is_index_tracker and f.benchmark
                    else "- Index tracker"
                    if f.is_index_tracker
                    else f"- Actively managed against {f.benchmark}"
                    if f.benchmark
                    else "- Actively managed"
                ),
                (
                    f"- Risk rating on its fact sheet: {f.risk_label} ({f.risk_level} of 5)"
                    if f.risk_level is not None
                    else "- Risk rating: its manager publishes none"
                ),
            ]
            if f.ter is not None:
                lines.append(f"- Total expense ratio (TER): {_trim(f.ter)} percent a year")
            if f.min_term_years is not None:
                lines.append(f"- Suggested minimum term: {_trim(f.min_term_years)} years")
            lines.append(f"- Tax-free account eligible: {'yes' if f.tfsa_eligible else 'no'}")
            if f.regulation_28 is not None:
                lines.append(f"- Regulation 28 compliant: {'yes' if f.regulation_28 else 'no'}")
            if periods:
                lines.append(
                    "- Returns, the fund's own yearly averages: "
                    + "; ".join(f"{PERIOD_WORDS[p]} {_trim(f.performance[p], 1)} percent" for p in periods)
                )
            if f.as_of:
                lines.append(f"- Fact sheet dated {_spell(f.as_of)}")
            blocks.append("\n".join(lines))
        return "\n\n".join(blocks) + "\n\n" + self._yours(evidence)

    @staticmethod
    def _yours(evidence: FundComparisonEvidence) -> str:
        yours = evidence.yours
        if yours is None:
            return "=== The reader's profile ===\nThe reader has not completed a risk profile, so there are no matches to explain."
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
        for f in evidence.funds:
            p = yours.placings.get(f.fund_id)
            if p is None:
                continue
            state = "among the reader's matches" if p.matched else "not among the reader's matches"
            lines.append(f"- {f.label}: {state}, because {p.because}")
        return "\n".join(lines)


def _numbers(text: str) -> set[float]:
    out: set[float] = set()
    for token in _NUMBER.findall(text):
        try:
            out.add(abs(float(token.replace(",", ""))))
        except ValueError:
            continue
    return out


# ── the guard ────────────────────────────────────────────────────────────────

#: "its minimum term fits your eight-year goal": the horizon rule said in plain words,
#: which the model reaches for however the prompt is worded. It is about time, not
#: about the reader, so it is lifted out before the suitability words are checked.
#: Only that construction: "fits your profile" or a bare "fits your goal" still fail.
_TERM_FITS_GOAL = re.compile(
    r"\bterm\b[^.;]{0,40}?\bfits? (?:inside |within )?your\b[^.;]{0,25}?\b(?:goal|horizon|time)\b",
    re.IGNORECASE,
)


class FundComparisonGuard:
    """The stock paragraph's rules, applied to funds."""

    TOLERANCE = 0.051

    def __init__(self, config: CompareConfig | None = None, block: FundFactsBlock | None = None):
        self.config = config or CompareConfig.from_env()
        self.block = block or FundFactsBlock()

    def check(self, text: str, evidence: FundComparisonEvidence) -> str | None:
        if len(text) < self.config.trace_min_chars:
            return f"too short to be a paragraph ({len(text)} chars)"
        if len(text) > self.config.trace_max_chars:
            return f"over the {self.config.trace_max_chars} char limit ({len(text)} chars)"
        for pattern in FORBIDDEN_PATTERNS + COMPARATIVE_PATTERNS:
            hit = pattern.search(text)
            if hit:
                return f"uses forbidden term '{hit.group(0)}'"
        without_term_fit = _TERM_FITS_GOAL.sub("", text)
        for pattern in SUITABILITY_PATTERNS:
            hit = pattern.search(without_term_fit)
            if hit:
                return f"uses forbidden term '{hit.group(0)}'"
        lowered = text.lower()
        missing = [label for label in evidence.labels if label.lower() not in lowered]
        if missing:
            return f"leaves out {', '.join(missing)}"
        allowed = _numbers(self.block.build(evidence)) | _ALWAYS_ALLOWED
        stray = [
            token
            for token in _NUMBER.findall(text)
            if not any(abs(abs(float(token.replace(",", ""))) - a) <= self.TOLERANCE for a in allowed)
        ]
        if stray:
            return f"quotes numbers not in the facts: {', '.join(stray)}"
        return None


# ── the prompt ───────────────────────────────────────────────────────────────

class FundComparisonPromptBuilder:
    def __init__(self, block: FundFactsBlock | None = None):
        self.block = block or FundFactsBlock()

    def build(self, evidence: FundComparisonEvidence) -> str:
        names = _join(evidence.labels)
        personal = evidence.yours is not None
        cover_yours = (
            """- Then, in two or three sentences, which of the funds are among the reader's matches and why, using only the reasons listed under "The reader's profile". Speak to the reader as "your profile". Say "is among your matches" or "is not among your matches"."""
            if personal
            else "- Say nothing about matches: the reader has no profile to match against."
        )
        return f"""You are writing one short paragraph for a retail investing app that places the funds {names} side by side for one reader. The reader is a beginner looking at a table of these same figures.

{self.block.build(evidence)}

Write five to seven short sentences, no more than 150 words in total, as one paragraph with no headings, no bullet points and no title.

Cover, in this order:
- First, in two or three sentences, where the funds differ most on their fact sheets: the yearly cost (TER), the risk rating, the category, whether each tracks an index or is actively managed, and the return periods listed. Do not list every figure for every fund.
- If returns are listed, say plainly that they are each fund's own past figures and describe the past.
{cover_yours}

Rules you must follow:
- Name every one of {names} at least once, exactly as written there.
- Use ONLY the figures listed above. Do not work out new numbers: no differences, no totals, no averages, no rand amounts.
- Never say or imply that one fund is better, worse, safer, riskier, cheaper or preferable, or that one did better than another. Say what each figure is. Do not use the words better, worse, best, worst, pick, prefer, outperform, beat, safer, riskier or winner.
- A match is the result of fixed rules over the funds' own labels, not a judgement. Never say or imply that a fund suits, fits or is right for the reader. Do not use the words suit, suitable, fit, ideal, appropriate or recommend.
- Never say what any fund will do next, and never tell the reader to buy, sell, hold, invest, switch or avoid. Do not use the words should, consider, advice, expect, potential, opportunity or outlook.
- Keep every sentence under 30 words. Do not join sentences with semicolons.
- Write British English, in a plain, level voice. Never use a dash of any kind as punctuation.
- Plain prose only. No markdown, no quotation marks around the paragraph.

Write only the paragraph itself."""


# ── the template ─────────────────────────────────────────────────────────────

class FundComparisonTemplate:
    """The same facts in fixed sentences: what the reader gets when the model cannot
    be used, and the proof that the paragraph needs no judgement to be written."""

    def render(self, evidence: FundComparisonEvidence) -> str:
        sentences: list[str] = []
        for f in evidence.funds:
            parts = [f"{f.label} is {VEHICLE_WORDS.get(f.vehicle, 'a fund')} in {f.category}"]
            parts.append("that tracks an index" if f.is_index_tracker else "that is actively managed")
            sentence = " ".join(parts)
            details = []
            if f.risk_level is not None:
                details.append(f"its manager rates it {f.risk_level} of 5")
            if f.ter is not None:
                details.append(f"it costs {_trim(f.ter)} percent a year")
            if details:
                sentence += ", and " + _join(details)
            sentences.append(sentence + ".")

        periods = evidence.periods
        if periods:
            longest = periods[-1]
            figures = [f"{_trim(f.performance[longest], 1)} percent for {f.label}" for f in evidence.funds]
            sentences.append(
                f"Over {PERIOD_WORDS[longest]}, the funds' own yearly averages were {_join(figures)}; these describe the past."
            )

        yours = evidence.yours
        if yours is not None:
            sentences.append(f"Your {yours.risk_tolerance} profile is matched to funds rated up to {yours.ceiling} of 5.")
            for f in evidence.funds:
                p = yours.placings.get(f.fund_id)
                if p is None:
                    continue
                state = "is among your matches" if p.matched else "is not among your matches"
                sentences.append(f"{f.label} {state}, because {p.because}.")
        sentences.append("None of this says which one to choose.")
        return " ".join(sentences)


# ── the generator ────────────────────────────────────────────────────────────

class FundComparisonGenerator:
    KEY_ENV = "GROQ_API_KEY7"
    FALLBACK_KEY_ENV = "GROQ_API_KEY4"
    MAX_TOKENS = 1400
    TEMPERATURE = 0.2
    RETRIES = 2
    BACKOFF_SECONDS = (1.0, 2.0)

    def __init__(
        self,
        config: CompareConfig | None = None,
        client: Any | None = None,
        guard: FundComparisonGuard | None = None,
        builder: FundComparisonPromptBuilder | None = None,
    ):
        self.config = config or CompareConfig.from_env()
        self.builder = builder or FundComparisonPromptBuilder()
        self.guard = guard or FundComparisonGuard(self.config)
        self._client = client
        self._client_built = client is not None

    @property
    def client(self):
        if not self._client_built:
            self._client_built = True
            self._client = GroqClient.create(
                purpose="fund_comparison_trace",
                max_tokens=self.MAX_TOKENS,
                temperature=self.TEMPERATURE,
                key_env=self.KEY_ENV,
                fallback_key_env=self.FALLBACK_KEY_ENV,
            )
        return self._client

    @property
    def model(self) -> str | None:
        client = self.client
        return client.model if client else None

    def generate(self, evidence: FundComparisonEvidence) -> str | None:
        """One paragraph that passed the guard, or None. Never raises."""
        client = self.client
        if client is None or not evidence.has_evidence:
            return None
        prompt = self.builder.build(evidence)
        for attempt in range(self.RETRIES + 1):
            try:
                text = client.complete(prompt)
                break
            except Exception as e:
                if attempt >= self.RETRIES:
                    logger.warning("Fund comparison failed for %s: %s", evidence.key, e)
                    return None
                time.sleep(self.BACKOFF_SECONDS[min(attempt, len(self.BACKOFF_SECONDS) - 1)])
        else:
            return None
        paragraph = HOUSE_STYLE.apply(text or "")
        reason = self.guard.check(paragraph, evidence)
        if reason:
            logger.info("Fund comparison for %s rejected: %s", evidence.key, reason)
            return None
        return paragraph


# ── the service ──────────────────────────────────────────────────────────────

class FundComparisonService:
    """Writes a reader's fund comparison when they ask, and serves it while it is current."""

    def __init__(
        self,
        config: CompareConfig | None = None,
        funds: Any | None = None,
        repository: ComparisonTraceRepository | None = None,
        generator: FundComparisonGenerator | None = None,
        template: FundComparisonTemplate | None = None,
        today: Any = None,
        now: Any = None,
    ):
        self.config = config or CompareConfig.from_env()
        #: The fund catalogue service: its repository, profile reader and matcher.
        self._funds = funds
        self.repository = repository or ComparisonTraceRepository()
        self.generator = generator or FundComparisonGenerator(self.config)
        self.template = template or FundComparisonTemplate()
        self._today = today or datetime.date.today
        self._now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))
        self._pruned = False
        self._locks: dict[tuple[str, str], threading.Lock] = {}
        self._locks_guard = threading.Lock()
        self._calls: dict[str, int] = {}
        self._calls_day: str | None = None

    @property
    def funds(self):
        if self._funds is None:
            from src.funds.routes import get_service

            self._funds = get_service()
        return self._funds

    @property
    def enabled(self) -> bool:
        return self.config.trace_enabled

    def _valid(self, ids: Iterable[str]) -> list[str] | None:
        found = normalise_fund_ids(ids)
        if not self.config.min_tickers <= len(found) <= self.config.max_tickers:
            return None
        return found

    def _candidates(self, ids: list[str]) -> list[FundCandidate] | None:
        out = []
        for fund_id in ids:
            fund = self.funds.funds.get(fund_id)
            if not fund:
                return None
            history = self.funds.funds.snapshots(fund_id)
            out.append(FundCandidate(fund=fund, snapshot=history[0] if history else None))
        return out

    # ── reading back ─────────────────────────────────────────────────────────

    def saved(self, user_id: str, ids: Iterable[str]) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        try:
            found = self._valid(ids)
            if found is None:
                return None
            return self._current(user_id, found)
        except Exception as e:
            logger.warning("Fund comparison lookup failed for %s: %s", list(ids), e)
            return None

    def _current(self, user_id: str, ids: list[str]) -> dict[str, Any] | None:
        stored = self.repository.read(user_id, fund_set_key(ids), FUNDS_HORIZON)
        if not stored:
            return None
        candidates = self._candidates(ids)
        if candidates is None:
            return None
        profile = self.funds.profiles.profile(user_id)
        if stored.get("windows") != freshness_key(candidates, profile):
            return None
        return self._point(stored)

    # ── writing ──────────────────────────────────────────────────────────────

    def explain(self, user_id: str, ids: Iterable[str]) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        try:
            found = self._valid(ids)
            if found is None:
                return None
            lock_key = (user_id, fund_set_key(found))
            try:
                with self._lock_for(lock_key):
                    current = self._current(user_id, found)
                    if current:
                        return current
                    return self._generate(user_id, found)
            finally:
                with self._locks_guard:
                    self._locks.pop(lock_key, None)
        except Exception as e:
            logger.warning("Fund comparison failed for %s: %s", list(ids), e)
            return None

    def evidence(self, user_id: str, ids: list[str]) -> tuple[FundComparisonEvidence, str] | None:
        candidates = self._candidates(ids)
        if candidates is None:
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
                placings={str(c.fund.get("id")): placing_for(c, profile, outcome, today) for c in candidates},
            )
        evidence = FundComparisonEvidence(funds=tuple(FundFacts.from_candidate(c) for c in candidates), yours=yours)
        return evidence, freshness_key(candidates, profile)

    def _generate(self, user_id: str, ids: list[str]) -> dict[str, Any] | None:
        built = self.evidence(user_id, ids)
        if built is None:
            return None
        evidence, freshness = built
        if not evidence.has_evidence:
            return None

        day = self._today().isoformat()
        text = self.generator.generate(evidence) if self._spend(user_id, day) else None
        source = "model"
        if not text:
            text = self.template.render(evidence)
            source = "template"

        row = {
            "user_id": user_id,
            "set_key": evidence.key,
            "horizon": FUNDS_HORIZON,
            "trace": text,
            "source": source,
            "model": self.generator.model if source == "model" else None,
            "windows": freshness,
            "run_id": None,
            "run_at": None,
            "facts": {
                "funds": [f.__dict__ for f in evidence.funds],
                "yours": (
                    {**evidence.yours.__dict__, "placings": {k: v.__dict__ for k, v in evidence.yours.placings.items()}}
                    if evidence.yours
                    else None
                ),
            },
            "generated_at": self._now().isoformat(),
        }
        self.repository.save(row)
        self._prune_once()
        logger.info("Generated %s fund comparison for %s", source, evidence.key)
        return self._point(row)

    def _spend(self, user_id: str, day: str) -> bool:
        with self._locks_guard:
            if self._calls_day != day:
                self._calls_day = day
                self._calls = {}
            used = self._calls.get(user_id, 0)
            if used >= self.config.trace_daily_limit:
                logger.info("Fund comparison daily limit reached for a reader; using the template")
                return False
            self._calls[user_id] = used + 1
            return True

    def _lock_for(self, key: tuple[str, str]) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = self._locks[key] = threading.Lock()
            return lock

    def _prune_once(self) -> None:
        if self._pruned:
            return
        self._pruned = True
        self.repository.prune(self._now() - datetime.timedelta(days=RETENTION_DAYS))

    @staticmethod
    def _point(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "trace": row.get("trace"),
            "source": row.get("source"),
            "model": row.get("model"),
            "generated_at": row.get("generated_at"),
            # Personal when the reader had a profile to match against.
            "personal": not str(row.get("windows") or "").endswith("#none"),
            "run_at": None,
        }
