"""The Quant tab's endpoints, kept out of api.py.

Informational and unauthenticated, like the sentiment history and summary endpoints they
sit beside: nothing here is personal to a user, and a window of public closes is the same
for every reader. Both answer quietly when their feature is off, so the frontend can tell
"not enabled here" from "failed" and say the right thing.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, FastAPI, HTTPException

from .history import HORIZONS

logger = logging.getLogger("quant-view")

router = APIRouter()

_history_instance = None
_trace_instance = None


def _history():
	"""The window service, built once on first use.

	Lazy so a cold start does not import pandas and yfinance for a request that never
	asks for a chart, and so a deployment with the feature off never builds one.
	"""
	global _history_instance
	if _history_instance is None:
		from .history import QuantHistoryService

		_history_instance = QuantHistoryService()
	return _history_instance


def _traces():
	"""The written paragraph over a window, built once on first use.

	Holds a Groq client, which is the main reason this is lazy: a deployment with traces
	switched off should never construct one.
	"""
	global _trace_instance
	if _trace_instance is None:
		from .trace import QuantTraceService

		_trace_instance = QuantTraceService(history=_history())
	return _trace_instance


def _check_horizon(horizon: str) -> str:
	key = (horizon or "").upper()
	if key not in HORIZONS:
		raise HTTPException(
			status_code=400,
			detail=f"horizon must be one of {', '.join(HORIZONS)}",
		)
	return key


@router.get("/api/assets/{ticker}/quant-history")
async def get_quant_history(ticker: str, horizon: str = "6M"):
	"""One ticker's closes and RSI over a horizon, with the facts the window supports.

	Fetched from yfinance the first time a (ticker, horizon) is asked for today and served
	from memory after that. A failed fetch comes back as an empty window, not an error: to
	the chart "yfinance had nothing" and "yfinance was down" are the same picture.
	"""
	symbol = ticker.upper()
	key = _check_horizon(horizon)
	service = _history()

	if not service.enabled:
		return {
			"ticker": symbol,
			"horizon": key,
			"available": False,
			"currency": "",
			"display_currency": "",
			"fx_rate": None,
			"converted": False,
			"exchange": "",
			"exchange_name": "",
			"points": [],
			"facts": None,
		}

	loop = asyncio.get_running_loop()
	try:
		payload = await loop.run_in_executor(None, service.window, symbol, key)
	except Exception as exc:
		logger.warning("Quant history failed for %s %s: %s", symbol, key, exc)
		payload = service._empty(symbol, key)
	return {**payload, "available": True}


@router.get("/api/assets/{ticker}/quant-trace")
async def get_quant_trace(ticker: str, horizon: str = "6M"):
	"""The written paragraph over one ticker's window.

	Synchronous, like the sentiment summary: it is one short completion behind an explicit
	tab open, generated the first time a (ticker, day, horizon) is asked for and read back
	from the table after that. ``trace`` is null for every quiet reason at once (feature
	off, no window, generation failed) and the panel renders one fallback for all of them.
	"""
	symbol = ticker.upper()
	key = _check_horizon(horizon)
	service = _traces()

	if not service.enabled:
		return {
			"ticker": symbol,
			"horizon": key,
			"available": False,
			"trace": None,
			"source": None,
			"model": None,
			"generated_at": None,
			"currency": None,
			"listing_currency": None,
			"fx_rate": None,
		}

	loop = asyncio.get_running_loop()
	try:
		point = await loop.run_in_executor(None, service.trace_for, symbol, key)
	except Exception as exc:
		logger.warning("Quant trace failed for %s %s: %s", symbol, key, exc)
		point = None

	if point is None:
		return {
			"ticker": symbol,
			"horizon": key,
			"available": True,
			"trace": None,
			"source": None,
			"model": None,
			"generated_at": None,
			"currency": None,
			"listing_currency": None,
			"fx_rate": None,
		}
	return {"ticker": symbol, "horizon": key, "available": True, **point}


def mount_quant_routes(app: FastAPI) -> None:
	app.include_router(router)
