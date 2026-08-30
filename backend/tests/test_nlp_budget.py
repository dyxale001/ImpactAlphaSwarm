"""Tests for the GCP NLP monthly spend guard.

The claim being defended is the one the old file counter could not make: the cap
holds across restarts and across instances, and it holds while ten scoring threads
ask for units at the same moment. A guard that only mostly holds is what let the
old counter run past its cap on every cold start.

No Supabase and no network here: the shared ledger is a fake row that two ledger
instances share, which is what "two Cloud Run containers" reduces to.
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.nlp_budget import BudgetLedger, BudgetStore, FileBudgetStore  # noqa: E402


class FakeSharedStore(BudgetStore):
	"""One row, shared by every ledger pointed at it, locked like the real one."""

	def __init__(self, reserved: int = 0):
		self.reserved = reserved
		self.calls = 0
		self._lock = threading.Lock()

	def reserve(self, month: str, units: int, cap: int) -> int | None:
		with self._lock:
			self.calls += 1
			if units < 0:
				self.reserved = max(0, self.reserved + units)
				return units
			granted = max(0, min(units, cap - self.reserved))
			self.reserved += granted
			return granted


class UnreachableStore(BudgetStore):
	def reserve(self, month: str, units: int, cap: int) -> int | None:
		return None


def _ledger(store, cap=100, chunk=25, fallback=None):
	return BudgetLedger(cap=cap, primary=store, fallback=fallback or UnreachableStore(), chunk=chunk)


def test_spending_stops_at_the_cap():
	store = FakeSharedStore()
	ledger = _ledger(store, cap=10, chunk=5)

	granted = [ledger.take(1) for _ in range(15)]

	assert sum(granted) == 10
	assert granted[10:] == [0] * 5


def test_a_restart_does_not_reset_the_count():
	"""The whole point. A second ledger is a new container against the same row."""
	store = FakeSharedStore()
	first = _ledger(store, cap=10, chunk=5)
	for _ in range(10):
		first.take(1)

	restarted = _ledger(store, cap=10, chunk=5)

	assert restarted.take(1) == 0


def test_two_instances_share_one_cap():
	store = FakeSharedStore()
	one, two = _ledger(store, cap=10, chunk=5), _ledger(store, cap=10, chunk=5)

	spent = sum(ledger.take(1) for _ in range(10) for ledger in (one, two))

	assert spent == 10


def test_units_are_claimed_in_chunks():
	"""Spending is local: 25 units must not be 25 round trips."""
	store = FakeSharedStore()
	ledger = _ledger(store, cap=100, chunk=25)

	for _ in range(25):
		ledger.take(1)

	assert store.calls == 1


def test_concurrent_takers_cannot_oversell_the_cap():
	store = FakeSharedStore()
	ledger = _ledger(store, cap=10, chunk=1)
	granted: list[int] = []
	lock = threading.Lock()

	def spend():
		got = ledger.take(1)
		with lock:
			granted.append(got)

	threads = [threading.Thread(target=spend) for _ in range(40)]
	for thread in threads:
		thread.start()
	for thread in threads:
		thread.join()

	assert sum(granted) == 10


def test_an_unreachable_ledger_falls_back_to_the_file(tmp_path):
	file_store = FileBudgetStore(tmp_path / "budget.json")
	ledger = _ledger(UnreachableStore(), cap=3, chunk=1, fallback=file_store)

	assert sum(ledger.take(1) for _ in range(5)) == 3


def test_a_failed_call_returns_its_claim():
	store = FakeSharedStore()
	ledger = _ledger(store, cap=1, chunk=1)

	ledger.take(1)
	ledger.give_back(1)

	assert ledger.take(1) == 1


def test_a_clean_exit_hands_the_remainder_back():
	store = FakeSharedStore()
	ledger = _ledger(store, cap=100, chunk=25)

	ledger.take(1)
	ledger.release_unused()

	assert store.reserved == 1
