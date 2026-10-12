"""Reading a fund fact sheet with Gemini, and deciding what a person must check.

The reader for uploaded fact sheets. It asks a Gemini model on Vertex AI to
transcribe the sheet, then checks every answer against the PDF's own text, and
sorts each field into one of three states for the review screen:

  * ``confirmed`` — the model was sure, the line it quoted is in the document,
    and the value passes every rule below. Shown pre-filled; the person may
    still edit it.
  * ``check`` — something about it is not certain: the model said it was
    unsure, it was read off a chart or graphic, its quote is not in the
    document's text, or a rule below caught it. Shown first, with the reason,
    and the person must confirm or correct it before anything is saved.
  * ``missing`` — the sheet does not state it, or the model could not read it.
    The person types it or leaves it blank.

The rules are the ones the removed admin reader (commit 37ead14 and the five
after it) learned from real sheets, carried over with their reasons. One rule
changed on purpose: that reader refused anything that existed only as a
picture, because nobody looked at its answers before they were saved. Here a
person always does, so a value read off a graphic (most risk ratings are a
shaded scale) is kept as a suggestion and always marked ``check``.

No AI selects funds (D-153) and nothing here is saved by itself (D-210's
objection to "black boxing" is answered by the review: a person confirms every
uncertain field). This module only reads.
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from .asisa import ASISA
from .risk_scale import normalize as risk_level_of

logger = logging.getLogger("funds")

#: Bumped whenever the prompt, the schema or the field list changes, so a cached
#: answer from an older ask is never mistaken for an answer to this one.
PROMPT_VERSION = "2"  # unchanged by rules applied after the answer, which re-run from the cache

DEFAULT_MODEL = "gemini-3.8-flash"
DEFAULT_LOCATION = "eu"

#: How much of a quote has to match before it counts as found. Below this a
#: quote locates nothing: "0.25%" is on many sheets twice.
MIN_QUOTE_CHARS = 6

#: The fields this reader asks for, with what each one means. Shared by the
#: prompt and the schema, so a field cannot be asked for one way and checked
#: another.
FIELDS: dict[str, str] = {
    "fund_name": "the fund's full name as printed, including its class if shown (e.g. 'Class A')",
    "as_of": "the sheet's own as-at date, as YYYY-MM-DD",
    "risk_indicator_raw": (
        "the risk rating in the sheet's OWN WORDS, e.g. 'Moderate - High' or '4 of 7'. "
        "If it is printed as text, quote that text and set source 'text'. If it is only "
        "shown by shading or marking one step of a scale, read which step is marked, "
        "give that step's label, quote the scale's labels, and set source 'graphic'"
    ),
    "isin": "the ISIN, twelve characters",
    "jse_code": "the JSE or fund code, if the sheet prints one",
    "asisa_category": (
        "the ASISA classification, verbatim and complete. It is often wrapped across two "
        "lines — include the continuation. 'Variable Term' and 'Variable Term ILB' are "
        "different categories"
    ),
    "benchmark": "the benchmark index the fund measures itself against",
    "objective": "the fund's stated objective, in the manager's own words",
    "ter": "total expense ratio, as a percentage",
    "tc": "transaction cost, as a percentage",
    "tic": "total investment charge, as a percentage",
    "annual_management_fee": (
        "the manager's own annual fee (may be labelled 'Annual Management Fee' or "
        "'Annual Service Fee'), as a percentage"
    ),
    "fee_period": "'1y' or '3y': which column the four fee figures above were taken from",
    "fund_size_zar": (
        "the fund's size in rand as a plain number. 'Portfolio Value R362 million' is 362000000"
    ),
    "nav_cpu": (
        "the net asset value per unit, IN CENTS. A sheet printing 'NAV Price R9.23' is 923; "
        "a sheet printing '183.63 cents' is 183.63"
    ),
    "nav_date": "the date that NAV was struck, as YYYY-MM-DD",
    "inception_date": (
        "the date the FUND launched, as YYYY-MM-DD. Many sheets print two dates, the fund's "
        "launch and this class's launch (e.g. 'Fund inception 2 July 2001', 'Class inception "
        "1 October 2012'): take the fund's, and if you cannot tell which date is the fund's, "
        "mark it 'unsure'"
    ),
    "distribution_frequency": "how often the fund distributes income",
    "recommended_min_term_years": "the minimum term in years, only if the sheet states a NUMBER",
    "min_lump_sum": (
        "the MINIMUM lump sum in rand, if stated. A tax-free fund prints a MAXIMUM instead, "
        "because SARS caps contributions: leave this out rather than recording a cap as a minimum"
    ),
    "min_debit_order": (
        "the MINIMUM monthly debit order in rand, if stated. As above: a maximum is not a minimum"
    ),
    "return_high_12m": "the highest annual return the sheet publishes",
    "return_low_12m": (
        "the lowest annual return the sheet publishes. Printed in brackets when negative: "
        "(4.49) is -4.49"
    ),
    "return_extremes_basis": (
        "'rolling_12m' if the heading says rolling or non-overlapping one-year periods; "
        "'calendar_year' if it says calendar year"
    ),
    "risk_narrative": (
        "the manager's prose describing the fund's RISK, from the sheet's risk block, quoted. "
        "Only if that block is written as sentences. Never repeat the investment objective here"
    ),
    "horizon_words": "the manager's wording about how long to hold the fund, quoted",
    "portfolio_manager": (
        "the person or people the sheet names as the fund's portfolio manager(s), from a "
        "label such as 'Portfolio manager' or 'Fund manager'. NEVER the author of a "
        "commentary or market review, even if that author is described as a manager. If the "
        "sheet names only a management company in that role, give the company"
    ),
    "regulation_28": "true or false, only if the sheet states Regulation 28 compliance",
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

VOCABULARIES: dict[str, tuple[str, ...]] = {
    "fee_period": ("1y", "3y"),
    "return_extremes_basis": ("rolling_12m", "calendar_year"),
}

#: field -> words that, in the quoted line, mean the line states the OPPOSITE of
#: the field. The Allan Gray Tax-Free Balanced Fund prints "Maximum lump sum per
#: investor account R46 000"; the old reader filed it as a minimum with a real
#: quote and a real number, and a beginner would have been shown a R46 000
#: minimum on a fund with no barrier to entry.
CONTRADICTED_BY: dict[str, tuple[str, ...]] = {
    "min_lump_sum": ("maximum", "max "),
    "min_debit_order": ("maximum", "max "),
}

#: Short fields whose value must appear INSIDE the line it was quoted from. A
#: real quote does not prove the value is a reading of it: the old reader once
#: returned "Semi-annual" quoting "Date of Income Declaration: 30 June/31
#: December", a fair summary that is nowhere on the document.
VERBATIM: frozenset[str] = frozenset({"benchmark", "jse_code", "isin", "portfolio_manager"})

#: Fee fields, where one printed line often carries two figures for one label:
#: "Fund management fee 0.50% 0.58%" (before and after VAT) on the Nedgroup Core
#: Income sheet, and a fee table's 1-year and 3-year columns side by side. The
#: first accuracy run found the model confidently taking either one, so a fee
#: read from a line with more than one figure on it goes to a person.
FEES: frozenset[str] = frozenset({"ter", "tc", "tic", "annual_management_fee"})

_FIGURE = re.compile(r"\d+(?:[.,]\d+)?\s*%")

RULES = """You transcribe South African fund fact sheets (Minimum Disclosure \
Documents) for an app that shows every figure next to the document it came from. \
A person checks your reading before it is saved, and they check first whatever \
you mark unsure.

