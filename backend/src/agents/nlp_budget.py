"""Monthly spend guard for the metered GCP NLP calls.
"""

from __future__ import annotations

import atexit
import json
import logging
import os
import threading
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("sentiment-scout")

CACHE_DIR = Path(os.getenv("ALPHASWARM_CACHE_DIR", "data/cache"))
BUDGET_FILE = CACHE_DIR / "gcp_nlp_budget.json"


def current_month() -> str:
	return datetime.now(timezone.utc).strftime("%Y-%m")


def monthly_budget() -> int:
	try:
		return int(os.getenv("GOOGLE_NLP_MONTHLY_BUDGET", "500"))
	except ValueError:
		return 500


class BudgetStore(ABC):
	"""Where the month's running total is kept."""

	@abstractmethod
	def reserve(self, month: str, units: int, cap: int) -> int | None:
		"""Claim up to ``units`` of this month's cap.

		Returns how many were granted, or ``None`` when the store is unreachable so
		the ledger can try the next one.
		"""

	def release(self, month: str, units: int) -> None:
		"""Hand back claimed-but-unspent units. Best effort, never raises.

		A negative claim is the same operation as a positive one, so every store
		gets this for free from its own ``reserve``.
		"""
		if units > 0:
			self.reserve(month, -units, 0)


class SupabaseBudgetStore(BudgetStore):
	"""The shared ledger. Survives restarts and is seen by every instance."""

	RPC = "reserve_nlp_units"

	def _call(self, month: str, units: int, cap: int) -> int | None:
		# Imported on call: supabase_client raises at import when its env vars are
		# missing, and a missing Supabase must degrade the guard, not break scoring.
		from ..utils.supabase_client import supabase

		res = supabase.rpc(self.RPC, {"p_month": month, "p_units": units, "p_cap": cap}).execute()
		granted = res.data
		# PostgREST returns a bare scalar for a scalar function, but wraps it in
		# some client versions.
		if isinstance(granted, list):
			granted = granted[0] if granted else 0
		if isinstance(granted, dict):
			granted = next(iter(granted.values()), 0)
		return int(granted or 0)

	def reserve(self, month: str, units: int, cap: int) -> int | None:
		try:
			granted = self._call(month, units, cap)
		except Exception as e:
			logger.info("NLP budget ledger unreachable, using the local file: %s", e)
			return None
		# A release passes negative units and gets them back unchanged; only a claim
		# is floored, so an odd response cannot read as free units.
		return granted if units < 0 else max(0, granted)


class FileBudgetStore(BudgetStore):
	"""The old per-container counter, kept as the fallback.

	Worth keeping for local runs with no Supabase, and as something rather than
	nothing if the ledger is down mid-run.
	"""

	def __init__(self, path: Path | None = None):
		self.path = path or BUDGET_FILE
		self._lock = threading.Lock()

	def _read(self, month: str) -> int:
		try:
			data = json.loads(self.path.read_text(encoding="utf-8"))
		except (FileNotFoundError, ValueError, OSError):
			return 0
		return int(data.get("used", 0)) if data.get("month") == month else 0

	def reserve(self, month: str, units: int, cap: int) -> int | None:
		with self._lock:
			used = self._read(month)
			granted = max(0, min(units, cap - used)) if units > 0 else units
			if granted == 0:
				return 0
			try:
				self.path.parent.mkdir(parents=True, exist_ok=True)
				self.path.write_text(
					json.dumps({"month": month, "used": max(0, used + granted)}), encoding="utf-8"
				)
			except OSError:
				# Cannot persist, so cannot account. Allow the spend rather than
				# silently degrading every score to VADER on a read-only disk.
				pass
			return granted


class BudgetLedger:
	"""Hands out units against the month's cap, one small reservation at a time."""

	CHUNK = 25

	def __init__(
		self,
		cap: int | None = None,
		primary: BudgetStore | None = None,
		fallback: BudgetStore | None = None,
		chunk: int | None = None,
	):
		self.cap = monthly_budget() if cap is None else cap
		self.primary = primary or SupabaseBudgetStore()
		self.fallback = fallback or FileBudgetStore()
		self.chunk = max(1, chunk or _env_chunk())
		self._lock = threading.Lock()
		self._month: str | None = None
		self._remaining = 0

	def take(self, units: int = 1) -> int:
		"""Claim ``units`` to spend now. Returns how many the cap allows, 0 when it
		is exhausted, which is the caller's signal to fall back to VADER."""
		with self._lock:
			month = current_month()
			if month != self._month:
				# The rollover voids any held reservation: it belonged to last month's
				# row and last month's cap.
				self._month, self._remaining = month, 0
			if self._remaining < units:
				self._remaining += self._reserve(max(self.chunk, units))
			taken = min(units, self._remaining)
			self._remaining -= taken
			return taken

	def give_back(self, units: int = 1) -> None:
		"""Return units claimed for a call that never billed, e.g. one the API
		refused. Local only, so it costs nothing."""
		with self._lock:
			self._remaining += max(0, units)

	def release_unused(self) -> None:
		"""Hand the held remainder back to the shared ledger on a clean exit."""
		with self._lock:
			remaining, month, self._remaining = self._remaining, self._month, 0
		if remaining > 0 and month:
			self.primary.release(month, remaining)

	def _reserve(self, units: int) -> int:
		granted = self.primary.reserve(self._month or current_month(), units, self.cap)
		if granted is None:
			granted = self.fallback.reserve(self._month or current_month(), units, self.cap)
		return max(0, granted or 0)


def _env_chunk() -> int:
	try:
		return int(os.getenv("GOOGLE_NLP_RESERVATION_CHUNK", str(BudgetLedger.CHUNK)))
	except ValueError:
		return BudgetLedger.CHUNK


_ledger: BudgetLedger | None = None
_ledger_lock = threading.Lock()


def get_ledger() -> BudgetLedger:
	"""The process-wide ledger, built on first use."""
	global _ledger
	with _ledger_lock:
		if _ledger is None:
			_ledger = BudgetLedger()
			atexit.register(_ledger.release_unused)
		return _ledger
