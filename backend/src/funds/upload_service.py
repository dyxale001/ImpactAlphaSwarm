"""Uploaded fact sheets: read one, let the reader review it, save what they confirm.

Two steps, because a person sits between the model and the database (D-210):

  1. ``read`` takes a PDF, checks it is a plausible fact sheet within the limits,
     reads it with Gemini (or replays a cached answer for the same document),
     and returns every field as confirmed, check or missing for the review
     screen. Nothing about the reader is stored except the upload count.
  2. ``save`` takes the reviewed values and stores them as one of the reader's
     funds, with a record of how each figure got there.

The PDF is not kept between the two (migration 039: no document stored), so
``save`` cannot re-check quotes against it. ``read`` therefore hands the browser
a **review token**: what the reader found, signed with a server key. ``save``
takes the flags, quotes and the model's own values from the token rather than
from the request, so a request cannot skip a flagged field or claim a typed
value was read off the sheet. The token is bound to the reader and expires.

Every error a person can act on is an ``UploadError`` with an HTTP status and a
message to show; the routes only translate it.
"""

from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import io
import json
import logging
import os
import uuid
from typing import Any, Callable, Iterable, Optional

from . import config
from .reading import (
    FIELDS,
    PROMPT_VERSION,
    GeminiFactsheetReader,
    ReadingError,
    SheetReading,
    coerce,
)
from .models import FundCandidate
from .risk_scale import ceiling_for, within_ceiling
from .risk_scale import normalize as risk_level_of
from .uploads import UploadedFundRepository
from .validators import IsinValidator, Problem, snapshot_validators

logger = logging.getLogger("funds")

#: Reader fields that name the fund rather than describe a sheet; they go on the
#: uploaded_funds row. ``fund_name`` is stored there as ``name``.
IDENTITY = {"fund_name": "name", "isin": "isin", "jse_code": "jse_code", "asisa_category": "asisa_category"}

#: Fields a sheet cannot be saved without: the fund needs a name, and every
#: figure is dated by the sheet's as-at date.
REQUIRED = ("fund_name", "as_of")

#: Longest value a person may type into one field. The longest real one is an
#: objective of a few hundred characters.
MAX_VALUE_CHARS = 4000

#: How long a review stays open. A day covers someone who uploads, gets
#: interrupted and comes back; after that, upload again (it is cached).
TOKEN_TTL = datetime.timedelta(hours=24)

TOKEN_VERSION = "v1"


class UploadError(Exception):
    """Something the reader can act on, with the HTTP status that says what kind."""

    def __init__(self, status: int, message: str, **extra: Any):
        super().__init__(message)
        self.status = status
        self.detail: dict[str, Any] = {"message": message, **extra}


# ── the review token ────────────────────────────────────────────────────────

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def review_key() -> Optional[bytes]:
    """The signing key: FUND_UPLOAD_REVIEW_KEY if set, else one derived from the
    service-role key, which every deployment already has and never sends out."""
    explicit = os.getenv("FUND_UPLOAD_REVIEW_KEY")
    if explicit:
        return explicit.encode()
    base = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not base:
        return None
    return hmac.new(base.encode(), b"fund-upload-review", hashlib.sha256).digest()


def sign(claims: dict[str, Any], key: bytes) -> str:
    body = _b64(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode())
    mac = hmac.new(key, f"{TOKEN_VERSION}.{body}".encode(), hashlib.sha256).digest()
    return f"{TOKEN_VERSION}.{body}.{_b64(mac)}"