Your job is transcription, not analysis. Rules, in order of importance:

1. NEVER GUESS. If a field is not printed on the sheet, leave it out of `readings` \
and put it in `unresolved` with a one-sentence reason a person can act on. If it \
is printed but you are not certain which of two values it is, or you cannot read \
it clearly, give your best reading with `certainty` 'unsure' and say why in \
`note`. A blank or flagged field gets checked by a person; a confident wrong \
value gets approved.

2. QUOTE THE LINE. Every reading needs `quote`: the text as it appears on the \
sheet, copied exactly, long enough to locate but no longer than one or two lines, \
and `page`, the page number it is on (first page is 1). The quote is checked \
against the document afterwards. Do not paraphrase a quote to make it tidy.

3. SAY WHEN YOU READ A PICTURE. Many managers draw the risk profile as a scale \
with one step shaded, and the asset allocation as a chart. If you read a value \
off a graphic rather than a line of text, set `source` to 'graphic'. Otherwise \
'text'.

4. COMPUTE NOTHING. Do not annualise, total, average or infer. Do not derive a \
category from an objective. The only exceptions are stated in the field list: the \
NAV is recorded in cents, and a fund size in millions is written out in full.

5. FEES COME FROM ONE COLUMN. Many sheets print the expense ratio, transaction \
cost, total investment charge and management fee twice, under 1-Year and 3-Year \
headings, and the figures differ. Take the 1-YEAR column and set `fee_period` to \
'1y'. If the sheet prints only one unlabelled figure, take it and set \
`fee_period` to the period the sheet's own notes describe; if the notes do not \
say, put `fee_period` in `unresolved`.

