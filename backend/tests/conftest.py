import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import src.api as api


@pytest.fixture(autouse=True)
def _no_real_ask_query_logging(monkeypatch):
    """/api/ask now writes one ask_query_logs row per request (Admin Reports
    Chatbot instrumentation). Every existing ask test calls api.ask_alphaswarm
    directly and none of them mock Supabase for this, so without this
    autouse no-op every one of them would attempt a real network call on
    every run. Tests that specifically exercise the logging behaviour
    re-patch api._log_ask_query (or api.supabase) themselves, which
    overrides this fixture's patch within that test."""
    monkeypatch.setattr(api, "_log_ask_query", lambda **kwargs: None)
