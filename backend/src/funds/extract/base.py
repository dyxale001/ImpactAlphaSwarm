"""Reading a fact sheet, and saying what was read and what was not.

The catalogue's claim is that every figure came off a document a manager
published. Extraction does not weaken that claim, but it changes who checks it:
a person still approves every figure, and this decides what they are shown
before they do.

Three shapes, and the design is in the third:

``Reading`` is a value **and the text it came from**. A number without its
source cannot be checked without opening the PDF, which is exactly the work the
reviewer is here to do.

``Unresolved`` is a field the template deliberately did not read, with the
reason. This is the important one. A pre-filled wrong value invites a nod; a
blank forces a decision. Where a manager draws the risk profile as a graphic —
Satrix does — the text layer contains every step label whatever the rating, so a
text match returns a confident wrong answer. That mistake put the wrong rating
for the Satrix 40 ETF into this catalogue and into two documents before anyone
looked at the picture. The template must refuse rather than guess.

``Extraction`` is what the admin form receives: values to pre-fill, evidence to
show beside them, and the list of things the reviewer has to supply themselves.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

# How much of the surrounding text to keep as evidence. Long enough to recognise
# the line on the sheet, short enough to sit beside a form field.
EVIDENCE_WINDOW = 90


class ExtractError(Exception):
    """A reading could not be attempted, with a reason worth showing an admin.

    One base class so the endpoint has one thing to catch, defined here rather
    than in `fetch` or `llm` because `base` is the module every reader already
    imports — a reader that must not be imported when its flag is off cannot be
    where a shared exception lives.

    Every message that reaches this is written for the person at the form, and
    says what to do meanwhile: the form is open and waiting either way.
    """


@dataclass(frozen=True)
class Reading:
    """One field read off a sheet, with the text it was read from."""

    field: str
    value: Any
    evidence: str


@dataclass(frozen=True)
class Unresolved:
    """One field the template did not read, and why it did not."""

    field: str
    reason: str


@dataclass(frozen=True)
class Extraction:
    """Everything one sheet yielded, ready for a human to check."""

    template: str
    url: str
    readings: tuple[Reading, ...] = ()
    unresolved: tuple[Unresolved, ...] = ()

    @property
    def fields(self) -> dict[str, Any]:
        return {r.field: r.value for r in self.readings}

    @property
    def evidence(self) -> dict[str, str]:
        return {r.field: r.evidence for r in self.readings}

    def as_dict(self) -> dict[str, Any]:
        return {
            "template": self.template,
            "url": self.url,
            "fields": self.fields,
            "evidence": self.evidence,
            "unresolved": [{"field": u.field, "reason": u.reason} for u in self.unresolved],
        }


class FactsheetTemplate(ABC):
    """How one management company lays out its Minimum Disclosure Document.

    One template per ManCo rather than per brand: FundRock issues on a single
    template for around thirty boutiques, so one of these covers most of the
    catalogue. A subclass supplies patterns and declares what it cannot read.
    """

    #: Names this template in the result, so a reviewer knows what read the sheet.
    name: str = "unknown"

    #: Hosts this template applies to. Also the fetch allowlist — see fetch.py.
    hosts: tuple[str, ...] = ()

    #: field -> regex with one capturing group, or a tuple of them tried in
    #: order. Order matters where a sheet prints the same figure twice: Satrix
    #: shows both a historic TER and one marked effective from a date, and the
    #: effective one is what its own TIC row reflects. Regex alternation cannot
    #: express that preference, because it matches whichever comes first in the
    #: document rather than whichever is listed first.
    patterns: dict[str, str | tuple[str, ...]] = {}

    #: Fields whose values are numbers rather than text.
    numeric: frozenset[str] = frozenset()

    #: Fields that are dates. Sheets print them as "31 JULY 2026" or "31 July
    #: 2026"; the schema, the validators and the form all want YYYY-MM-DD, so
    #: they are converted here rather than left for a person to retype — which
    #: is both the tedious kind of work this exists to remove and a place to
    #: introduce a typo into the one field every other figure is dated by.
    dates: frozenset[str] = frozenset()

    #: Regex flags. Deliberately NOT re.I: these patterns anchor on labels the
    #: sheet prints in a fixed case, and matching case-insensitively makes them
    #: match prose instead. The Satrix sheet says "Benchmark FTSE/JSE
    #: Inflation-Linked Government Index" in its fund-facts block and, earlier,
    #: "...designed to track the bond benchmark and has a medium-term investment
    #: horizon" in a sentence — case-insensitively the sentence wins, and the
    #: form pre-fills a benchmark of "and has a medium-term investment horizon."
    #: A template whose manager is genuinely inconsistent can add re.I itself.
    flags: int = re.DOTALL

    #: field -> why this template will not read it. Everything named here comes
    #: back as Unresolved, always, however tempting the text layer looks.
    refuses: dict[str, str] = {}

    #: field -> (regex, reason). A value matching the regex is thrown away and
    #: reported unresolved, because the sheet said something the template cannot
    #: safely reduce to one answer.
    #:
    #: The case this exists for: a PortfolioMetrix property fund prints "Moderate
    #: Risk / Moderate- High Risk (Property Funds)" — two ratings on one line,
    #: because property funds are rated on their own scale. Whichever the pattern
    #: happens to capture, pre-filling it means putting a rating on the form that
    #: the document does not unambiguously give, and the two differ by a whole
    #: step of the ceiling that decides who is shown this fund.
    ambiguous: dict[str, tuple[str, str]] = {}

    #: field -> a resolver that snaps read text onto a closed vocabulary,
    #: returning None where the text names nothing the vocabulary covers.
    #:
    #: For fields whose value is not free text, a regex that merely *found* the
    #: label is not enough — the captured text still has to be a value the rest
    #: of the system recognises. The ASISA classification is the case: the Satrix
    #: ILBI sheet wraps "…Variable Term ILB" across two lines, and a capture that
    #: stops at the break yields a *different real category* rather than an
    #: obvious error, which nothing downstream can detect. Resolving through the
    #: vocabulary turns that into either the right answer or an honest refusal.
    vocabulary: dict[str, Any] = {}

    @abstractmethod
    def matches(self, url: str) -> bool:
        """Whether this template should be used for a URL."""

    def read(self, document: bytes, text: str, url: str) -> Extraction:
        """Read a fetched document, in whatever way this reader works.

        The seam exists because the two kinds of reader need different things. A
        pattern-matching template needs only the text layer, and `extract` is
        the whole of it. A model-based reader needs the **PDF itself**: the
        figures a text layer loses are exactly the ones printed as a graphic —
        the risk-profile scale, the allocation chart — which is most of what a
        regex has to refuse.

        Defaulting to `extract` keeps every existing template unchanged and
        means a reader that wants the bytes overrides one method.
        """
        return self.extract(text, url)

    def extract(self, text: str, url: str) -> Extraction:
        """Read what the patterns describe; refuse what this template cannot."""
        collapsed = re.sub(r"[ \t]+", " ", text.replace("\xa0", " "))

        readings: list[Reading] = []
        unresolved: list[Unresolved] = [
            Unresolved(name, reason) for name, reason in self.refuses.items()
        ]

        for name, pattern in self.patterns.items():
            if name in self.refuses:
                continue
            candidates = (pattern,) if isinstance(pattern, str) else pattern
            match = None
            for candidate in candidates:
                match = re.search(candidate, collapsed, self.flags)
                if match:
                    break
            if not match:
                unresolved.append(
                    Unresolved(name, "not found on this sheet — type it from the document")
                )
                continue

            raw = " ".join(match.group(1).split())

            check = self.ambiguous.get(name)
            if check and re.search(check[0], raw, self.flags):
                unresolved.append(Unresolved(name, check[1]))
                continue

            resolver = self.vocabulary.get(name)
            if resolver is not None:
                resolved = resolver(raw)
                if resolved is None:
                    unresolved.append(
                        Unresolved(
                            name,
                            f"{raw!r} is not a value this field recognises — pick it "
                            f"from the list on the form",
                        )
                    )
                    continue
                readings.append(Reading(name, resolved, _evidence(collapsed, match.start())))
                continue

            value: Any = raw
            if name in self.numeric:
                value = _as_number(raw)
                if value is None:
                    unresolved.append(Unresolved(name, f"{raw!r} is not a number"))
                    continue
            elif name in self.dates:
                value = _as_iso_date(raw)
                if value is None:
                    unresolved.append(
                        Unresolved(name, f"{raw!r} is not a date this reads — type it as YYYY-MM-DD")
                    )
                    continue

            readings.append(Reading(name, value, _evidence(collapsed, match.start())))

        return Extraction(
            template=self.name,
            url=url,
            readings=tuple(readings),
            unresolved=tuple(unresolved),
        )


def _evidence(text: str, at: int) -> str:
    """The line a value was read from, trimmed to something quotable."""
    start = max(0, at - 10)
    snippet = text[start : at + EVIDENCE_WINDOW]
    return " ".join(snippet.split())


def _as_iso_date(raw: str) -> Optional[str]:
    """A printed sheet date as YYYY-MM-DD.

    Handles the two forms these managers use — "31 JULY 2026" and "31 July
    2026" — and returns None for anything else rather than guessing at an
    ordering. A date read wrongly would silently misdate every other figure on
    the row.
    """
    from datetime import datetime

    cleaned = " ".join(raw.replace(",", " ").split())
    for pattern in ("%d %B %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned.title(), pattern).date().isoformat()
        except ValueError:
            continue
    return None


def _as_number(raw: str) -> Optional[float]:
    """A number out of a printed figure, tolerating % and thousands separators."""
    cleaned = raw.replace("%", "").replace(",", "").replace(" ", "").replace(" ", "")
    try:
        return float(cleaned)
    except ValueError:
        return None
