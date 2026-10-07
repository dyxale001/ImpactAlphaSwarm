"""The Compare page's endpoint, kept out of api.py.

Informational and unauthenticated, like the quant trace it is built from: nothing here is
personal to a user, which is what lets one paragraph per set be cached and shared. The
user's own run (scorecard, place in the run) is read by the page directly under RLS and
explained there with a template, never sent here.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, FastAPI, HTTPException

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


def _quiet(tickers: list[str], horizon: str, available: bool) -> dict:
	return {
		"tickers": tickers,
		"horizon": horizon,
		"available": available,
		"trace": None,
		"source": None,
		"model": None,
		"generated_at": None,
	}


@router.get("/api/compare/trace")
async def get_comparison_trace(tickers: str = "", horizon: str = "6M"):
	"""The written comparison of two or three stocks over one horizon.

	``tickers`` is comma separated, in the order the reader picked them; the answer keeps
	that order even though the cache does not care about it. Generated the first time a
	set is asked for today and read back from the table after that.
	"""
	key = (horizon or "").upper()
	if key not in HORIZONS:
		raise HTTPException(status_code=400, detail=f"horizon must be one of {', '.join(HORIZONS)}")
	symbols = normalise_tickers(tickers.split(","))
	service = _traces()
	if not service.config.min_tickers <= len(symbols) <= service.config.max_tickers:
		raise HTTPException(
			status_code=400,
			detail=f"compare {service.config.min_tickers} to {service.config.max_tickers} tickers",
		)

	if not service.enabled:
		return _quiet(symbols, key, available=False)

	loop = asyncio.get_running_loop()
	try:
		point = await loop.run_in_executor(None, service.trace_for, symbols, key)
	except Exception as exc:
		logger.warning("Comparison trace failed for %s %s: %s", symbols, key, exc)
		point = None

	if point is None:
		return _quiet(symbols, key, available=True)
	return {"tickers": symbols, "horizon": key, "available": True, **point}


def mount_compare_routes(app: FastAPI) -> None:
	app.include_router(router)
