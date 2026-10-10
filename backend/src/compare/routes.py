"""The Compare page's endpoints, kept out of api.py.

Authenticated, because the paragraph is personal: it explains where the reader's own run
placed the stocks. The reader is taken from their token and never from a parameter, since
the backend holds the service-role key and row-level security does not bind it.

Two verbs on one path, so the button is the only thing that costs a model call:

  * GET reads back the reader's stored paragraph if it still describes the page, and
    otherwise answers with no paragraph. The page asks on every visit.
  * POST writes one (or returns the stored one, if a double click got there first).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from src.quant.history import HORIZONS

from .trace import normalise_tickers

logger = logging.getLogger("compare")

router = APIRouter()

_trace_instance = None


def _traces():
	"""The comparison service, built once on first use.

	Shares the Quant tab's window service rather than building its own, so the windows
	the page's columns have just fetched are the ones the paragraph is written from, out
	of the same in-memory cache, with no second yfinance call.
	"""
	global _trace_instance
	if _trace_instance is None:
		from src.quant.routes import _history

		from .trace import ComparisonTraceService

		_trace_instance = ComparisonTraceService(history=_history())
	return _trace_instance


async def current_user_id(authorization: Optional[str] = Header(None)) -> str:
	"""The caller's id, from their bearer token. Imported inside the function because
	``api`` imports this module, and at module scope that would be a circular import."""
	from src.api import _get_user_id_from_bearer

	return await _get_user_id_from_bearer(authorization)


class ExplainRequest(BaseModel):
	tickers: list[str]
	horizon: str = "6M"


def _quiet(tickers: list[str], horizon: str, available: bool) -> dict:
	return {
		"tickers": tickers,
		"horizon": horizon,
		"available": available,
		"trace": None,
		"source": None,
		"model": None,
		"generated_at": None,
		"personal": False,
		"run_at": None,
	}


def _checked(tickers: list[str], horizon: str) -> tuple[list[str], str]:
	key = (horizon or "").upper()
	if key not in HORIZONS:
		raise HTTPException(status_code=400, detail=f"horizon must be one of {', '.join(HORIZONS)}")
	symbols = normalise_tickers(tickers)
	config = _traces().config
	if not config.min_tickers <= len(symbols) <= config.max_tickers:
		raise HTTPException(
			status_code=400,
			detail=f"compare {config.min_tickers} to {config.max_tickers} tickers",
		)
	return symbols, key


async def _answer(method, user_id: str, symbols: list[str], key: str) -> dict:
	service = _traces()
	if not service.enabled:
		return _quiet(symbols, key, available=False)
	loop = asyncio.get_running_loop()
	try:
		point = await loop.run_in_executor(None, method, user_id, symbols, key)
	except Exception as exc:
		logger.warning("Comparison trace failed for %s %s: %s", symbols, key, exc)
		point = None
	if point is None:
		return _quiet(symbols, key, available=True)
	return {"tickers": symbols, "horizon": key, "available": True, **point}


@router.get("/api/compare/trace")
async def get_saved_comparison(
	tickers: str = "",
	horizon: str = "6M",
	user_id: str = Depends(current_user_id),
):
	"""The reader's stored comparison of these stocks over this horizon, if still current.

	``tickers`` is comma separated, in the order the reader picked them; the answer keeps
	that order although the store does not care about it. Never writes.
	"""
	symbols, key = _checked(tickers.split(","), horizon)
	return await _answer(_traces().saved, user_id, symbols, key)


@router.post("/api/compare/trace")
async def explain_comparison(body: ExplainRequest, user_id: str = Depends(current_user_id)):
	"""Writes the reader's comparison now, unless a current one is already stored."""
	symbols, key = _checked(body.tickers, body.horizon)
	return await _answer(_traces().explain, user_id, symbols, key)


def mount_compare_routes(app: FastAPI) -> None:
	app.include_router(router)
