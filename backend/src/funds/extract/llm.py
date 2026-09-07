"""Reading any manager's fact sheet, without a pattern written for it first.

## Why this exists, including the argument it lost

Per-manager regex templates were defended here for a while on a number that was
not like-for-like: 94.6% was 105 of 111 fields **excluding the 19 the templates
refused to read**. Scored the way any reader would be scored — refusals counted,
because a refusal is a field the admin still has to type — the same templates
are 105/130 = 80.8%. That is statistically the same as a model reading the same
six sheets, which attempted *every* field including the three printed as
graphics that a regex cannot touch at all. The model was also more correct than
the templates twice: it read `Variable Term ILB` where the pattern truncated at
a line break, and it read the fund size from `Portfolio Value R362 million`
where the template refused with a reason that was false.

So templates are not more accurate. They are more **deterministic**, and those
two properties were being conflated. `cached_reading` is what buys the
determinism back: the same document gives the same answer forever.

## What keeps it honest

Three guards, and the second is the one doing the work.

**Refusal is a first-class answer.** The reader is told to leave a field
unresolved with a reason rather than guess, and the fields it must refuse are
named — a risk rating drawn as a filled step on a scale is the standing example,
because the text layer of such a sheet contains every step label whatever the
rating. That mistake put AGGRESSIVE-rated Satrix 40 into this catalogue as
"publishes no risk indicator".

**Every value must arrive with the line it came from, and we check the line is
really in the document.** Not by trusting a citation object — by normalising
whitespace and looking for the quote in the PDF's own text layer. A value whose
quote is not there is discarded and reported unresolved. This is what makes the
evidence beside each form field a fact rather than a claim, and it catches the
one failure mode that matters: a figure that is plausible, well-formatted, and
not on the sheet.

⚠ The check has a known limit and it is the honest half of the design: a figure
printed **only** as a graphic has no text-layer line to quote, so a correct
reading of the allocation chart or the risk scale will fail verification and be
refused. That is the safe direction to fail, and Phase 3's cropped-image review
is what lets a person confirm those instead.

**Nothing is computed.** The reader transcribes. It does not annualise, sum,
convert a percentage, or infer a category from an objective. The one arithmetic
step it is asked for is rand→cents on the NAV, because the column is cents and
managers print both, and that conversion is stated in the prompt and checked by
a validator afterwards.

## What it does not do

It does not widen the fetch allowlist. `hosts` below is a list, and a new
manager becomes readable by adding a host to it — with no pattern to write,
which is the actual unlock. Reaching a manager whose URL shape nobody has
confirmed is research, not a line of code.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Optional

from ..asisa import ASISA
from ..config import FUND_LLM_CACHE_DIR, FUND_LLM_MODEL, FUND_LLM_WORKSPACE_ID
from .base import Extraction, ExtractError, FactsheetTemplate, Reading, Unresolved

# One request per sheet, and the answer is small — a few dozen short values.
MAX_TOKENS = 8000

# How much of a quote has to match before it counts as found. A text layer
# breaks lines and doubles spaces unpredictably, so the comparison is on
# collapsed whitespace; beyond that the quote must be present, not merely
# similar. No fuzzy matching: "close to something in the document" is exactly
# the confidence this is here to withhold.
MIN_QUOTE_CHARS = 6

#: The fields this reader is asked for. Kept explicit and shared with the
#: prompt, so a field the admin form does not show cannot arrive from a model,
#: and a field the form does show cannot be silently dropped from the ask.
FIELDS: dict[str, str] = {
    "as_of": "the sheet's own as-at date, as YYYY-MM-DD",
    "isin": "the ISIN, twelve characters",
    "jse_code": "the JSE or fund code, if the sheet prints one",
    "asisa_category": (
        "the ASISA classification, verbatim and complete. It is often wrapped "
        "across two lines — include the continuation. 'Variable Term' and "
        "'Variable Term ILB' are different categories"
    ),
    "benchmark": "the benchmark index the fund measures itself against",
    "objective": "the fund's stated objective, in the manager's own words",
    "ter": "total expense ratio, as a percentage",
    "tc": "transaction cost, as a percentage",
    "tic": "total investment charge, as a percentage",
    "annual_management_fee": (
        "the manager's own annual fee (may be labelled 'Annual Management Fee' "
        "or 'Annual Service Fee'), as a percentage"
    ),
    "fee_period": (
        "'1y' or '3y' — which column the four fee figures above were taken from"
    ),
    "fund_size_zar": (
        "the fund's size in rand as a plain number. 'Portfolio Value R362 "
        "million' is 362000000"
    ),
    "nav_cpu": (
        "the net asset value per unit, IN CENTS. A sheet printing 'NAV Price "
        "R9.23' is 923; a sheet printing '183.63 cents' is 183.63"
    ),
    "nav_date": "the date that NAV was struck, as YYYY-MM-DD",
    "inception_date": "the date the fund launched, as YYYY-MM-DD",
    "distribution_frequency": "how often the fund distributes income",
    "recommended_min_term_years": (
        "the minimum term in years, only if the sheet states a NUMBER"
    ),
    "min_lump_sum": "the minimum lump sum in rand, if stated",
    "min_debit_order": "the minimum monthly debit order in rand, if stated",
    "return_high_12m": "the highest annual return the sheet publishes",
    "return_low_12m": (
        "the lowest annual return the sheet publishes. Printed in brackets when "
        "negative: (4.49) is -4.49"
    ),
    "return_extremes_basis": (
        "'rolling_12m' if the heading says rolling or non-overlapping one-year "
        "periods; 'calendar_year' if it says calendar year"
    ),
    "risk_narrative": (
        "the manager's prose describing the fund's risk, quoted. Only if it is "
        "written as sentences — not if the risk profile is only a diagram"
    ),
    "horizon_words": (
        "the manager's wording about how long to hold the fund, quoted"
    ),
    "portfolio_manager": "who manages the portfolio",
    "regulation_28": (
        "true or false, only if the sheet states Regulation 28 compliance"
    ),
}

NUMERIC = frozenset({
    "ter",
    "tc",
    "tic",
    "annual_management_fee",
    "fund_size_zar",
    "nav_cpu",
    "recommended_min_term_years",
    "min_lump_sum",
    "min_debit_order",
    "return_high_12m",
    "return_low_12m",
})

BOOLEAN = frozenset({"regulation_28"})

# Values that must be one of a fixed set, checked here rather than hoped for.
VOCABULARIES: dict[str, tuple[str, ...]] = {
    "fee_period": ("1y", "3y"),
    "return_extremes_basis": ("rolling_12m", "calendar_year"),
}

SYSTEM = """You transcribe South African fund fact sheets (Minimum Disclosure \
Documents) for a catalogue that shows every figure next to the document it came \
from. A person checks your reading before it is saved.

