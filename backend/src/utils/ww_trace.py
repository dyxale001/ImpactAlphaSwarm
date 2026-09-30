"""The Big investors tab's reasoning trace: a plain-English reading of one ticker's 13F
ownership, for a beginner.

It follows the Quant tab's trace (src/quant/trace.py) class for class, because the
problem is the same: prose that is generated, and therefore constrained.

What it is written from, and nothing else:

  * the three headline figures on the tab: the share held by institutions, the number
    of institutions, and the share held by insiders;
  * the top holders the tab lists, each with its share of the company, the change in
    its own position in the latest filing, and whether it is an index house, an active
    manager, or unclassified (``HolderStyleClassifier``);
  * the date the filing reports, and a size band inferred from the holdings themselves;
  * deterministic verdicts computed here: whether the figures sit inside the usual range
    for a company of that size, and how large each holder's change was.

The model is never asked whether a figure is normal or whether a fund is passive. Both
are decided in code and handed to it, so the paragraph can only explain a judgement,
never invent one.

The same two guards as the Quant trace stand between the model and the store: every
number must be one it was given, and advice or forward looking words reject the
paragraph outright. A rejected paragraph, a model that is down, or no key at all fall
back to a templated paragraph from the same facts, stored with ``source='template'``.

How the decision framing (confirmation signal, risk indicator, never a reason on its
own) reaches the reader: as fixed copy in the panel, not as model output. It is the part
of the tab closest to advice, and fixed wording is the only kind that cannot drift.

Caching: one trace per ticker, stored on the institutional cache row (migrations/028)
with a fingerprint of the facts. It is regenerated only when the fingerprint changes,
which is when a refetch brings a different filing.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from .gr_reasoningtracestyle import HOUSE_STYLE
from .ww_config import WhaleConfig

logger = logging.getLogger("alpha-api")

#: Bumped whenever the prompt or the facts change shape, so every stored trace is
#: rewritten once rather than left describing the old facts in the old way.
TRACE_VERSION = 3

#: How the last sentence must open. It tells the reader what they can do with this when
#: making their own decision (PlainMeaning.next_step), never what to do with the shares.
CLOSING_OPENER = "So this means"
_SENTENCES = re.compile(r"(?<=[.!?])\s+")
#: Refused in the closing sentence on top of FORBIDDEN_PATTERNS. "Hold" is allowed
#: elsewhere (index funds hold every company in an index) but in the sentence about what
#: the reader can do it reads as "keep the shares".
_CLOSING_FORBIDDEN = re.compile(r"\b(hold|holds|keep|keeping|get out|stay away)\b", re.IGNORECASE)

_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
_NUMBER = re.compile(r"(?<![\w.])[-−]?\d[\d,]*(?:\.\d+)?")
#: A thousands separator written as a space, a no-break space or a narrow no-break
#: space: "7 761". Seen live from the model; read as two numbers it fails the guard
#: on "761", so it is rewritten as "7,761" before either the guard or the reader sees it.
_SPACED_THOUSANDS = re.compile(r"(?<=\d)[   ](?=\d{3}(?!\d))")

#: Words the paragraph may not contain. The Quant trace's list, less "hold": holding a
#: stock is the whole subject here. "Sold" and "bought" stay allowed as past facts about
#: a fund; the present tense forms are what reads as an instruction.
FORBIDDEN_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bbuy(s|ing)?\b",
        r"\bsell(s|ing)?\b",
        r"\bshould\b",
        r"\bmust\b",
        r"\brecommend\w*\b",
        r"\badvi[cs]e\w*\b",
        r"\btarget price\b",
        r"\bunder-?valued\b",
        r"\bover-?valued\b",
        r"\bopportunit(y|ies)\b",
        r"\bbargain\b",
        r"\bavoid\w*\b",
        r"\boutlook\b",
        r"\bprospects?\b",
        r"\bpoised\b",
        r"\bset to\b",
        r"\bwill (rise|fall|climb|drop|recover|rebound|continue|likely)\b",
        r"\bpredict\w*\b",
        r"\bforecast\w*\b",
        r"\bexpect\w*\b",
        r"\blikely to\b",
        r"\bgoing to\b",
        r"\bbullish\b",
        r"\bbearish\b",
        r"\bcheap\b",
        r"\bexpensive\b",
        r"\bgood investment\b",
        r"\bsafe (bet|investment|stock)\b",
        # A figure spelled out in words slips past the number check. "Thousands" (the
        # plural, as in "thousands of holders") is allowed; "thousand" as a count is not.
        r"\b(hundred|thousand|million|billion|trillion)\b",
    )
)

# ── reference bands ──────────────────────────────────────────────────────────
# Rules of thumb for US listed companies, stated to the reader as such. The model is
# handed the verdict, never asked to judge.

#: Institutional ownership usually seen in a large US company.
LARGE_INSTITUTIONAL_BAND = (70.0, 90.0)
#: Insider stakes in a large company are usually under this share.
LARGE_INSIDER_CEILING = 1.0
#: Founder and management stakes above this are common in smaller companies.
SMALL_INSIDER_COMMON = 5.0
#: Days after the quarter ends that a 13F may be filed.
FILING_LAG_DAYS = 45
#: Thresholds for describing a holder's change, in percent of its own position.
SMALL_CHANGE = 5.0
LARGE_CHANGE = 15.0

#: Figures the paragraph may always use: the reference bands above, "13F", and small
#: counts ("the top five", "two of them").
ALWAYS_ALLOWED_NUMBERS: frozenset[float] = frozenset(
    {float(n) for n in range(0, 13)}
    | {
        LARGE_INSTITUTIONAL_BAND[0],
        LARGE_INSTITUTIONAL_BAND[1],
        LARGE_INSIDER_CEILING,
        SMALL_INSIDER_COMMON,
        float(FILING_LAG_DAYS),
        SMALL_CHANGE,
        LARGE_CHANGE,
        13.0,
        100.0,
    }
)

#: Implied market value bands, in dollars.
SIZE_BANDS: tuple[tuple[float, str], ...] = (
    (200e9, "mega"),
    (10e9, "large"),
    (2e9, "mid"),
    (0.0, "small"),
)
SIZE_PHRASES: dict[str, str] = {
    "mega": "one of the largest listed companies",
    "large": "a large company",
    "mid": "a mid-sized company",
    "small": "a smaller company",
}


def spell_date(value: Optional[str]) -> str:
    """'2026-06-30' as '30 June 2026', so the model is not tempted by ISO order."""
    if not value:
        return "an unknown date"
    m = _DATE.match(str(value))
    if not m:
        return str(value)
    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not 1 <= month <= 12:
        return str(value)
    return f"{day} {_MONTHS[month - 1]} {year}"


def as_percent(fraction: Any) -> Optional[float]:
    """A stored fraction (0.863) as the percent the tab prints (86.3).

    Two decimals under one percent, so an insider stake of 0.04 percent is not flattened
    to zero; one decimal otherwise, matching the tab.
    """
    if fraction is None or isinstance(fraction, bool):
        return None
    try:
        pct = float(fraction) * 100
    except (TypeError, ValueError):
        return None
    return round(pct, 2) if abs(pct) < 1 else round(pct, 1)


def _join(names: list[str]) -> str:
    """'A', 'A and B', 'A, B and C'."""
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def trim(number: Any) -> str:
    """A number as the paragraph prints it: no trailing zeros."""
    if number is None:
        return "unknown"
    text = f"{float(number):.2f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-0") else "0"


# ── holder style ─────────────────────────────────────────────────────────────

class HolderStyleClassifier:
    """Tags a 13F filer as an index house, an active manager, or unclassified.

    Matched on the filer name yfinance returns ("Vanguard Group Inc", "Price (T.Rowe)
    Associates Inc"). Only firms whose 13F is dominated by one style are listed; a firm
    that runs both at scale (FMR, JPMorgan, Morgan Stanley, the banks) is left
    unclassified, and the prompt forbids the model from guessing either way.
    """

    INDEX = "index"
    ACTIVE = "active"
    UNCLASSIFIED = "unclassified"

    INDEX_NAMES: tuple[str, ...] = (
        "vanguard",
        "blackrock",
        "state street",
        "geode capital",
        "northern trust",
        "invesco",
    )
    ACTIVE_NAMES: tuple[str, ...] = (
        "capital research",
        "capital world",
        "capital international",
        "price (t.rowe)",
        "t. rowe price",
        "t.rowe price",
        "wellington",
        "primecap",
        "baillie gifford",
        "dodge & cox",
        "jennison",
        "harris associates",
    )

    def classify(self, name: Optional[str]) -> str:
        key = (name or "").lower()
        if any(n in key for n in self.INDEX_NAMES):
            return self.INDEX
        if any(n in key for n in self.ACTIVE_NAMES):
            return self.ACTIVE
        return self.UNCLASSIFIED


STYLE_PHRASES: dict[str, str] = {
    HolderStyleClassifier.INDEX: (
        "mostly index funds: it owns the stock because the stock sits in the indexes its"
        " funds track, not because anyone chose it"
    ),
    HolderStyleClassifier.ACTIVE: (
        "an active manager: its analysts choose which stocks to own, so its moves reflect"
        " a decision"
    ),
    # Deliberately empty: a firm running both kinds of money gets no style line at all,
    # because a label the model is told not to use still leaks ("is not classified").
    HolderStyleClassifier.UNCLASSIFIED: "",
}


def change_size(pct_change: Optional[float]) -> Optional[str]:
    """How large a holder's change in its own position was, in words."""
    if pct_change is None:
        return None
    size = abs(pct_change)
    if size == 0:
        return "unchanged"
    if size < SMALL_CHANGE:
        return "a small change"
    if size < LARGE_CHANGE:
        return "a moderate change"
    return "a large change"


# ── evidence ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class HolderFact:
    name: str
    style: str
    #: Percent of the company this holder owns.
    pct_held: Optional[float]
    #: Percent change in the holder's OWN position in the latest filing.
    pct_change: Optional[float]

    @property
    def change_size(self) -> Optional[str]:
        return change_size(self.pct_change)

    def as_dict(self) -> dict[str, Any]:
        return {
            "holder": self.name,
            "style": self.style,
            "pct_held": self.pct_held,
            "pct_change": self.pct_change,
        }


@dataclass(frozen=True)
class InstitutionalEvidence:
    """One ticker's ownership, as the trace is allowed to see it.

    Assembled once so the prompt, the guard, the template and the stored fingerprint all
    read the same object.
    """

    ticker: str
    institutions_pct: Optional[float]
    institutions_count: Optional[int]
    insiders_pct: Optional[float]
    as_of: Optional[str]
    size_band: Optional[str]
    holders: tuple[HolderFact, ...] = field(default_factory=tuple)

    # -- construction --------------------------------------------------------

    @classmethod
    def from_payload(
        cls,
        ticker: str,
        payload: dict,
        top_n: int,
        classifier: Optional[HolderStyleClassifier] = None,
    ) -> "InstitutionalEvidence":
        classifier = classifier or HolderStyleClassifier()
        raw_holders = [h for h in (payload.get("holders") or []) if h.get("holder")]
        holders = tuple(
            HolderFact(
                name=str(h["holder"]),
                style=classifier.classify(h["holder"]),
                pct_held=as_percent(h.get("pct_held")),
                pct_change=as_percent(h.get("pct_change")),
            )
            for h in raw_holders[:top_n]
        )
        count = payload.get("institutions_count")
        return cls(
            ticker=ticker.upper(),
            institutions_pct=as_percent(payload.get("institutions_pct")),
            institutions_count=int(count) if count is not None else None,
            insiders_pct=as_percent(payload.get("insiders_pct")),
            # The same as-of date the tab prints: the first holder's report date.
            as_of=(raw_holders[0].get("date_reported") if raw_holders else None),
            size_band=cls._size_band(raw_holders),
            holders=holders,
        )

    @staticmethod
    def _size_band(raw_holders: list[dict]) -> Optional[str]:
        """The company's size, inferred from a holding: value / share of company.

        No extra call: a holder worth $360bn that owns 7.8 percent implies a company
        worth about $4.6tn. Only the band is kept, so a price move between refetches
        does not change the fingerprint unless it crosses a band.
        """
        for h in raw_holders:
            value, share = h.get("value"), h.get("pct_held")
            try:
                if value and share and float(share) > 0:
                    implied = float(value) / float(share)
                    return next(name for floor, name in SIZE_BANDS if implied >= floor)
            except (TypeError, ValueError, StopIteration):
                continue
        return None

    # -- derived verdicts ----------------------------------------------------

    @property
    def is_large(self) -> bool:
        return self.size_band in ("mega", "large")

    @property
    def example_holder(self) -> Optional[HolderFact]:
        """The holder whose change illustrates what a percentage change means.

        An active manager's change carries information, so it is the example when there
        is one; then an index holder's; an unlabelled holder only when nobody else
        changed. Chosen here, not by the model: asked to "prefer an active manager", the
        model went looking for one and gave the label to a holder that had none.
        """
        changed = [h for h in self.holders if h.pct_change]
        for style in (HolderStyleClassifier.ACTIVE, HolderStyleClassifier.INDEX):
            match = next((h for h in changed if h.style == style), None)
            if match is not None:
                return match
        return changed[0] if changed else None

    @property
    def has_evidence(self) -> bool:
        return self.institutions_pct is not None or bool(self.holders)

    def institutional_verdict(self) -> str:
        """Whether the institutional share is usual for a company this size, in words."""
        pct = self.institutions_pct
        if pct is None:
            return "not reported"
        low, high = LARGE_INSTITUTIONAL_BAND
        if not self.is_large:
            return "hard to judge, as ownership varies widely among smaller companies"
        if pct < low:
            return f"below the {trim(low)} to {trim(high)} percent usual for a large US company"
        if pct > high:
            return f"above the {trim(low)} to {trim(high)} percent usual for a large US company"
        return (
            f"inside the {trim(low)} to {trim(high)} percent usual for a large US company,"
            " so widely held rather than specially endorsed"
        )

    def insider_verdict(self) -> str:
        pct = self.insiders_pct
        if pct is None:
            return "not reported"
        if self.is_large:
            if pct < LARGE_INSIDER_CEILING:
                return f"normal, as under {trim(LARGE_INSIDER_CEILING)} percent is usual at this size"
            return (
                f"higher than the under {trim(LARGE_INSIDER_CEILING)} percent usual at this size,"
                " often a founder or family stake"
            )
        return (
            f"common in smaller companies, where founder stakes above"
            f" {trim(SMALL_INSIDER_COMMON)} percent are usual"
        )

    # -- guard inputs --------------------------------------------------------

    def numbers(self) -> set[float]:
        """Every figure the paragraph may quote, as magnitudes."""
        allowed: set[float] = set(ALWAYS_ALLOWED_NUMBERS)
        for value in (self.institutions_pct, self.insiders_pct, self.institutions_count):
            if value is not None:
                allowed.add(abs(float(value)))
        for h in self.holders:
            for value in (h.pct_held, h.pct_change):
                if value is not None:
                    allowed.add(abs(float(value)))
        m = _DATE.match(self.as_of or "")
        if m:
            allowed.update({float(m.group(1)), float(m.group(2)), float(m.group(3))})
        return allowed

    def facts(self) -> dict[str, Any]:
        """What the trace was written FROM, stored beside it."""
        return {
            "version": TRACE_VERSION,
            "institutions_pct": self.institutions_pct,
            "institutions_count": self.institutions_count,
            "insiders_pct": self.insiders_pct,
            "as_of": self.as_of,
            "size_band": self.size_band,
            "holders": [h.as_dict() for h in self.holders],
        }

    def fingerprint(self) -> str:
        canonical = json.dumps(self.facts(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── the guard ────────────────────────────────────────────────────────────────

class InstitutionalTraceGuard:
    """Refuses a paragraph that says more than its facts, or says what to do."""

    #: A whole number may round a figure to the nearest unit ("about 86 percent" for
    #: 86.3); a number written with decimals must match to its last decimal.
    WHOLE_TOLERANCE = 0.51
    DECIMAL_TOLERANCE = 0.051

    def __init__(self, config: Optional[WhaleConfig] = None):
        self.config = config or WhaleConfig.from_env()

    def check(self, text: str, evidence: InstitutionalEvidence) -> Optional[str]:
        """The reason a paragraph fails, or None when it passes."""
        if len(text) < self.config.institutions_trace_min_chars:
            return f"too short ({len(text)} chars)"
        if len(text) > self.config.institutions_trace_max_chars:
            return f"over the {self.config.institutions_trace_max_chars} char limit ({len(text)} chars)"
        closing = _SENTENCES.split(text.strip())[-1]
        if not closing.lower().startswith(CLOSING_OPENER.lower()):
            return f'last sentence does not start "{CLOSING_OPENER}"'
        advice = _CLOSING_FORBIDDEN.search(closing)
        if advice:
            return f"closing sentence uses '{advice.group(0)}'"
        guessed = self.guessed_style(text, evidence)
        if guessed:
            return f"gives a style to unclassified holder '{guessed}'"
        body = self.without_names(text, evidence)
        for pattern in FORBIDDEN_PATTERNS:
            hit = pattern.search(body)
            if hit:
                return f"uses forbidden term '{hit.group(0)}'"
        stray = self.ungrounded_numbers(body, evidence)
        if stray:
            return f"quotes numbers not in the facts: {', '.join(stray)}"
        return None

    _SENTENCE = re.compile(r"(?<=[.;!?])\s+")
    _STYLE_WORDS = re.compile(r"\b(active|index|passive|stock picker)", re.IGNORECASE)

    def guessed_style(self, text: str, evidence: InstitutionalEvidence) -> Optional[str]:
        """An unclassified holder named in the same sentence as a style word.

        Seen live: told nothing about FMR, the model reasoned "not an index fund, so an
        active manager". A sentence that names such a holder and a style is refused;
        naming it only to quote its change is fine.
        """
        unclassified = [h.name for h in evidence.holders if h.style == HolderStyleClassifier.UNCLASSIFIED]
        if not unclassified:
            return None
        for sentence in self._SENTENCE.split(text):
            lowered = sentence.lower()
            for name in unclassified:
                if name.lower() in lowered and self._STYLE_WORDS.search(sentence):
                    return name
        return None

    @staticmethod
    def without_names(text: str, evidence: InstitutionalEvidence) -> str:
        """The text with the holders' own names blanked out.

        Filer names are data, not the model's words, and they trip both checks: "Some
        Advisers LLC" is not advice, and "1832 Asset Management" is not a figure.
        """
        for h in sorted(evidence.holders, key=lambda h: len(h.name), reverse=True):
            text = re.sub(re.escape(h.name), "the fund", text, flags=re.IGNORECASE)
        return text

    def ungrounded_numbers(self, text: str, evidence: InstitutionalEvidence) -> list[str]:
        allowed = evidence.numbers()
        stray: list[str] = []
        for token in _NUMBER.findall(text):
            cleaned = token.replace(",", "").replace("−", "-")
            try:
                value = abs(float(cleaned))
            except ValueError:
                continue
            tolerance = self.DECIMAL_TOLERANCE if "." in cleaned else self.WHOLE_TOLERANCE
            if not any(abs(value - a) <= tolerance for a in allowed):
                stray.append(token)
        return stray


# ── the prompt ───────────────────────────────────────────────────────────────

class InstitutionalTracePromptBuilder:
    """Turns one ticker's evidence into the prompt. Pure, no I/O.

    The reader can already see every figure on the tab, so the paragraph's job is to say
    what they mean, not to read them back. The meanings are worked out here in plain
    words (``PlainMeaning``) and the model only puts them into sentences: every time it
    was left to judge a figure or a holder itself, it guessed.

    Same length as the Quant and Sentiment summaries: four or five sentences, no more
    than 110 words.
    """

    def __init__(self, plain: "PlainMeaning | None" = None):
        self.plain = plain or PlainMeaning()

    def build(self, evidence: InstitutionalEvidence) -> str:
        meanings = self.plain.lines(evidence)
        meaning_block = "\n".join(f"- {line}" for line in meanings)
        return f"""You are writing a short explanation for a beginner using a retail investing app in South Africa. They are looking at the "Big investors" tab for {evidence.ticker}, which shows the big investment firms that own the stock. They can already see every number on the screen. Your job is not to repeat those numbers. It is to tell them, in everyday words, what the numbers mean for them.

What the numbers mean, already worked out for you:
{meaning_block}

Write four or five sentences, no more than 110 words in total, as one paragraph with no headings, no bullet points and no title.

Cover, in whatever order reads best:
- What it means that big investment firms own this much of the company, and what the insiders' share means.
- What kind of owners the biggest ones are, and why that matters.
- What the example change means, if one is given above.
- End with one sentence that starts "{CLOSING_OPENER}" and tells the reader how they can use this when making their own decision: {self.plain.next_step(evidence)} It is about what to look into, never about what to do with the shares.

Rules you must follow:
- Explain, do not report. Do not repeat the figures from the screen. Use at most one number in the whole paragraph, and prefer words like "most", "a tiny slice" or "about a quarter".
- Write for someone who has never invested: short sentences and everyday words. Say "big investment firms" rather than "institutions", and "holding" rather than "position" or "stake". If you mention an index fund, say in the same sentence what it is.
- Use ONLY what is given above. You know nothing else about {evidence.ticker} or these firms. Refer to the company only as {evidence.ticker}.
- Keep each meaning exactly as given. Never call something normal, usual, small or large unless the meaning above says so.
- Call a firm an index fund or a stock picker only if it is described as one above.
- This is not financial advice. Never tell the reader what to do, judge whether the stock is worth owning, or say what the price will do. Do not use the words should, must, expect, recommend, undervalued, overvalued, opportunity, outlook, bullish, bearish, cheap, expensive or good investment.
- Write British English in a plain, friendly, level voice, with no filler openers like "Overall".
- Never use a dash of any kind as punctuation. Use a comma, a full stop or a rewrite.
- Plain prose only, no markdown.

Write only the paragraph itself."""


class PlainMeaning:
    """What each figure on the tab means, in words a beginner can use.

    Shared by the prompt and the template, so the model's paragraph and the fallback
    explain the same things the same way. Numbers are turned into words ("about a
    quarter", "a tiny slice") because the reader already has the digits.
    """

    def lines(self, evidence: InstitutionalEvidence) -> list[str]:
        labelled = [
            ("Big investment firms", self.institutions(evidence)),
            ("The company's own bosses and directors", self.insiders(evidence)),
            ("The biggest owners", self.holders(evidence)),
            ("The example change", self.example(evidence)),
        ]
        return [f"{label}: {text}" for label, text in labelled if text]

    @staticmethod
    def institutions(evidence: InstitutionalEvidence) -> str:
        pct = evidence.institutions_pct
        if pct is None:
            return ""
        low, high = LARGE_INSTITUTIONAL_BAND
        # The amount in words, decided here. Left to itself the model called 41 percent
        # "a small part".
        amount = ownership_in_words(pct)
        if evidence.size_band is None:
            # Size is inferred from the holders' values; without them it is unknown, and
            # calling the company "smaller" would be a guess.
            return (
                f"they own {amount} of it, but without the company's size there is no normal"
                " level to compare it with, so on its own it says little."
            )
        if not evidence.is_large:
            return (
                f"they own {amount} of it, but smaller companies vary so much that there is no"
                " normal level to compare it with, so on its own it says little."
            )
        if pct < low:
            return (
                f"they own {amount} of it, but less than is usual for a company this big, so"
                " ordinary investors and others own more of it than is typical."
            )
        if pct > high:
            return (
                f"they own {amount} of it, even more than usual, so the price can swing a lot"
                " when these big firms change their holdings at the same time."
            )
        return (
            "they own most of it, which is normal for a big, well known company: it sits in"
            " the market indexes that pension and index funds follow, so it shows the"
            " company is mainstream, not that experts are backing it."
        )

    @staticmethod
    def insiders(evidence: InstitutionalEvidence) -> str:
        pct = evidence.insiders_pct
        if pct is None:
            return ""
        if evidence.is_large:
            if pct < LARGE_INSIDER_CEILING:
                return "they own only a tiny slice, which is normal when a company is this big."
            return (
                "they still own a noticeable slice, which is unusual at this size and often"
                " means a founder or family is still involved."
            )
        slice_ = insider_slice_in_words(pct)
        if pct >= SMALL_INSIDER_COMMON and evidence.size_band is not None:
            return f"they own {slice_}, which is common in smaller, founder led companies."
        # Below the founder-stake level, or size unknown: say how much, claim nothing.
        return f"they own {slice_}."

    @staticmethod
    def holders(evidence: InstitutionalEvidence) -> str:
        index = [h for h in evidence.holders if h.style == HolderStyleClassifier.INDEX]
        active = [h.name for h in evidence.holders if h.style == HolderStyleClassifier.ACTIVE]
        parts: list[str] = []
        if index:
            parts.append(index_funds_in_words(len(index), len(evidence.holders)))
        if active:
            if len(active) == 1:
                parts.append(f"{active[0]} is a stock picker, so its moves show a real decision.")
            else:
                parts.append(f"{_join(active)} are stock pickers, so their moves show a real decision.")
        return " ".join(parts)

    @staticmethod
    def next_step(evidence: InstitutionalEvidence) -> str:
        """What the reader can do with this when making their own decision.

        Chosen from the situation, never left to the model, and always something to look
        into rather than something to do with the shares: the other tabs on this page are
        the concrete places to look. Written to follow "So this means".
        """
        example = evidence.example_holder
        picker_moved = example is not None and example.style == HolderStyleClassifier.ACTIVE
        if picker_moved and example.pct_change < 0:
            step = "it is worth checking the news on the Sentiment tab to see why a stock picker cut back before you decide"
        elif picker_moved:
            step = "a stock picker adding is worth noting, so see whether the Sentiment and Quant tabs tell the same story before you decide"
        else:
            step = "these owners say more about the company's size than how it is doing, so the Sentiment and Quant tabs tell you more about the business"
        # The crowded-ownership risk is not repeated here: the institutions meaning
        # already says the price can swing, and saying it twice cost the most words.
        return step + "."

    @staticmethod
    def example(evidence: InstitutionalEvidence) -> str:
        h = evidence.example_holder
        if h is None:
            return ""
        return (
            f"{h.name} {change_in_words(h.pct_change)}, measured against its own earlier"
            " holding, not against the whole company."
        )


def index_funds_in_words(index_count: int, holder_count: int) -> str:
    """How many of the top holders are index funds, and what that means, with the
    grammar matching the count.

    Every count is handled, not just the common one. CSCO's top five are all index funds
    (Vanguard files as two firms), and the first version, knowing only "most" and "some",
    told the reader "most".
    """
    why_plural = (
        "which automatically hold every company in a market index, so they own it because"
        " of its size, not because anyone picked it."
    )
    why_single = (
        "which automatically holds every company in a market index, so it owns it because"
        " of its size, not because anyone picked it."
    )
    if index_count == holder_count == 1:
        return f"it is an index fund, {why_single}"
    if index_count == holder_count:
        return f"all of them are index funds, {why_plural}"
    if index_count == 1:
        return f"one is an index fund, {why_single}"
    if index_count * 2 > holder_count:
        return f"most are index funds, {why_plural}"
    return f"some are index funds, {why_plural}"


def insider_slice_in_words(pct: float) -> str:
    """How much the company's own bosses and directors own, as a beginner would say it."""
    for ceiling, words in ((1, "only a tiny slice"), (5, "a small slice"), (20, "a meaningful slice")):
        if pct < ceiling:
            return words
    return "a large slice"


def ownership_in_words(pct: float) -> str:
    """How much of a company big investment firms own, as a beginner would say it."""
    for ceiling, words in ((10, "a small share"), (25, "some"), (50, "a large share"), (75, "most")):
        if pct < ceiling:
            return words
    return "nearly all"


def change_in_words(pct_change: float) -> str:
    """A holder's percentage change as a beginner would say it."""
    if pct_change >= 100:
        return "more than doubled its holding"
    size = abs(pct_change)
    if pct_change < 0 and size >= 85:
        return "cut almost all of its holding"
    for ceiling, words in (
        (5, "a little"),
        (15, "a modest amount"),
        (20, "about a sixth"),
        (30, "about a quarter"),
        (40, "about a third"),
        (55, "about half"),
        (70, "about two thirds"),
        (85, "about three quarters"),
    ):
        if size < ceiling:
            break
    else:
        words = "a lot"
    verb = "added to" if pct_change > 0 else "cut"
    return f"{verb} its holding by {words}"


# ── the template ─────────────────────────────────────────────────────────────

class InstitutionalTraceTemplate:
    """The deterministic trace, from the same facts. What the reader gets when the model
    cannot be used, and proof the trace can be written without saying anything more."""

    def render(self, evidence: InstitutionalEvidence) -> str:
        plain = PlainMeaning()
        sentences: list[str] = []
        owners = plain.institutions(evidence)
        if owners:
            sentences.append(
                owners.replace("they own", f"Big investment firms own", 1).replace(
                    "of it", f"of {evidence.ticker}", 1
                )
            )
        insiders = plain.insiders(evidence)
        if insiders:
            sentences.append(insiders.replace("they", "The company's own bosses", 1))
        holders = plain.holders(evidence)
        if holders:
            if holders.startswith("it is "):
                sentences.append("The biggest owner is " + holders[len("it is "):])
            else:
                sentences.append(f"Of the biggest owners, {holders}")
        example = plain.example(evidence)
        if example:
            sentences.append(example)
        sentences.append(f"{CLOSING_OPENER} {plain.next_step(evidence)}")
        return " ".join(sentences)


# ── the generator ────────────────────────────────────────────────────────────

class InstitutionalTraceGenerator:
    """Asks the model for the trace, and refuses anything the facts do not support."""

    #: The lane the day summaries and the Quant trace use: generated while somebody is
    #: reading a page, so kept off the lanes the run's trace pool and discovery are on.
    KEY_ENV = "GROQ_API_KEY4"
    FALLBACK_KEY_ENV = "GROQ_API_KEY"

    MAX_TOKENS = 2400
    TEMPERATURE = 0.3
    RETRIES = 2
    BACKOFF_SECONDS = (1.0, 2.0)
    #: Drafts the guard may reject before the template stands in.
    GUARD_ATTEMPTS = 2

    def __init__(
        self,
        config: Optional[WhaleConfig] = None,
        client: Any = None,
        guard: Optional[InstitutionalTraceGuard] = None,
        builder: Optional[InstitutionalTracePromptBuilder] = None,
    ):
        self.config = config or WhaleConfig.from_env()
        self.builder = builder or InstitutionalTracePromptBuilder()
        self.guard = guard or InstitutionalTraceGuard(self.config)
        self._client = client
        self._client_built = client is not None

    @property
    def client(self):
        """The Groq client, built once. None when Groq is unconfigured."""
        if not self._client_built:
            self._client_built = True
            from .llm_client import GroqClient

            self._client = GroqClient.create(
                purpose="institutions_trace",
                max_tokens=self.MAX_TOKENS,
                temperature=self.TEMPERATURE,
                key_env=self.KEY_ENV,
                fallback_key_env=self.FALLBACK_KEY_ENV,
            )
        return self._client

    @property
    def model(self) -> Optional[str]:
        client = self.client
        return client.model if client else None

    def generate(self, evidence: InstitutionalEvidence) -> Optional[str]:
        """A trace that passed the guard, or None. Never raises."""
        client = self.client
        if client is None or not evidence.has_evidence:
            return None
        prompt = self.builder.build(evidence)
        # A rejected paragraph is asked for once more before the template stands in.
        # Seen live: about one reply in six slips a banned word ("buy", "expect") into an
        # otherwise good paragraph, and a second draw almost always comes back clean. It
        # is one extra call at most, once per filing.
        for attempt in range(self.GUARD_ATTEMPTS):
            text = self._complete(client, prompt, evidence.ticker)
            if text is None:
                return None
            trace = self.tidy(text)
            reason = self.guard.check(trace, evidence)
            if not reason:
                return trace
            logger.info(
                "Institutions trace for %s rejected (attempt %d): %s",
                evidence.ticker, attempt + 1, reason,
            )
        return None

    @staticmethod
    def tidy(text: str) -> str:
        """House style per paragraph. HOUSE_STYLE collapses whitespace, which would
        otherwise fold the two paragraphs into one."""
        text = _SPACED_THOUSANDS.sub(",", text or "")
        paragraphs = [HOUSE_STYLE.apply(p) for p in re.split(r"\n\s*\n", text)]
        return "\n\n".join(p for p in paragraphs if p)

    def _complete(self, client, prompt: str, ticker: str) -> Optional[str]:
        for attempt in range(self.RETRIES + 1):
            try:
                return client.complete(prompt)
            except Exception as e:
                if attempt >= self.RETRIES:
                    logger.warning(
                        "Institutions trace generation failed for %s after %d attempts: %s",
                        ticker, attempt + 1, e,
                    )
                    return None
                time.sleep(self.BACKOFF_SECONDS[min(attempt, len(self.BACKOFF_SECONDS) - 1)])
        return None


# ── the store ────────────────────────────────────────────────────────────────

class InstitutionalTraceRepository:
    """Reads and writes the trace columns on the institutional cache row."""

    TABLE = "institutional_holders_cache"
    READ_COLUMNS = "ticker, trace, trace_source, trace_model, trace_fingerprint, trace_generated_at"

    def __init__(self, client: Any = None):
        self._client_override = client

    def _client(self):
        # Imported on call: supabase_client raises at import when its env vars are
        # missing, and that must degrade the trace rather than break the module.
        if self._client_override is not None:
            return self._client_override
        from .supabase_client import supabase

        return supabase

    def read(self, ticker: str) -> Optional[dict]:
        try:
            res = (
                self._client()
                .table(self.TABLE)
                .select(self.READ_COLUMNS)
                .eq("ticker", ticker.upper())
                .limit(1)
                .execute()
            )
            rows = res.data or []
            return rows[0] if rows else None
        except Exception as e:
            logger.info("Institutions trace read failed for %s: %s", ticker, e)
            return None

    def write(self, ticker: str, row: dict) -> None:
        """Update the trace columns only. The payload row already exists: the tab's own
        request wrote it before the trace was asked for."""
        try:
            self._client().table(self.TABLE).update(row).eq("ticker", ticker.upper()).execute()
        except Exception as e:
            logger.warning("Institutions trace write failed for %s: %s", ticker, e)


# ── the service ──────────────────────────────────────────────────────────────

class InstitutionalTraceService:
    """Serves a ticker's trace, writing it only when the facts behind it have changed."""

    #: A templated trace stood in because the model could not. It is served as is for
    #: this long, then the model is tried once more; without a limit a Groq outage
    #: would pin the template until the next filing.
    TEMPLATE_RETRY = datetime.timedelta(hours=24)

    def __init__(
        self,
        config: Optional[WhaleConfig] = None,
        repository: Optional[InstitutionalTraceRepository] = None,
        generator: Optional[InstitutionalTraceGenerator] = None,
        template: Optional[InstitutionalTraceTemplate] = None,
        classifier: Optional[HolderStyleClassifier] = None,
        now: Any = None,
    ):
        self.config = config or WhaleConfig.from_env()
        self.repository = repository or InstitutionalTraceRepository()
        self.generator = generator or InstitutionalTraceGenerator(self.config)
        self.template = template or InstitutionalTraceTemplate()
        self.classifier = classifier or HolderStyleClassifier()
        self._now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))

    @property
    def enabled(self) -> bool:
        return self.config.institutions_trace_enabled

    def evidence_for(self, ticker: str, payload: dict) -> InstitutionalEvidence:
        return InstitutionalEvidence.from_payload(
            ticker, payload or {}, self.config.institutions_trace_holders, self.classifier
        )

    def trace_for(self, ticker: str, payload: dict) -> Optional[dict]:
        """The trace for this payload, generating it only if needed. Never raises."""
        if not self.enabled:
            return None
        try:
            return self._trace_for(ticker.upper(), payload)
        except Exception as e:
            logger.warning("Institutions trace lookup failed for %s: %s", ticker, e)
            return None

    def _trace_for(self, sym: str, payload: dict) -> Optional[dict]:
        evidence = self.evidence_for(sym, payload)
        if not evidence.has_evidence:
            return None
        fingerprint = evidence.fingerprint()

        stored = self.repository.read(sym)
        if self._reusable(stored, fingerprint):
            return self._point(stored, evidence)

        text = self.generator.generate(evidence)
        source = "model"
        if not text:
            text = self.template.render(evidence)
            source = "template"

        row = {
            "trace": text,
            "trace_source": source,
            "trace_model": self.generator.model if source == "model" else None,
            "trace_fingerprint": fingerprint,
            "trace_facts": evidence.facts(),
            "trace_generated_at": self._now().isoformat(),
        }
        self.repository.write(sym, row)
        logger.info("Generated %s institutions trace for %s", source, sym)
        return self._point(row, evidence)

    def _reusable(self, stored: Optional[dict], fingerprint: str) -> bool:
        if not stored or not stored.get("trace") or stored.get("trace_fingerprint") != fingerprint:
            return False
        if stored.get("trace_source") != "template":
            return True
        generated = self._parse_time(stored.get("trace_generated_at"))
        return generated is not None and self._now() - generated < self.TEMPLATE_RETRY

    @staticmethod
    def _parse_time(value: Any) -> Optional[datetime.datetime]:
        if not value:
            return None
        try:
            return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None

    @staticmethod
    def _point(row: dict, evidence: InstitutionalEvidence) -> dict:
        return {
            "trace": row.get("trace"),
            "source": row.get("trace_source"),
            "model": row.get("trace_model"),
            "generated_at": row.get("trace_generated_at"),
            "as_of": evidence.as_of,
        }
