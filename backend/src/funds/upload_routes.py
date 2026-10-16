"""HTTP surface for a reader's uploaded fact sheets.

Mounted under ``/api/fund-uploads`` only when both ``FUNDS_ENABLED`` and
``FUND_UPLOADS_ENABLED`` are set. Every path is personal, so the reader always
comes from their token (``current_user_id``), never from a parameter.

    POST   /api/fund-uploads/read   a PDF in, every field for review out
    POST   /api/fund-uploads        the reviewed values in, the saved fund out
    GET    /api/fund-uploads        the reader's funds, each with its newest sheet
    GET    /api/fund-uploads/{id}   one of them, with every sheet
    DELETE /api/fund-uploads/{id}   remove it and its sheets
    POST   /api/fund-uploads/{id}/trace   the fund page's paragraph, written now
    POST   /api/fund-uploads/compare      a written comparison including one of them

Handlers stay thin; the rules are in upload_service.py. The database-only
handlers are plain ``def`` so FastAPI runs them off the event loop; the read is
``async`` only to await the upload, and runs the model call in an executor.
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from .routes import current_user_id
from .upload_service import FactSheetUploadService, UploadError

router = APIRouter(prefix="/api/fund-uploads", tags=["fund-uploads"])

_service: Optional[FactSheetUploadService] = None


def get_upload_service() -> FactSheetUploadService:
    """Built once on first use; a dependency so a test can replace it."""
    global _service
    if _service is None:
        _service = FactSheetUploadService()
    return _service


class SaveIn(BaseModel):
    """What the review screen sends back.

    ``values`` is the final value of every field the reader wants kept, keyed by
    the reader's field names; null clears a field. ``confirmed`` lists the
    flagged fields they looked at and kept as read.
    """

    review_token: str = Field(..., max_length=200_000)
    values: dict[str, Any]
    confirmed: list[str] = Field(default_factory=list)
    vehicle: Optional[Literal["unit_trust", "etf"]] = None
    fund_house: Optional[str] = Field(None, max_length=200)


class CompareIn(BaseModel):
    """Two or three fund ids: catalogue ids and ``mine-<id>`` uploads."""

    fund_ids: list[str] = Field(..., max_length=10)


def _raise(error: UploadError):
    raise HTTPException(status_code=error.status, detail=error.detail)


# Declared before the "/{fund_id}" routes, so "compare" is never read as an id.
@router.post("/compare")
async def compare_with_uploads(
    body: CompareIn,
    user_id: str = Depends(current_user_id),
    service: FactSheetUploadService = Depends(get_upload_service),
):
    """Compare's written comparison, for a set holding one of the reader's own
    funds. Written each time (it is never stored), so the model call runs off
    the event loop."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, service.compare, user_id, body.fund_ids)
    except UploadError as e:
        _raise(e)


@router.post("/{fund_id}/trace")
async def explain_uploaded_fund(
    fund_id: str,
    user_id: str = Depends(current_user_id),
    service: FactSheetUploadService = Depends(get_upload_service),
):
    """The fund page's reasoning trace for one of the reader's own funds."""
    loop = asyncio.get_running_loop()
    point = await loop.run_in_executor(None, service.trace, user_id, fund_id)
    if point is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    return point


@router.post("/read")
async def read_fact_sheet(
    file: UploadFile = File(...),
    user_id: str = Depends(current_user_id),
    service: FactSheetUploadService = Depends(get_upload_service),
):
    """Read an uploaded fact sheet for review. Saves nothing about the reader
    but the upload count; the PDF itself is discarded."""
    # One byte over the limit is enough to know it is over.
    document = await file.read(service.max_bytes + 1)
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, service.read, user_id, document)
    except UploadError as e:
        _raise(e)


@router.post("", status_code=201)
def save_fact_sheet(
    body: SaveIn,
    user_id: str = Depends(current_user_id),
    service: FactSheetUploadService = Depends(get_upload_service),
):
    """Save a reviewed sheet to the reader's funds."""
    try:
        return service.save(
            user_id,
            body.review_token,
            body.values,
            confirmed=body.confirmed,
            vehicle=body.vehicle,
            fund_house=body.fund_house,
        )
    except UploadError as e:
        _raise(e)


@router.get("")
def my_uploaded_funds(
    user_id: str = Depends(current_user_id),
    service: FactSheetUploadService = Depends(get_upload_service),
):
    return service.list_funds(user_id)


@router.get("/{fund_id}")
def my_uploaded_fund(
    fund_id: str,
    user_id: str = Depends(current_user_id),
    service: FactSheetUploadService = Depends(get_upload_service),
):
    fund = service.get_fund(user_id, fund_id)
    if fund is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund


@router.delete("/{fund_id}", status_code=204)
def delete_uploaded_fund(
    fund_id: str,
    user_id: str = Depends(current_user_id),
    service: FactSheetUploadService = Depends(get_upload_service),
):
    if not service.delete_fund(user_id, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")
    return Response(status_code=204)


def mount_fund_uploads(app: FastAPI, enabled: bool = False) -> bool:
    """Attach the router if the feature is on. Returns whether it was mounted."""
    if not enabled:
        return False
    app.include_router(router)
    return True
