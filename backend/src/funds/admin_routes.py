"""Admin surface for maintaining the fund catalogue.

Mounted under ``/api/admin/fund-catalogue`` and, like the public router, only
when ``FUNDS_ENABLED`` is set. Every route requires an admin, checked the same
way every other admin route in this backend checks it.

**Nothing here deletes anything, and that is the schema's decision, not a
missing feature.** Migration 024 grants only select/insert/update on ``funds``
and ``fund_factsheet_snapshots``, because a catalogue of published documents is
evidence: a fund is retired by clearing ``is_active``, and a fact sheet is
corrected by recording another one. ``latest_snapshots`` then prefers the newer
row, so a correction takes effect without anything being destroyed. An admin
interface offering a delete button would be promising something the database
will refuse.

Validation is the same ``ValidatorChain`` the seed loader runs, so a row typed
into a form and a row transcribed into a CSV are held to one standard. Blocking
problems come back as 422 with every problem listed, rather than the first one:
someone filling a form wants to fix all of it in one pass.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import FUNDS_ENABLED
from .repository import FundRepository
from .validators import Problem, fund_validators, snapshot_validators

router = APIRouter(prefix="/api/admin/fund-catalogue", tags=["fund-catalogue-admin"])

# A fact sheet's content is updated at least quarterly under Board Notice 92 and
# monthly in practice. Past the soft threshold a sheet is worth re-checking;
# past the hard one the figures on the page are old enough to be misleading.
SOFT_STALE_DAYS = 45
STALE_DAYS = 90

_repository: Optional[FundRepository] = None


def get_repository() -> FundRepository:
    """The repository, built once on first use and overridable in a test."""
    global _repository
    if _repository is None:
        _repository = FundRepository()
    return _repository


async def require_admin(authorization: Optional[str] = Header(None)) -> str:
    """The caller's id, or 401/403. Imported inside to avoid a circular import.

    Reuses the app's own two helpers rather than re-deriving the rule, so an
    admin here means exactly what it means everywhere else.
    """
    from src.api import _get_user_id_from_bearer, _require_admin

    user_id = await _get_user_id_from_bearer(authorization)
    await _require_admin(user_id)
    return user_id


# ── request bodies ──────────────────────────────────────────────────────────
#
# Optional everywhere it can be, because the validators own what is required.
# Duplicating "this field is mandatory" in pydantic would give two answers to
# the same question, and the one the seed loader enforces is the real one.


class FundIn(BaseModel):
    isin: str
    name: str
    fund_house: str
    manco: str
    vehicle: str
    asisa_geography: str
    asisa_asset_class: str
    asisa_category: str
    is_index_tracker: bool = False
    jse_code: Optional[str] = None
    yahoo_symbol: Optional[str] = None
    tfsa_eligible: bool = False
    platforms: list[str] = Field(default_factory=list)
    mdd_page_url: Optional[str] = None
    curation_rule: Optional[str] = None


class FundPatch(BaseModel):
    name: Optional[str] = None
    fund_house: Optional[str] = None
    manco: Optional[str] = None
    vehicle: Optional[str] = None
    asisa_geography: Optional[str] = None
    asisa_asset_class: Optional[str] = None
    asisa_category: Optional[str] = None
    is_index_tracker: Optional[bool] = None
    jse_code: Optional[str] = None
    yahoo_symbol: Optional[str] = None
    tfsa_eligible: Optional[bool] = None
    platforms: Optional[list[str]] = None
    mdd_page_url: Optional[str] = None
    curation_rule: Optional[str] = None
    #: Clearing this retires the fund. It is the only "removal" there is.
    is_active: Optional[bool] = None


class SnapshotIn(BaseModel):
    as_of: str
    mdd_url: Optional[str] = None
    risk_indicator_raw: Optional[str] = None
    risk_indicator_1to5: Optional[int] = None
    recommended_min_term_years: Optional[float] = None
    objective: Optional[str] = None
    benchmark: Optional[str] = None
    ter: Optional[float] = None
    tc: Optional[float] = None
    tic: Optional[float] = None
    fund_size_zar: Optional[float] = None
    min_lump_sum: Optional[float] = None
    min_debit_order: Optional[float] = None
    distribution_frequency: Optional[str] = None
    asset_allocation: Optional[dict[str, float]] = None
    performance: Optional[dict[str, float]] = None
    top_holdings: Optional[dict[str, float]] = None


def _reject(problems: list[Problem]) -> None:
    """Turn blocking problems into a 422 that lists all of them."""
    blocking = [p for p in problems if p.blocking]
    if not blocking:
        return
    raise HTTPException(
        status_code=422,
        detail={
            "message": "This row cannot be saved yet.",
            "problems": [{"field": p.field, "message": p.message, "severity": p.severity} for p in blocking],
        },
    )


def _warnings(problems: list[Problem]) -> list[dict[str, str]]:
    """Non-blocking problems, returned alongside a successful save.

    A stale fact-sheet date does not stop a save — the figures may genuinely be
    the newest published — but the person saving should be told.
    """
    return [
        {"field": p.field, "message": p.message, "severity": p.severity}
        for p in problems
        if not p.blocking
    ]


def _staleness(as_of: Any, today: date) -> dict[str, Any]:
    """How old this fund's newest fact sheet is, and what to call that.

    Returned as data rather than a rendered badge so the page decides how to
    show it and this stays testable without a browser.
    """
    if not as_of:
        return {"as_of": None, "age_days": None, "status": "missing"}
    parsed = as_of if isinstance(as_of, date) else None
    if parsed is None:
        try:
            parsed = datetime.strptime(str(as_of).strip(), "%Y-%m-%d").date()
        except ValueError:
            return {"as_of": str(as_of), "age_days": None, "status": "unreadable"}
    age = (today - parsed).days
    if age > STALE_DAYS:
        status = "stale"
    elif age > SOFT_STALE_DAYS:
        status = "ageing"
    else:
        status = "current"
    return {"as_of": parsed.isoformat(), "age_days": age, "status": status}


@router.get("/funds")
def list_funds_for_admin(
    _admin: str = Depends(require_admin),
    repo: FundRepository = Depends(get_repository),
):
    """Every fund, retired included, oldest fact sheet first.

    Ordered by staleness rather than by name because this page exists to answer
    one question — what needs re-reading — and the answer should be at the top.
    Funds with no fact sheet at all sort first: they cannot be matched to anyone
    until one is recorded.
    """
    funds = repo.list_every()
    newest = repo.latest_snapshots([f["id"] for f in funds if f.get("id")])
    today = date.today()

    rows = []
    for fund in funds:
        snapshot = newest.get(fund.get("id")) or {}
        rows.append({**fund, "staleness": _staleness(snapshot.get("as_of"), today)})

    # None first, then oldest. -1 keeps "no sheet" above every real age.
    rows.sort(key=lambda r: (r["staleness"]["age_days"] is not None, -(r["staleness"]["age_days"] or 0)))
    return {
        "count": len(rows),
        "funds": rows,
        "soft_stale_days": SOFT_STALE_DAYS,
        "stale_days": STALE_DAYS,
    }


@router.post("/funds", status_code=201)
def create_fund(
    body: FundIn,
    admin_id: str = Depends(require_admin),
    repo: FundRepository = Depends(get_repository),
):
    """Add a fund. Validated exactly as the seed loader validates a CSV row."""
    row = body.model_dump()
    problems = fund_validators().check(row)
    _reject(problems)

    if repo.get_by_isin(row["isin"]):
        raise HTTPException(
            status_code=409,
            detail={"message": f"A fund with ISIN {row['isin']} is already in the catalogue."},
        )

    written = repo.upsert_fund(row)
    return {"fund": written[0] if written else None, "warnings": _warnings(problems)}


@router.patch("/funds/{fund_id}")
def update_fund(
    fund_id: str,
    body: FundPatch,
    admin_id: str = Depends(require_admin),
    repo: FundRepository = Depends(get_repository),
):
    """Edit a fund, or retire it by setting ``is_active`` false.

    The patch is validated against the fund as it would be after the change, not
    against the patch alone: a category is only valid in the context of the rest
    of the row.
    """
    existing = repo.get(fund_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Fund not found")

    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    problems = fund_validators().check({**existing, **patch})
    _reject(problems)

    written = repo.update_fund(fund_id, patch)
    return {"fund": written[0] if written else None, "warnings": _warnings(problems)}


@router.post("/funds/{fund_id}/snapshots", status_code=201)
def add_snapshot(
    fund_id: str,
    body: SnapshotIn,
    admin_id: str = Depends(require_admin),
    repo: FundRepository = Depends(get_repository),
):
    """Record a fact sheet against a fund.

    This is also how a correction is made: re-reading a figure off the same
    sheet produces another row for the same date, and the read path prefers the
    newest. Nothing is overwritten, so the earlier reading stays as the record
    of what the catalogue said at the time.
    """
    fund = repo.get(fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    row = body.model_dump()
    problems = snapshot_validators().check(row)
    _reject(problems)

    row["fund_id"] = fund_id
    row["source"] = "manual"
    row["entered_by"] = admin_id
    row["reviewed_by"] = admin_id
    row["review_status"] = "approved"
    # Stands in for the document's own hash, which only exists once a PDF is
    # archived. Covers the transcribed values so that a corrected reading is a
    # new row rather than a duplicate — the same rule the seed loader uses.
    row["mdd_sha256"] = repo.transcription_hash(fund.get("isin") or fund_id, row)

    written = repo.insert_snapshot(row)
    return {"snapshot": written[0] if written else None, "warnings": _warnings(problems)}


def mount_fund_catalogue_admin(app: FastAPI, enabled: bool = FUNDS_ENABLED) -> bool:
    """Attach the admin router if the feature is on. Returns the decision."""
    if not enabled:
        return False
    app.include_router(router)
    return True