def verify(token: str, key: bytes) -> Optional[dict[str, Any]]:
    """The token's claims, or None if it is malformed or was not signed by us."""
    try:
        version, body, mac = token.split(".")
        if version != TOKEN_VERSION:
            return None
        expected = hmac.new(key, f"{version}.{body}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(mac)):
            return None
        claims = json.loads(_unb64(body))
    except (ValueError, TypeError):
        return None
    return claims if isinstance(claims, dict) else None


# ── the service ─────────────────────────────────────────────────────────────

class FactSheetUploadService:
    """A reader's uploads: read a sheet for review, save it, list and delete."""

    def __init__(
        self,
        repository: Optional[UploadedFundRepository] = None,
        reader: Optional[GeminiFactsheetReader] = None,
        key: Optional[bytes] = None,
        now: Callable[[], datetime.datetime] = lambda: datetime.datetime.now(datetime.timezone.utc),
        max_bytes: int = config.FUND_UPLOAD_MAX_BYTES,
        max_pages: int = config.FUND_UPLOAD_MAX_PAGES,
        per_day: int = config.FUND_UPLOADS_PER_DAY,
        traces: Any = None,
        comparisons: Any = None,
    ):
        self.repository = repository or UploadedFundRepository()
        self.reader = reader or GeminiFactsheetReader()
        self.key = key if key is not None else review_key()
        self.now = now
        self.max_bytes = max_bytes
        self.max_pages = max_pages
        self.per_day = per_day
        self._traces = traces
        self._comparisons = comparisons

    @property
    def traces(self):
        """The fund page's trace service, built on first use."""
        if self._traces is None:
            from .trace import FundTraceService

            self._traces = FundTraceService()
        return self._traces

    @property
    def comparisons(self):
        """Compare's fund comparison service, built on first use."""
        if self._comparisons is None:
            from src.compare.funds_trace import FundComparisonService

            self._comparisons = FundComparisonService()
        return self._comparisons

    # ── step 1: read ────────────────────────────────────────────────────────

    def check_document(self, document: bytes) -> None:
        """Refuse what cannot be a fact sheet before it costs anything."""
        if not document:
            raise UploadError(400, "The file is empty.")
        if len(document) > self.max_bytes:
            raise UploadError(
                413, f"The file is larger than {self.max_bytes // (1024 * 1024)} MB; a fact sheet is far smaller."
            )
        if b"%PDF-" not in document[:1024]:
            raise UploadError(415, "That file is not a PDF. Upload the fund's fact sheet as a PDF.")
        from pypdf import PdfReader

        try:
            pdf = PdfReader(io.BytesIO(document))
            if pdf.is_encrypted:
                raise UploadError(400, "The PDF is password-protected. Upload a copy that opens without a password.")
            pages = len(pdf.pages)
        except UploadError:
            raise
        except Exception as e:  # pypdf raises many kinds on a damaged file
            raise UploadError(400, "The PDF could not be opened. It may be damaged; try downloading it again.") from e
        if pages > self.max_pages:
            raise UploadError(
                413, f"The PDF has {pages} pages. A fact sheet has at most {self.max_pages}; is this the right document?"
            )

    def read(self, user_id: str, document: bytes) -> dict[str, Any]:
        """Read one PDF for review. Blocking (the model call takes seconds), so
        the route runs it off the event loop."""
        if self.key is None:
            raise UploadError(503, "Fact sheet uploads are not configured on this server.")
        self.check_document(document)

        since = self.now() - datetime.timedelta(hours=24)
        if self.repository.reads_since(user_id, since) >= self.per_day:
            raise UploadError(
                429, f"You can upload {self.per_day} fact sheets in 24 hours. Try again tomorrow."
            )

        sha = hashlib.sha256(document).hexdigest()
        model = self.reader.model
        cached = self.repository.cached_reading(sha, model, PROMPT_VERSION)
        if cached is not None:
            payload = cached.get("payload") if cached.get("is_fact_sheet") else {"is_fact_sheet": False}
            tokens = cached.get("tokens")
        else:
            try:
                payload, tokens = self.reader.ask(document)
            except ReadingError as e:
                logger.warning("Fact sheet read failed: %s", e)
                raise UploadError(502, "The fact sheet could not be read just now. Please try again in a minute.") from e
            is_fact_sheet = bool(payload.get("is_fact_sheet", True))
            try:
                self.repository.store_reading(sha, model, PROMPT_VERSION, is_fact_sheet, payload, tokens)
            except Exception as e:  # the cache is a saving, never a reason to fail
                logger.warning("Could not cache a fact sheet reading: %s", e)
        self._record(user_id, sha, cached is not None)

        sheet = self.reader.read(document, payload=payload or {}, tokens=tokens)
        if not sheet.is_fact_sheet:
            raise UploadError(
                422, "This doesn't look like a fund fact sheet (Minimum Disclosure Document), so nothing was read."
            )

        fields = self.review_fields(sheet)
        existing = None
        isin, name = fields["isin"]["value"], fields["fund_name"]["value"]
        if isinstance(isin, str) and isin:
            found = self.repository.find_by_isin(user_id, isin)
        elif isinstance(name, str) and name:
            found = self.repository.find_by_name(user_id, name)
        else:
            found = None
        if found:
            existing = {"id": found["id"], "name": found.get("name")}

        claims = {
            "sub": user_id,
            "sha": sha,
            "model": model,
            "pv": PROMPT_VERSION,
            "exp": int((self.now() + TOKEN_TTL).timestamp()),
            "fields": fields,
        }
        ordered = [dict(field=name, **fields[name]) for name in FIELDS]
        return {
            "review_token": sign(claims, self.key),
            "file_sha256": sha,
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "cached": cached is not None,
            "fields": ordered,
            "counts": {s: sum(1 for f in ordered if f["status"] == s) for s in ("confirmed", "check", "missing")},
            "existing_fund": existing,
        }

    def _record(self, user_id: str, sha: str, cached: bool) -> None:
        try:
            self.repository.record_read(user_id, sha, cached)
        except Exception as e:
            # Not fatal for this upload; reads_since fails closed if the table is
            # unreachable, so a broken log cannot become an unlimited one.
            logger.warning("Could not log a fact sheet read: %s", e)

    def review_fields(self, sheet: SheetReading) -> dict[str, dict[str, Any]]:
        """Every field, as the review screen shows it.

        The catalogue's own validators run over what was read, and anything they
        question moves to ``check`` with their message: a TER of 146 with a real
        quote behind it is exactly the plausible wrong number they exist for.
        """
        fields: dict[str, dict[str, Any]] = {}
        for reading in sheet.readings:
            fields[reading.field] = {
                "value": reading.value,
                "status": reading.status,
                "quote": reading.quote or None,
                "page": reading.page,
                "source": reading.source,
                "reasons": list(reading.reasons),
            }
        for missing in sheet.missing:
            fields.setdefault(
                missing.field,
                {"value": None, "status": "missing", "quote": None, "page": None, "source": None, "reasons": [missing.reason]},
            )

        values = {name: f["value"] for name, f in fields.items() if f["status"] != "missing"}
        for problem in self._problems(values):
            target = fields.get(problem.field)
            if target is None:
                continue
            target["reasons"].append(problem.message)
            if target["status"] == "confirmed":
                target["status"] = "check"
        return fields

    # ── step 2: save ────────────────────────────────────────────────────────

    def save(
        self,
        user_id: str,
        review_token: str,
        values: dict[str, Any],
        confirmed: Iterable[str] = (),
        vehicle: Optional[str] = None,
        fund_house: Optional[str] = None,
    ) -> dict[str, Any]:
        """Store the reviewed sheet as one of this reader's funds."""
        if self.key is None:
            raise UploadError(503, "Fact sheet uploads are not configured on this server.")
        claims = verify(review_token, self.key)
        if claims is None or claims.get("sub") != user_id:
            raise UploadError(400, "This review is not valid. Upload the fact sheet again.")
        if int(claims.get("exp", 0)) < self.now().timestamp():
            raise UploadError(410, "This review has expired. Upload the fact sheet again; it won't count twice against the model.")

        read: dict[str, dict[str, Any]] = claims.get("fields") or {}
        confirmed = set(confirmed)

        unknown = sorted(set(values) - set(FIELDS))
        if unknown:
            raise UploadError(422, "Some fields are not ones a fact sheet records.", fields={k: "not a field" for k in unknown})

        # A flagged field needs a decision: confirm it, change it, or clear it
        # (sending it as null). Simply leaving it out is not one, so a client
        # that forgets a field cannot save the model's doubtful value unseen.
        undecided = [
            name for name, f in read.items()
            if f.get("status") == "check"
            and name not in confirmed
            and (name not in values or self._same(name, values[name], f.get("value")))
        ]
        if undecided:
            raise UploadError(
                422, "Some values were flagged for checking and haven't been confirmed or corrected.", needs_review=undecided
            )

        typed: dict[str, Any] = {}
        errors: dict[str, str] = {}
        warnings: list[dict[str, str]] = []
        for name, raw in values.items():
            if raw is None or (isinstance(raw, str) and not raw.strip()):
                continue
            if isinstance(raw, str) and len(raw) > MAX_VALUE_CHARS:
                errors[name] = f"is longer than {MAX_VALUE_CHARS} characters"
                continue
            value, problem = coerce(name, raw)
            if value is None and name == "asisa_category":
                # A reader's own fund may sit in a category the catalogue does
                # not cover. Kept in their words; it is only ever shown.
                value = " ".join(str(raw).split())
                warnings.append({"field": name, "message": f"{value!r} is not a classification this app covers"})
            elif value is None:
                errors[name] = problem or "could not be read"
                continue
            elif problem:
                warnings.append({"field": name, "message": problem})
            typed[name] = value

        for name in REQUIRED:
            if name not in typed and name not in errors:
                errors[name] = "is required"
        if errors:
            raise UploadError(422, "Some values need correcting before the fund can be saved.", fields=errors)

        figures = {k: v for k, v in typed.items() if k not in IDENTITY and k != "as_of"}
        level = risk_level_of(typed.get("risk_indicator_raw"))
        if level is not None:
            figures["risk_indicator_1to5"] = level

        problems = self._problems(typed)
        blocking = {p.field: p.message for p in problems if p.blocking}
        if blocking:
            raise UploadError(422, "Some values need correcting before the fund can be saved.", fields=blocking)
        warnings += [{"field": p.field, "message": p.message} for p in problems]

        provenance = self._provenance(read, typed)
        identity = {column: typed.get(field) for field, column in IDENTITY.items()}
        identity["vehicle"] = vehicle
        identity["fund_house"] = " ".join(fund_house.split())[:200] if fund_house else None

        fund_id = self._fund_for(user_id, identity, typed["as_of"])
        self.repository.add_sheet(
            user_id,
            fund_id,
            {
                "as_of": typed["as_of"],
                "file_sha256": claims["sha"],
                "figures": figures,
                "provenance": provenance,
                "model": claims.get("model"),
                "prompt_version": claims.get("pv"),
            },
        )
        fund = self.repository.get_fund(user_id, fund_id) or {"id": fund_id, **identity}
        return {"fund": fund, "warnings": warnings}

    def _fund_for(self, user_id: str, identity: dict[str, Any], as_of: str) -> str:
        """The reader's fund this sheet belongs to: the one with its ISIN, or new.

        A second sheet for the same fund refreshes the fund's name and details
        only if it is at least as recent as the newest one already saved, so an
        old sheet uploaded later cannot roll the fund's name back.
        """
        existing = self._existing(user_id, identity)
        if existing is None:
            try:
                return self.repository.create_fund(user_id, identity)["id"]
            except Exception:
                # Two saves of the same new fund at once: the unique index let
                # one through, and this one belongs to it.
                existing = self._existing(user_id, identity)
                if existing is None:
                    raise
        fund = self.repository.get_fund(user_id, existing["id"]) or {}
        newest = max((str(s.get("as_of")) for s in fund.get("sheets") or []), default="")
        if as_of >= newest:
            self.repository.update_fund(
                user_id, existing["id"], {k: v for k, v in identity.items() if v is not None}
            )
        return existing["id"]

    def _existing(self, user_id: str, identity: dict[str, Any]) -> Optional[dict[str, Any]]:
        if identity.get("isin"):
            return self.repository.find_by_isin(user_id, identity["isin"])
        return self.repository.find_by_name(user_id, identity["name"])

    @staticmethod
    def _same(name: str, submitted: Any, read_value: Any) -> bool:
        if submitted is None or read_value is None:
            return submitted is None and read_value is None
        typed, _ = coerce(name, submitted)
        return (typed if typed is not None else " ".join(str(submitted).split())) == read_value

    def _provenance(self, read: dict[str, dict[str, Any]], typed: dict[str, Any]) -> dict[str, Any]:
        """Per field: what the reader said, who set the saved value, and where on
        the sheet it came from. Every field the reader reported is recorded, kept
        or not, so a cleared value is as traceable as a saved one."""
        out: dict[str, Any] = {}
        for name in FIELDS:
            f = read.get(name) or {"status": "missing", "reasons": []}
            saved = typed.get(name)
            if saved is None:
                by = None
            elif f.get("status") != "missing" and self._same(name, saved, f.get("value")):
                by = "model"
            else:
                by = "person"
            entry: dict[str, Any] = {"read": f.get("status"), "by": by}
            if f.get("status") != "missing":
                entry.update(quote=f.get("quote"), page=f.get("page"), source=f.get("source"))
                if by == "person" or saved is None:
                    entry["model_value"] = f.get("value")
            if f.get("reasons"):
                entry["reasons"] = f["reasons"]
            out[name] = entry
        if "risk_indicator_raw" in typed and risk_level_of(typed["risk_indicator_raw"]) is not None:
            out["risk_indicator_1to5"] = {"derived_from": "risk_indicator_raw"}
        return out

    def _problems(self, values: dict[str, Any]) -> list[Problem]:
        """The catalogue's own checks over a set of reader-named values."""
        row = {k: v for k, v in values.items() if k not in IDENTITY}
        level = risk_level_of(values.get("risk_indicator_raw"))
        if level is not None:
            row["risk_indicator_1to5"] = level
        today = self.now().date()
        problems = [p for p in snapshot_validators(today=today).check(row) if p.field in FIELDS or p.field == "as_of"]
        if values.get("isin"):
            problems += IsinValidator().check({"isin": values["isin"]})
        return problems

    # ── the reasoning trace and Compare ─────────────────────────────────────

    def candidate(self, user_id: str, fund_id: str) -> Optional[FundCandidate]:
        """One of this reader's funds, shaped like a catalogue fund so the fund
        trace and Compare can read it. Its id carries UPLOAD_PREFIX, so it can
        never be mistaken for a catalogue fund in a comparison.

        Tax-free eligibility and index tracking are set to None, meaning not
        known: no fact sheet states either as a field, and the paragraphs say
        nothing either way rather than "not eligible" or "actively managed"."""
        fund = self.get_fund(user_id, fund_id)
        if fund is None:
            return None
        sheets = fund.get("sheets") or []
        sheet = sheets[0] if sheets else None
        record = {
            "id": f"{UPLOAD_PREFIX}{fund['id']}",
            "name": fund.get("name") or "",
            "fund_house": fund.get("fund_house") or "",
            "vehicle": fund.get("vehicle") or "",
            "jse_code": fund.get("jse_code"),
            "isin": fund.get("isin"),
            "asisa_category": fund.get("asisa_category") or "",
            "tfsa_eligible": None,
            "is_index_tracker": None,
        }
        snapshot = {**(sheet.get("figures") or {}), "as_of": sheet.get("as_of")} if sheet else None
        return FundCandidate(fund=record, snapshot=snapshot)

    def trace(self, user_id: str, fund_id: str) -> Optional[dict[str, Any]]:
        """The fund page's paragraph for one of this reader's funds: what its
        sheet says, and, against their profile, that it is not matched (it is
        not in the catalogue) and where its risk rating sits. None when there is
        no such fund of theirs; the trace service never raises."""
        candidate = self.candidate(user_id, fund_id)
        if candidate is None:
            return None
        point = self.traces.explain_candidate(user_id, candidate, place=upload_placing)
        return {"fund_id": candidate.fund["id"], "available": self.traces.enabled, **(point or _QUIET)}

    def compare(self, user_id: str, fund_ids: Iterable[str]) -> dict[str, Any]:
        """A written comparison of two or three funds, one or more of them this
        reader's own. Written every time and never stored. Catalogue funds are
        placed by the matcher as on Compare; uploaded ones by ``upload_placing``."""
        ids = list(dict.fromkeys(str(i).strip() for i in fund_ids if str(i).strip()))
        service = self.comparisons
        config = service.config
        if not config.min_tickers <= len(ids) <= config.max_tickers:
            raise UploadError(400, f"Compare {config.min_tickers} to {config.max_tickers} funds.")
        mine = [i for i in ids if i.startswith(UPLOAD_PREFIX)]
        if not mine:
            raise UploadError(400, "None of these is one of your uploaded funds; use Compare's own comparison.")

        loaded: dict[str, FundCandidate] = {}
        for raw in mine:
            candidate = self.candidate(user_id, raw[len(UPLOAD_PREFIX):])
            if candidate is None:
                raise UploadError(404, "One of these funds is not in your list.")
            loaded[raw] = candidate
        others = [i for i in ids if i not in loaded]
        if others:
            catalogue = service.catalogue_candidates(others)
            if catalogue is None:
                raise UploadError(404, "One of these funds is not in the catalogue.")
            loaded.update(zip(others, catalogue))

        quiet = {"fund_ids": ids, "horizon": "FUNDS", "available": service.enabled, **_QUIET, "run_at": None}
        point = service.explain_candidates(user_id, [loaded[i] for i in ids], place=_placing_for_mixed)
        return {**quiet, **(point or {}), "fund_ids": ids, "available": service.enabled}

    # ── a reader's list ─────────────────────────────────────────────────────

    def list_funds(self, user_id: str) -> list[dict[str, Any]]:
        return self.repository.list_funds(user_id)

    def get_fund(self, user_id: str, fund_id: str) -> Optional[dict[str, Any]]:
        if not _is_uuid(fund_id):
            return None
        return self.repository.get_fund(user_id, fund_id)

    def delete_fund(self, user_id: str, fund_id: str) -> bool:
        """Whether there was such a fund of theirs to delete."""
        if self.get_fund(user_id, fund_id) is None:
            return False
        self.repository.delete_fund(user_id, fund_id)
        return True


#: How an uploaded fund is named wherever it sits beside catalogue funds: in a
#: Compare link, a comparison's fund ids and a paragraph's facts. A catalogue id
#: is a bare UUID, so the two can never collide.
UPLOAD_PREFIX = "mine-"

#: What a paragraph request answers when nothing could be written.
_QUIET: dict[str, Any] = {"trace": None, "source": None, "model": None, "generated_at": None, "personal": False}


def upload_placing(candidate: FundCandidate, profile: Any, outcome: Any, today: Any):
    """Where a reader's own fund sits against their matches: never among them,
    because only catalogue funds are matched (D-153), with its risk rating set
    beside the profile's limit by the same fixed rule the matcher uses. The
    model is handed this sentence; it never decides it."""
    from src.compare.funds_trace import FundPlacing

    because = "it is a fund you uploaded, and only catalogue funds are matched to a profile"
    level = candidate.risk_level
    if level is not None:
        ceiling = ceiling_for(profile.risk_tolerance)
        side = "within" if within_ceiling(level, profile.risk_tolerance) else "above"
        because += (
            f"; its manager rates it {level} of 5, {side} the {ceiling} of 5 "
            f"your {profile.risk_tolerance} profile allows"
        )
    return FundPlacing(False, because)


def _placing_for_mixed(candidate: FundCandidate, profile: Any, outcome: Any, today: Any):
    """A comparison's placings: the matcher's for catalogue funds, ours for uploads."""
    from src.compare.funds_trace import placing_for

    if str(candidate.fund.get("id") or "").startswith(UPLOAD_PREFIX):
        return upload_placing(candidate, profile, outcome, today)
    return placing_for(candidate, profile, outcome, today)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False