Your job is transcription, not analysis. Rules, in order of importance:

1. NEVER GUESS. If a field is not printed on the sheet, or you are not certain \
which of two printed values it is, leave it out of `readings` and put it in \
`unresolved` with a one-sentence reason a person can act on. A blank field gets \
answered by a human; a plausible wrong value gets approved.

2. QUOTE THE LINE. Every reading needs `quote`: the text as it appears on the \
sheet, copied exactly, long enough to locate but no longer than one line or two. \
The quote is verified against the document afterwards, and a reading whose quote \
is not found is thrown away. Do not paraphrase a quote to make it tidy.

3. REFUSE WHAT IS ONLY A PICTURE. Many managers draw the risk profile as a \
five-step scale with the applicable step shaded, and draw the asset allocation \
as a pie or bar chart. If a value exists only as a graphic — with no line of \
text stating it — refuse it. Do not read a risk rating off a scale whose every \
label is printed regardless of the rating.

4. COMPUTE NOTHING. Do not annualise, total, average, or infer. Do not derive a \
category from an objective. The single exception is stated in the field list: the \
NAV is recorded in cents, so a price printed in rand is multiplied by 100.

5. FEES COME FROM ONE COLUMN. Many sheets print the expense ratio, transaction \
cost, total investment charge and management fee twice, under 1-Year and 3-Year \
headings, and the figures differ. Take the 1-YEAR column and set `fee_period` to \
'1y'. If the sheet prints only one unlabelled figure, take it and set \
`fee_period` to the period the sheet's own notes describe — and if the notes do \
not say, refuse `fee_period` rather than assuming.

