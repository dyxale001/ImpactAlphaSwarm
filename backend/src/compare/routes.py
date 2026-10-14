"""The Compare page's endpoints, kept out of api.py.

Authenticated, because the paragraph is personal: it explains where the reader's own run
placed the stocks. The reader is taken from their token and never from a parameter, since
the backend holds the service-role key and row-level security does not bind it.

Two verbs on one path, for stocks and again for funds, so the button is the only
thing that costs a model call:

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
_fund_trace_instance = None


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


def _fund_traces():
	"""The fund comparison service, built once on first use."""
	global _fund_trace_instance
	if _fund_trace_instance is None:
		from .funds_trace import FundComparisonService

		_fund_trace_instance = FundComparisonService()
	return _fund_trace_instance


async def current_user_id(authorization: Optional[str] = Header(None)) -> str:
	"""The caller's id, from their bearer token. Imported inside the function because
	``api`` imports this module, and at module scope that would be a circular import."""
	from src.api import _get_user_id_from_bearer

	return await _get_user_id_from_bearer(authorization)


class ExplainRequest(BaseModel):
	tickers: list[str]
	horizon: str = "6M"


class ExplainFundsRequest(BaseModel):
	fund_ids: list[str]


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


# ── funds ────────────────────────────────────────────────────────────────────

def _checked_funds(ids: list[str]) -> list[str]:
	from .funds_trace import normalise_fund_ids

	found = normalise_fund_ids(ids)
	config = _fund_traces().config
	if not config.min_tickers <= len(found) <= config.max_tickers:
		raise HTTPException(
			status_code=400,
			detail=f"compare {config.min_tickers} to {config.max_tickers} funds",
		)
	return found


async def _answer_funds(method, user_id: str, ids: list[str]) -> dict:
	from .funds_trace import FUNDS_HORIZON

	service = _fund_traces()
	quiet = {**_quiet(ids, FUNDS_HORIZON, available=service.enabled), "fund_ids": ids}
	quiet.pop("tickers")
	if not service.enabled:
		return quiet
	loop = asyncio.get_running_loop()
	try:
		point = await loop.run_in_executor(None, method, user_id, ids)
	except Exception as exc:
		logger.warning("Fund comparison failed for %s: %s", ids, exc)
		point = None
	if point is None:
		return quiet
	return {"fund_ids": ids, "horizon": FUNDS_HORIZON, "available": True, **point}


@router.get("/api/compare/funds/trace")
async def get_saved_fund_comparison(ids: str = "", user_id: str = Depends(current_user_id)):
	"""The reader's stored fund comparison, if still current. Never writes."""
	found = _checked_funds(ids.split(","))
	return await _answer_funds(_fund_traces().saved, user_id, found)


@router.post("/api/compare/funds/trace")
async def explain_fund_comparison(body: ExplainFundsRequest, user_id: str = Depends(current_user_id)):
	"""Writes the reader's fund comparison now, unless a current one is stored."""
	found = _checked_funds(body.fund_ids)
	return await _answer_funds(_fund_traces().explain, user_id, found)


def mount_compare_routes(app: FastAPI) -> None:
	app.include_router(router)
