"""HTTP surface for macro news, mounted under ``/api/macro`` only when
``MACRO_NEWS_ENABLED`` is set. With the flag off these paths 404 like any unknown route.

The two write endpoints are for Cloud Scheduler and carry the same shared secret as
the nightly run. The feed is public data (published headlines and our scores of them),
so like the sentiment-drivers endpoint it needs no user.
"""

from __future__ import annotations

import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query

from .config import MACRO_LOOKBACK_DAYS, MACRO_NEWS_ENABLED, MACRO_RETENTION_DAYS
from .service import MacroNewsService

router = APIRouter(prefix="/api/macro", tags=["macro-news"])

_service: Optional[MacroNewsService] = None


def get_service() -> MacroNewsService:
    """Built once on first use, so importing this module constructs nothing."""
    global _service
    if _service is None:
        _service = MacroNewsService()
    return _service


def require_scheduler(x_daily_run_secret: Optional[str] = Header(None)) -> None:
    # Read on each call rather than at import so a test can set it.
    expected = os.getenv("DAILY_RUN_SECRET")
    if not expected:
        raise HTTPException(status_code=503, detail="Macro news pull not configured")
    if not x_daily_run_secret or not secrets.compare_digest(x_daily_run_secret, expected):
        raise HTTPException(status_code=401, detail="Invalid daily run secret")


# Plain ``def`` handlers: FastAPI runs them in its threadpool, which a pull needs,
# since it blocks on Finnhub and on Jev.
@router.post("/pull", dependencies=[Depends(require_scheduler)])
def pull(service: MacroNewsService = Depends(get_service)):
    """Cloud Scheduler, three times a day: new stories in, scored, tagged and stored."""
    return service.pull()


@router.post("/rescore", dependencies=[Depends(require_scheduler)])
def rescore(service: MacroNewsService = Depends(get_service)):
    """Re-score the lookback window after a question-wording or threshold change."""
    return service.rescore()


@router.get("/news")
def news(
    days: int = Query(MACRO_LOOKBACK_DAYS, ge=1, le=MACRO_RETENTION_DAYS),
    service: MacroNewsService = Depends(get_service),
):
    return service.feed(days)


def mount_macro_news(app: FastAPI, enabled: bool = MACRO_NEWS_ENABLED) -> bool:
    """Attach the router if the feature is on. Returns whether it was mounted."""
    if not enabled:
        return False
    app.include_router(router)
    return True