6. THE BEST AND WORST YEAR ARE NOT ONE STATISTIC. Some sheets publish the \
highest and lowest ANNUAL ROLLING return over separate one-year periods; others \
publish the highest and lowest CALENDAR YEAR since inception. Read the heading \
and set `return_extremes_basis` accordingly. If you cannot tell which, refuse \
all three fields.

Call `record_factsheet` exactly once."""

TOOL = {
    "name": "record_factsheet",
    "description": (
        "Record what the fact sheet states, and what it does not. Call once."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "readings": {
                "type": "array",
                "description": "One entry per field the sheet actually states.",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string", "enum": sorted(FIELDS)},
                        "value": {
                            "type": ["string", "number", "boolean"],
                            "description": "The value as printed, converted only where the field says so.",
                        },
                        "quote": {
                            "type": "string",
                            "description": "The text on the sheet this was read from, copied exactly.",
                        },
                    },
                    "required": ["field", "value", "quote"],
                },
            },
            "unresolved": {
                "type": "array",
                "description": "One entry per field the sheet does not state, or that is only a graphic.",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string", "enum": sorted(FIELDS)},
                        "reason": {
                            "type": "string",
                            "description": "One sentence a person can act on.",
                        },
                    },
                    "required": ["field", "reason"],
                },
            },
        },
        "required": ["readings", "unresolved"],
    },
}


class LlmExtractError(ExtractError):
    """The reading could not be attempted, with a reason worth showing an admin."""


def _comparable(text: str) -> str:
    """Text reduced to what a PDF's layout cannot vary.

    Whitespace collapsed and case folded. Deliberately nothing else: no
    punctuation stripping and no fuzzy distance, because every loosening here
    buys a wrong value the right to pass verification.
    """
    return " ".join(str(text or "").split()).casefold()


def _cache_path(digest: str, directory: Optional[str] = None) -> Path:
    return Path(directory or FUND_LLM_CACHE_DIR) / f"{digest}.json"


def cached_reading(digest: str, directory: Optional[str] = None) -> Optional[dict[str, Any]]:
    """A previous reading of this exact document, if one was kept.

    A missing or unreadable cache is not an error — it means the sheet gets read
    again, which costs a few cents and cannot produce a wrong answer.
    """
    path = _cache_path(digest, directory)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def store_reading(digest: str, payload: dict[str, Any], directory: Optional[str] = None) -> None:
    """Keep a reading against its document's hash. Best effort."""
    path = _cache_path(digest, directory)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    except OSError:
        pass


