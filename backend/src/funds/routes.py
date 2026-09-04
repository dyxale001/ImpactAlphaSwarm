"""HTTP surface for the funds catalogue.

Mounted under ``/api/fund-catalogue`` and only when ``FUNDS_ENABLED`` is set, so
with the flag off these paths 404 like any unknown route and this module is never
imported. ``/api/funds`` is deliberately untouched — it already exists and
returns 13F institutional holdings, which are somebody else's holdings rather
than something anyone can invest in.

The first ``APIRouter`` in this backend; everything so far hangs off the app
object directly. A router because this is a bounded feature with a shared prefix
and a flag, and because it makes the whole surface testable against a bare
FastAPI app with the service overridden.

Handlers stay thin on purpose. Anything worth arguing about is in the service,
the matcher or the copy module, where it can be tested without HTTP.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query

from .config import FUNDS_ENABLED
from .models import FundFilters
from .service import FundCatalogueService

router = APIRouter(prefix="/api/fund-catalogue", tags=["fund-catalogue"])

_service: Optional[FundCatalogueService] = None


def get_service() -> FundCatalogueService:
    """The service, built once on first use.

    A dependency rather than a module-level instance so a test can override it,
    and lazy so importing this module does not construct a Supabase client.
    """
    global _service
    if _service is None:
        _service = FundCatalogueService()
    return _service


async def current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """The caller's id, from their bearer token.

    Reuses the helper every other authenticated route uses. Imported inside the
    function because ``api`` imports this module, and at module scope that would
    be a circular import.

    The id comes from the token and never from a parameter: the backend holds the
    service-role key, so row-level security does not apply to it, and a
    user_id argument would let anyone read anyone's matches.
    """
    from src.api import _get_user_id_from_bearer

    return await _get_user_id_from_bearer(authorization)


@router.get("")
def list_catalogue(
    vehicle: Optional[str] = Query(None, pattern="^(unit_trust|etf)$"),
    geography: Optional[str] = None,
    asset_class: Optional[str] = None,
    category: Optional[str] = None,
    manco: Optional[str] = None,
    tfsa: Optional[bool] = None,
    q: Optional[str] = None,
    service: FundCatalogueService = Depends(get_service),
):
    """Every active fund, filtered, alphabetical."""
    return service.list_funds(
        FundFilters(
            vehicle=vehicle,
            geography=geography,
            asset_class=asset_class,
            category=category,
            manco=manco,
            tfsa=tfsa,
            query=q,
        )
    )


@router.get("/meta")
def catalogue_meta(service: FundCatalogueService = Depends(get_service)):
    """The classification, the vehicles, the risk scale and the page furniture."""
    return service.meta()


@router.get("/matches")
async def my_matches(
    user_id: str = Depends(current_user_id),
    service: FundCatalogueService = Depends(get_service),
):
    """The funds whose published risk label matches the caller's own profile."""
    return service.matches_for(user_id)


# Declared last: a literal path must be registered before the parameterised one,
# or "/meta" and "/matches" are read as fund ids.
@router.get("/{fund_id}")
def fund_detail(fund_id: str, service: FundCatalogueService = Depends(get_service)):
    """One fund, its newest fact sheet, and its published history."""
    detail = service.fund_detail(fund_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    return detail


def mount_fund_catalogue(app: FastAPI, enabled: bool = FUNDS_ENABLED) -> bool:
    """Attach the router if the feature is on. Returns whether it was mounted.

    Returning the decision rather than logging it so a test can assert the
    mounting itself, not just its consequences.
    """
    if not enabled:
        return False
    app.include_router(router)
    return True
