"""Tests for the lazy seed behind the unauthenticated sentiment-history endpoint.

Opening a chart for a ticker nobody has walked starts a StockTwits walk behind the
response. The endpoint needs no login, so before this guard any string at all, a typo or
a made-up name, started a walk on the limiter the runs share and left a "walked" row
behind it, and that row moved every user's "Sentiment updated" stamp.

Nothing external is touched: the history, news history and backfiller are fakes.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _FakeSocialHistory:
	def history(self, symbol, window):
		return [{"date": "2026-10-09", "score": None, "post_count": 0}]


class _FakeNewsHistory:
	enabled = False


class _FakeSeedHistory:
	def is_seeded(self, symbol):
		return False


class _FakeBackfiller:
	enabled = True

	def __init__(self):
		self.history = _FakeSeedHistory()
		self.seeded: list[str] = []

	def seed_one(self, symbol):
		self.seeded.append(symbol)
		return 0


@pytest.fixture
def client_and_backfiller(monkeypatch):
	from fastapi.testclient import TestClient

	import src.api as api

	backfiller = _FakeBackfiller()
	monkeypatch.setattr(api, "_social_history", lambda: _FakeSocialHistory())
	monkeypatch.setattr(api, "_news_history", lambda: _FakeNewsHistory())
	monkeypatch.setattr(api, "_social_backfiller", lambda: backfiller)
	return TestClient(api.app), backfiller


@pytest.mark.parametrize("ticker", ["AAPL", "brk.b", "BF-B", "T"])
def test_a_real_looking_ticker_is_seeded(client_and_backfiller, ticker):
	client, _ = client_and_backfiller

	body = client.get(f"/api/assets/{ticker}/sentiment-history").json()

	assert body["seeding"] is True
	assert body["ticker"] == ticker.upper()


@pytest.mark.parametrize(
	"ticker", ["NOT-A-TICKER", "TOOLONGX", "AB123", "A.B.C", "%27OR1%3D1", "__proto__"]
)
def test_junk_gets_its_history_but_never_a_walk(client_and_backfiller, ticker):
	client, backfiller = client_and_backfiller

	res = client.get(f"/api/assets/{ticker}/sentiment-history")

	assert res.status_code == 200
	assert res.json()["seeding"] is False
	assert backfiller.seeded == []


def test_a_started_seed_is_held_until_it_finishes(monkeypatch):
	"""The event loop keeps only a weak reference to a task, so the endpoint must hold
	one itself or a walk can be collected half way through."""
	import asyncio

	import src.api as api

	started = asyncio.Event()
	release = asyncio.Event()

	async def slow_seed(symbol):
		started.set()
		await release.wait()

	backfiller = _FakeBackfiller()
	monkeypatch.setattr(api, "_social_history", lambda: _FakeSocialHistory())
	monkeypatch.setattr(api, "_news_history", lambda: _FakeNewsHistory())
	monkeypatch.setattr(api, "_social_backfiller", lambda: backfiller)
	monkeypatch.setattr(api, "_seed_job", slow_seed)

	async def scenario():
		body = await api.get_sentiment_history("AAPL")
		await started.wait()
		held = len(api._SEED_TASKS)
		release.set()
		await asyncio.sleep(0)
		await asyncio.sleep(0)
		return body, held, len(api._SEED_TASKS)

	body, held_while_running, held_after = asyncio.run(scenario())

	assert body["seeding"] is True
	assert held_while_running == 1
	assert held_after == 0