class LlmFactsheetReader(FactsheetTemplate):
    """A reader that opens the document instead of matching patterns in it."""

    name = "llm"

    #: Managers this reader claims. Satrix is here because its template refuses
    #: five fields — the risk rating, the allocation, the performance table and
    #: the fund size — and those refusals are exactly what a reader that can see
    #: the page handles better. FundRock is NOT here: its template is written,
    #: free, covers most of the catalogue, and disagreement between it and this
    #: reader on the same sheet is a signal worth being able to see.
    #:
    #: Adding a manager is one line, with no pattern to write. It is still a
    #: deliberate act: this list is also the fetch allowlist, so a host here can
    #: be downloaded from.
    hosts = ("satrix.co.za", "www.satrix.co.za")

    def __init__(
        self,
        client: Any = None,
        model: str = FUND_LLM_MODEL,
        cache_dir: Optional[str] = None,
    ):
        # The client is injected so the tests can drive this with a fake and
        # never reach the network, and so a caller can pass a configured one.
        self._client = client
        self.model = model
        self.cache_dir = cache_dir

    def matches(self, url: str) -> bool:
        return any(host in url.lower() for host in self.hosts)

    # ── the text-only path, which this reader does not have ─────────────────

    def extract(self, text: str, url: str) -> Extraction:
        """Refuse everything, with the reason.

        Reachable only if something calls the text-layer seam on this reader —
        which would mean the PDF was not passed through. Returning an honest
        refusal rather than raising keeps that a visible gap in the form rather
        than a 500, and rather than a silent empty extraction that reads as "the
        sheet says nothing".
        """
        return Extraction(
            template=self.name,
            url=url,
            unresolved=tuple(
                Unresolved(field, "this reader needs the document itself, not its text layer")
                for field in sorted(FIELDS)
            ),
        )

    # ── the real path ───────────────────────────────────────────────────────

    def read(self, document: bytes, text: str, url: str) -> Extraction:
        """Read one fact sheet, from cache when this exact document was read before."""
        digest = hashlib.sha256(document).hexdigest()

        payload = cached_reading(digest, self.cache_dir)
        if payload is None:
            payload = self._ask(document)
            store_reading(digest, payload, self.cache_dir)

        return self._verified(payload, text, url)

    def _client_or_raise(self) -> Any:
        """The Anthropic client, built on first use.

        Imported inside the method, not at module scope, for the same reason the
        rest of this package defers pypdf: with the flag off nothing imports
        `anthropic`, and a machine without it installed still serves the
        catalogue. A test proves that.
        """
        if self._client is not None:
            return self._client
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise LlmExtractError(
                "ANTHROPIC_API_KEY is not set on the server, so a sheet cannot be "
                "read. Enter the figures by hand, or set the key."
            )
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise LlmExtractError(
                "The anthropic package is not installed on the server "
                "(pip install -r requirements-dev.txt)."
            ) from exc

        # An organisation-level key must name a workspace; a workspace-scoped
        # key must not be given one. Both are supported because which kind is in
        # the environment is not ours to choose.
        headers = (
            {"anthropic-workspace-id": FUND_LLM_WORKSPACE_ID}
            if FUND_LLM_WORKSPACE_ID
            else None
        )
        self._client = anthropic.Anthropic(default_headers=headers)
        return self._client

    def _ask(self, document: bytes) -> dict[str, Any]:
        """One request, one tool call, the tool's input returned raw.

        Raw on purpose: what gets cached is the model's answer before any of our
        interpretation, so verification and vocabulary rules can be changed and
        re-applied to a stored reading without paying for the document twice.
        """
        import base64

        client = self._client_or_raise()
        try:
            response = client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                system=SYSTEM,
                tools=[TOOL],
                tool_choice={"type": "tool", "name": TOOL["name"]},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": base64.standard_b64encode(document).decode("ascii"),
                                },
                            },
                            {"type": "text", "text": _instruction()},
                        ],
                    }
                ],
            )
        except Exception as exc:  # noqa: BLE001 - the SDK raises many shapes
            raise LlmExtractError(_readable_failure(exc)) from exc

        for block in getattr(response, "content", []) or []:
            if getattr(block, "type", None) == "tool_use":
                return dict(getattr(block, "input", {}) or {})
        raise LlmExtractError("The reader returned no transcription for that sheet.")

    def _verified(self, payload: dict[str, Any], text: str, url: str) -> Extraction:
        """Turn a raw answer into readings, checking each quote against the document.

        Everything that fails a check becomes `Unresolved` with the reason,
        never a silent drop: a reviewer needs to know a field was attempted and
        rejected, because that is different from a sheet not printing it.
        """
        haystack = _comparable(text)
        readings: list[Reading] = []
        unresolved: list[Unresolved] = []
        seen: set[str] = set()

        for entry in payload.get("readings") or []:
            if not isinstance(entry, dict):
                continue
            field = str(entry.get("field") or "")
            if field not in FIELDS or field in seen:
                continue
            seen.add(field)

            quote = str(entry.get("quote") or "")
            needle = _comparable(quote)
            if len(needle) < MIN_QUOTE_CHARS:
                unresolved.append(
                    Unresolved(field, "came back without enough of the line to check it against the sheet")
                )
                continue
            if needle not in haystack:
                # The failure this whole design is for: a value that looks right
                # and is not on the page. Also, honestly, how a correct reading
                # of a graphic-only figure fails — which is the safe direction.
                unresolved.append(
                    Unresolved(
                        field,
                        f"the quoted line is not in the document's text — read it off the "
                        f"sheet yourself. Quoted: {quote.strip()[:80]!r}",
                    )
                )
                continue

            value, problem = _coerce(field, entry.get("value"))
            if problem is not None:
                unresolved.append(Unresolved(field, problem))
                continue

            readings.append(Reading(field, value, " ".join(quote.split())))

        for entry in payload.get("unresolved") or []:
            if not isinstance(entry, dict):
                continue
            field = str(entry.get("field") or "")
            if field not in FIELDS or field in seen:
                continue
            seen.add(field)
            reason = " ".join(str(entry.get("reason") or "").split())
            unresolved.append(Unresolved(field, reason or "the sheet does not state it"))

        # A field nobody mentioned is still a field the form needs an answer for.
        for field in sorted(FIELDS):
            if field not in seen:
                unresolved.append(Unresolved(field, "not reported by the reader — type it from the document"))

        return Extraction(
            template=self.name,
            url=url,
            readings=tuple(readings),
            unresolved=tuple(unresolved),
        )