5a. A STATED FEE REDUCTION BEATS THE PRINTED COLUMN. Where a note says the TER \
"was reduced to 0.25% effective 01 October 2025", take the reduced figure and \
quote the note.

5b. CHECK YOUR FEES AGAINST THE SHEET'S OWN TOTAL. The total investment charge \
is the expense ratio plus the transaction cost, and all three are printed. If \
the TER and TC you picked do not add up to the printed TIC, you have taken a \
figure from the wrong row or column. Look again; if it still does not add up, \
mark the fees 'unsure'.

6. THE BEST AND WORST YEAR ARE NOT ONE STATISTIC. Some sheets publish the highest \
and lowest annual rolling return; others the highest and lowest calendar year \
since inception. Read the heading and set `return_extremes_basis`. If you cannot \
tell which, mark all three 'unsure'.

7. IS THIS A FACT SHEET AT ALL? Set `is_fact_sheet` to false if the document is \
not a fund fact sheet or Minimum Disclosure Document (an invoice, a statement, an \
article, a brochure for something else). Then return no readings."""


def response_schema() -> dict[str, Any]:
    """The JSON shape the model must answer in. Every value is a string; this
    module types it, so a model cannot slip a wrong type past the checks."""
    names = list(FIELDS)
    return {
        "type": "object",
        "properties": {
            "is_fact_sheet": {"type": "boolean"},
            "readings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string", "enum": names},
                        "value": {"type": "string"},
                        "quote": {"type": "string"},
                        "page": {"type": "integer"},
                        "source": {"type": "string", "enum": ["text", "graphic"]},
                        "certainty": {"type": "string", "enum": ["sure", "unsure"]},
                        "note": {"type": "string"},
                    },
                    "required": ["field", "value", "quote", "page", "source", "certainty"],
                },
            },
            "unresolved": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string", "enum": names},
                        "reason": {"type": "string"},
                    },
                    "required": ["field", "reason"],
                },
            },
        },
        "required": ["is_fact_sheet", "readings", "unresolved"],
    }


def instruction() -> str:
    """The per-request ask: the field list and the categories this app knows."""
    lines = [f"- {name}: {description}" for name, description in FIELDS.items()]
    return (
        "Read this Minimum Disclosure Document and record these fields:\n\n"
        + "\n".join(lines)
        + "\n\nFor the ASISA classification, these are the categories this app knows; "
        "if the sheet's wording is one of them, use the sheet's own wording:\n"
        + "\n".join(f"- {n}" for n in ASISA.names())
        + "\n\nRemember: quote the line and give its page for every reading, say when you "
        "read a graphic, mark anything you are not sure of, and compute nothing."
    )


# ── comparing a quote with the document ─────────────────────────────────────

#: Typesetter's punctuation, folded to the plain forms a model types. The Allan
#: Gray sheet sets "Fund’s" with a curly apostrophe; a straight one in the quote
#: failed the check and threw away a correct benchmark.
_TYPOGRAPHY = str.maketrans({
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "–": "-", "—": "-", "‒": "-", "−": "-",
    " ": " ", " ": " ", " ": " ",
})


def comparable(text: Any) -> str:
    """Text reduced to what a PDF's layout cannot vary: punctuation folded,
    whitespace collapsed, case folded, and a hyphen between letters removed (the
    Satrix ILBI sheet breaks "non-\\noverlapping" across a line, and a quote may
    spell it three ways). Nothing looser: every loosening buys a wrong value the
    right to pass."""
    cleaned = str(text or "").replace("\xad", "").translate(_TYPOGRAPHY)
    collapsed = " ".join(cleaned.split()).casefold()
    return re.sub(r"(?<=[a-z])-\s*(?=[a-z])", "", collapsed)


def _squashed(text: str) -> str:
    return re.sub(r"\s+", "", text)


def quote_found(quote: str, document_text: str) -> bool:
    """Whether a quoted line is in the document's text.

    Compared twice: with whitespace collapsed, then with it removed. Some sheets
    have no spaces in their text layer at all — the 10X S&P SA Top50 sheet's
    heading extracts as "10XS&PSATop50ETF" though it displays with spaces — and
    a correct quote of it would otherwise be flagged. The space-free comparison
    needs a longer quote, because without spaces short strings match by
    accident across word boundaries.
    """
    needle = comparable(quote)
    if len(needle) < MIN_QUOTE_CHARS:
        return False
    haystack = comparable(document_text)
    if needle in haystack:
        return True
    squashed = _squashed(needle)
    return len(squashed) >= MIN_QUOTE_CHARS + 2 and squashed in _squashed(haystack)


def pdf_text(document: bytes) -> str:
    """The PDF's own text layer, every page, for checking quotes against."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(document))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


# ── typing and checking one value ───────────────────────────────────────────

def coerce(field_name: str, raw: Any) -> tuple[Any, Optional[str]]:
    """One value, typed for its field, or the reason it cannot be used as typed."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None, "came back empty"

    if field_name in BOOLEAN:
        text = str(raw).strip().lower()
        if text in {"true", "yes"}:
            return True, None
        if text in {"false", "no"}:
            return False, None
        return None, f"{raw!r} is not a yes or no"

    if field_name in NUMERIC:
        cleaned = (
            str(raw).replace("%", "").replace("R", "").replace(",", "")
            .replace(" ", "").replace(" ", "").strip()
        )
        bracketed = re.fullmatch(r"\((.+)\)", cleaned)
        if bracketed:
            cleaned = f"-{bracketed.group(1)}"
        try:
            return float(cleaned), None
        except ValueError:
            return None, f"{raw!r} is not a number"

    text = " ".join(str(raw).split())

    if field_name in VOCABULARIES:
        if text not in VOCABULARIES[field_name]:
            return None, f"{text!r} is not one of {', '.join(VOCABULARIES[field_name])}"
        return text, None

    if field_name == "asisa_category":
        found = ASISA.resolve(text)
        if found is None:
            return None, f"{text!r} is not a classification this app covers"
        return found.name, None

    if field_name == "risk_indicator_raw" and risk_level_of(text) is None:
        return text, f"{text!r} is not a risk label this app can place on its 1 to 5 scale"

    if field_name.endswith("_date") or field_name == "as_of":
        iso = as_iso(text)
        if iso is None:
            return None, f"{text!r} is not a date this reads"
        return iso, None

    return text, None


def as_iso(text: str) -> Optional[str]:
    """A date as YYYY-MM-DD, from the forms these sheets and models produce."""
    from datetime import datetime

    cleaned = " ".join(text.replace(",", " ").split()).title()
    for pattern in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(cleaned, pattern).date().isoformat()
        except ValueError:
            continue
    return None


# ── the result ──────────────────────────────────────────────────────────────

@dataclass
class Reading:
    """One field the model read, and whether a person must check it."""

    field: str
    value: Any
    quote: str
    page: Optional[int]
    source: str
    certainty: str
    status: str  # "confirmed" or "check"
    reasons: list[str] = field(default_factory=list)


@dataclass
class Missing:
    """One field with no reading, and why."""

    field: str
    reason: str


@dataclass
class SheetReading:
    """Everything one read of one document produced."""

    is_fact_sheet: bool
    readings: list[Reading]
    missing: list[Missing]
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    seconds: float = 0.0

    def value(self, field_name: str) -> Any:
        for reading in self.readings:
            if reading.field == field_name:
                return reading.value
        return None

    def get(self, field_name: str) -> Optional[Reading]:
        for reading in self.readings:
            if reading.field == field_name:
                return reading
        return None


def review(payload: dict[str, Any], document_text: str) -> tuple[list[Reading], list[Missing]]:
    """Sort the model's answer into confirmed, check and missing.

    Nothing the model said is dropped. A value that fails a check stays, marked
    ``check`` with the reason, because the person deciding needs to see what was
    read and why it was doubted; an empty box with no reason beside it is the
    one presentation this design exists to avoid.
    """
    readings: list[Reading] = []
    missing: list[Missing] = []
    seen: set[str] = set()

    for entry in payload.get("readings") or []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("field") or "")
        if name not in FIELDS or name in seen:
            continue
        seen.add(name)

        raw = entry.get("value")
        quote = " ".join(str(entry.get("quote") or "").split())
        page = entry.get("page") if isinstance(entry.get("page"), int) else None
        source = "graphic" if entry.get("source") == "graphic" else "text"
        certainty = "unsure" if entry.get("certainty") == "unsure" else "sure"
        reasons: list[str] = []

        value, problem = coerce(name, raw)
        if problem is not None:
            reasons.append(problem)
            if value is None:
                value = " ".join(str(raw or "").split()) or None

        if certainty == "unsure":
            note = " ".join(str(entry.get("note") or "").split())
            reasons.append(f"the model was not sure{': ' + note if note else ''}")

        if source == "graphic":
            reasons.append("read off a chart or graphic, which has no text to check it against")
        elif not quote_found(quote, document_text):
            reasons.append(f"the line it quoted is not in the document's text: {quote[:80]!r}")

        quoted = comparable(quote)
        for word in CONTRADICTED_BY.get(name, ()):
            if word in quoted and name.split("_")[0] not in quoted:
                reasons.append(
                    f"the line it was read from states a {word.strip()}, not a minimum: {quote[:70]!r}"
                )
                break

        if name in VERBATIM and value is not None and comparable(value) not in quoted:
            reasons.append(f"{str(value)[:40]!r} is not written in the line it was read from")

        if name in FEES and len(_FIGURE.findall(quote)) > 1:
            reasons.append(f"the line it was read from prints more than one figure: {quote[:70]!r}")

        # Allan Gray's sheets print a fee table whose 1-year row is "Fee for
        # benchmark performance 0.88": a fee that moves with returns, beside a
        # base fee of 0.8 printed elsewhere. One figure on the line, so the rule
        # above passes it, and the model took it as the management fee twice.
        if name == "annual_management_fee" and "performance" in quoted:
            reasons.append(f"the line it was read from is a performance-related fee, which changes with returns: {quote[:70]!r}")

        readings.append(
            Reading(
                field=name,
                value=value,
                quote=quote,
                page=page,
                source=source,
                certainty=certainty,
                status="check" if reasons else "confirmed",
                reasons=reasons,
            )
        )

    # The objective and the risk narrative are shown as two quotations; the
    # same paragraph in both presents one statement as two. Sheets that draw
    # their risk profile tempt a model to fill the gap with the objective.
    objective = next((r.value for r in readings if r.field == "objective"), None)
    for reading in readings:
        if (
            reading.field == "risk_narrative"
            and objective is not None
            and comparable(reading.value) == comparable(objective)
        ):
            reading.status = "check"
            reading.reasons.append("it repeats the investment objective word for word")

    for entry in payload.get("unresolved") or []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("field") or "")
        if name not in FIELDS or name in seen:
            continue
        seen.add(name)
        reason = " ".join(str(entry.get("reason") or "").split())
        missing.append(Missing(name, reason or "the sheet does not state it"))

    for name in FIELDS:
        if name not in seen:
            missing.append(Missing(name, "not reported by the model"))

    return readings, missing


# ── the model call ──────────────────────────────────────────────────────────

class ReadingError(RuntimeError):
    """The document could not be read at all, with a reason worth showing."""


class GeminiFactsheetReader:
    """Reads one PDF with Gemini on Vertex AI.

    Configured from the environment like the rest of the backend:
    GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION (``eu`` — the EU multi-region is
    where this project can reach the Gemini models, and it keeps documents in the
    EU) and FUND_EXTRACT_MODEL. Authentication is the Cloud Run service account
    in production and ``gcloud auth application-default login`` locally; there
    is no API key.
    """

    RETRIES = 3
    BACKOFF_SECONDS = (2.0, 5.0, 10.0)

    def __init__(
        self,
        model: Optional[str] = None,
        client: Any | None = None,
        thinking_level: Optional[str] = None,
    ):
        self.model = model or os.getenv("FUND_EXTRACT_MODEL", DEFAULT_MODEL)
        self.thinking_level = thinking_level or os.getenv("FUND_EXTRACT_THINKING") or None
        self._client = client
        self._client_lock = threading.Lock()

    @property
    def client(self):
        # Built once, under a lock. Two threads building one each left the
        # loser's client unreferenced, and it closed its connection while the
        # other thread was still sending on it.
        with self._client_lock:
            if self._client is None:
                from google import genai

                project = os.getenv("GOOGLE_CLOUD_PROJECT")
                if not project:
                    raise ReadingError("GOOGLE_CLOUD_PROJECT is not set, so there is no Gemini to ask")
                self._client = genai.Client(
                    vertexai=True,
                    project=project,
                    location=os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION),
                )
            return self._client

    def _config(self):
        from google.genai import types

        kwargs: dict[str, Any] = dict(
            system_instruction=RULES,
            temperature=0,
            response_mime_type="application/json",
            response_json_schema=response_schema(),
        )
        if self.thinking_level:
            kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=self.thinking_level)
        return types.GenerateContentConfig(**kwargs)

    def ask(self, document: bytes) -> tuple[dict[str, Any], dict[str, int]]:
        """The model's raw answer and its token counts. Retries a busy service."""
        from google.genai import errors, types

        contents = [types.Part.from_bytes(data=document, mime_type="application/pdf"), instruction()]
        for attempt in range(self.RETRIES + 1):
            try:
                response = self.client.models.generate_content(
                    model=self.model, contents=contents, config=self._config()
                )
                break
            except errors.APIError as e:
                retryable = e.code in (429, 500, 503)
                if not retryable or attempt >= self.RETRIES:
                    raise ReadingError(f"Gemini refused the request ({e.code}): {e.message}") from e
                time.sleep(self.BACKOFF_SECONDS[min(attempt, len(self.BACKOFF_SECONDS) - 1)])
        try:
            payload = json.loads(response.text or "")
        except json.JSONDecodeError as e:
            raise ReadingError("Gemini's answer was not the JSON it was asked for") from e
        usage = response.usage_metadata
        tokens = {
            "input": int(getattr(usage, "prompt_token_count", 0) or 0),
            "output": int(getattr(usage, "candidates_token_count", 0) or 0),
            "thinking": int(getattr(usage, "thoughts_token_count", 0) or 0),
        }
        return payload, tokens

    def read(self, document: bytes, payload: dict[str, Any] | None = None, tokens: dict[str, int] | None = None) -> SheetReading:
        """Read one PDF and sort the answer for review.

        ``payload`` and ``tokens`` replay an earlier answer instead of asking
        again, which is how the accuracy script re-checks without paying twice.
        """
        started = time.monotonic()
        if payload is None:
            payload, tokens = self.ask(document)
        tokens = tokens or {}
        text = pdf_text(document)
        is_fact_sheet = bool(payload.get("is_fact_sheet", True))
        readings, missing = review(payload, text) if is_fact_sheet else ([], [])
        return SheetReading(
            is_fact_sheet=is_fact_sheet,
            readings=readings,
            missing=missing,
            model=self.model,
            input_tokens=tokens.get("input", 0),
            output_tokens=tokens.get("output", 0),
            thinking_tokens=tokens.get("thinking", 0),
            seconds=time.monotonic() - started,
        )