def _readable_failure(exc: Exception) -> str:
    """A transport failure, said in a way that names the fix.

    Only one case is special-cased, and it is special-cased because the raw
    message is accurate and still leaves a reader guessing which of two things
    to change. It is the first error this reader hit against a real key.
    """
    detail = str(exc)
    if "not scoped to a workspace" in detail:
        return (
            "The Anthropic key on this server is an organisation-level key, so a "
            "request has to name a workspace. Either set ANTHROPIC_WORKSPACE_ID, "
            "or replace ANTHROPIC_API_KEY with a key created inside a workspace "
            "(the simpler fix). Until then, enter the figures by hand."
        )
    return f"The sheet could not be read: {detail}"


def _instruction() -> str:
    """The per-request ask: the field list, generated from FIELDS.

    Generated rather than written out, so a field cannot be in the tool schema
    and missing from the instructions, or described two different ways.
    """
    lines = [f"- {name}: {description}" for name, description in FIELDS.items()]
    return (
        "Read this Minimum Disclosure Document and record these fields:\n\n"
        + "\n".join(lines)
        + "\n\nFor the ASISA classification, these are the categories this "
        "catalogue knows; if the sheet's wording is one of them, use the "
        "sheet's own wording:\n"
        + "\n".join(f"- {n}" for n in ASISA.names())
        + "\n\nRemember: quote the line for every reading, refuse anything that "
        "is only a picture, and compute nothing."
    )


def _coerce(field: str, raw: Any) -> tuple[Any, Optional[str]]:
    """One value, typed for its column, or a reason it cannot be used."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None, "came back empty"

    if field in BOOLEAN:
        if isinstance(raw, bool):
            return raw, None
        text = str(raw).strip().lower()
        if text in {"true", "yes"}:
            return True, None
        if text in {"false", "no"}:
            return False, None
        return None, f"{raw!r} is not a yes or no"

    if field in NUMERIC:
        if isinstance(raw, bool):
            return None, f"{raw!r} is not a number"
        if isinstance(raw, (int, float)):
            return float(raw), None
        cleaned = (
            str(raw)
            .replace("%", "")
            .replace("R", "")
            .replace(",", "")
            .replace(" ", "")
            .replace(" ", "")
            .strip()
        )
        # A negative return is printed in brackets, and the prompt asks for a
        # minus sign — but a reader that copied the brackets is still right about
        # the figure, so the shape is accepted rather than refused.
        bracketed = re.fullmatch(r"\((.+)\)", cleaned)
        if bracketed:
            cleaned = f"-{bracketed.group(1)}"
        try:
            return float(cleaned), None
        except ValueError:
            return None, f"{raw!r} is not a number"

    text = " ".join(str(raw).split())

    if field in VOCABULARIES:
        if text not in VOCABULARIES[field]:
            return None, f"{text!r} is not one of {', '.join(VOCABULARIES[field])}"
        return text, None

    if field == "asisa_category":
        # A closed vocabulary joined by name with no foreign key behind it, so a
        # near miss stores cleanly and then matches nobody. Snapped onto the
        # published name, or refused.
        found = ASISA.resolve(text)
        if found is None:
            return None, f"{text!r} is not a classification this catalogue covers"
        return found.name, None

    if field.endswith("_date") or field == "as_of":
        iso = _as_iso(text)
        if iso is None:
            return None, f"{text!r} is not a date this reads — type it as YYYY-MM-DD"
        return iso, None

    return text, None


def _as_iso(text: str) -> Optional[str]:
    """A date as YYYY-MM-DD, from the forms these sheets and models produce."""
    from datetime import datetime

    cleaned = " ".join(text.replace(",", " ").split())
    for pattern in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(cleaned.title(), pattern).date().isoformat()
        except ValueError:
            continue
    return None
