"""Unit tests for run-trace collection and persistence (src/utils/traces.py).

Two things are worth pinning here.

The first is that ``Tracer`` collects correctly: steps land in order, dataclass
payloads are flattened to plain dicts (a trace has to survive ``json.dump``), and
a ticker's metrics are keyed by ticker rather than appended.

The second is substitutability. ``Tracer`` names ``TraceStore``, never a file, so
every one of these tests runs against the in-memory store and touches no disk.
The contract tests at the bottom then run the SAME assertions against both
implementations — that is the property that makes the in-memory store a valid
stand-in rather than merely a convenient one.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import pytest  # noqa: E402

from src.utils.traces import (  # noqa: E402
    FileTraceStore,
    InMemoryTraceStore,
    QuantMetrics,
    SocialMention,
    Tracer,
)


def a_tracer(store=None, **kw):
    return Tracer(
        run_id=kw.pop("run_id", "run-1"),
        user_id=kw.pop("user_id", "user-1"),
        store=store or InMemoryTraceStore(),
        **kw,
    )


def a_mention(message_id="m1"):
    return SocialMention(
        source="stocktwits",
        message_id=message_id,
        raw_text="$NVDA to the moon",
        cleaned_text="NVDA to the moon",
        created_at="2026-09-01T10:00:00Z",
        engagement_count=7,
    )


# ═════════════════════════════════════════════════════════════════════════════
# Collection
# ═════════════════════════════════════════════════════════════════════════════

class TestCollection:
    def test_the_header_is_recorded_from_the_constructor(self):
        t = a_tracer(risk_tolerance="Conservative", universes=["tech"], tickers=["NVDA"])
        assert t.trace["run_id"] == "run-1"
        assert t.trace["user_id"] == "user-1"
        assert t.trace["risk_tolerance"] == "Conservative"
        assert t.trace["universes"] == ["tech"]
        assert t.trace["tickers"] == ["NVDA"]

    def test_absent_universes_and_tickers_become_empty_lists_not_none(self):
        # Downstream code iterates these without checking.
        t = a_tracer()
        assert t.trace["universes"] == []
        assert t.trace["tickers"] == []

    def test_steps_are_appended_in_call_order(self):
        t = a_tracer()
        t.log_step("phase_1")
        t.log_step("phase_2", {"tickers": 5})
        assert [s["step"] for s in t.trace["steps"]] == ["phase_1", "phase_2"]
        assert t.trace["steps"][1]["metadata"] == {"tickers": 5}

    def test_a_step_without_metadata_still_carries_a_dict(self):
        t = a_tracer()
        t.log_step("phase_1")
        assert t.trace["steps"][0]["metadata"] == {}

    def test_mentions_are_flattened_to_dicts_and_tagged_with_their_ticker(self):
        t = a_tracer()
        t.add_messages("NVDA", [a_mention("m1"), a_mention("m2")])
        rows = t.trace["collectors"]["messages"]
        assert [r["message_id"] for r in rows] == ["m1", "m2"]
        assert all(r["ticker"] == "NVDA" for r in rows)
        assert all(isinstance(r, dict) for r in rows)

    def test_mentions_from_two_tickers_accumulate_rather_than_replace(self):
        t = a_tracer()
        t.add_messages("NVDA", [a_mention("m1")])
        t.add_messages("MSFT", [a_mention("m2")])
        assert {r["ticker"] for r in t.trace["collectors"]["messages"]} == {"NVDA", "MSFT"}

    def test_a_plain_dict_mention_is_accepted_unchanged(self):
        # The scout does not always hand back dataclasses.
        t = a_tracer()
        t.add_messages("NVDA", [{"message_id": "raw", "source": "x"}])
        assert t.trace["collectors"]["messages"][0]["message_id"] == "raw"

    def test_quant_metrics_are_keyed_by_ticker(self):
        t = a_tracer()
        t.add_quant_metrics("NVDA", QuantMetrics(ticker="NVDA", rsi=55.0))
        t.add_quant_metrics("MSFT", QuantMetrics(ticker="MSFT", rsi=45.0))
        metrics = t.trace["collectors"]["quant_metrics"]
        assert set(metrics) == {"NVDA", "MSFT"}
        assert metrics["NVDA"]["rsi"] == 55.0

    def test_re_adding_a_tickers_metrics_replaces_rather_than_duplicates(self):
        t = a_tracer()
        t.add_quant_metrics("NVDA", QuantMetrics(ticker="NVDA", rsi=55.0))
        t.add_quant_metrics("NVDA", QuantMetrics(ticker="NVDA", rsi=60.0))
        assert t.trace["collectors"]["quant_metrics"]["NVDA"]["rsi"] == 60.0

    def test_sentiment_output_is_stored_per_ticker(self):
        t = a_tracer()
        t.add_sentiment_output("NVDA", {"sentiment_score": 71})
        assert t.trace["sentiment_outputs"]["NVDA"] == {"sentiment_score": 71}

    def test_aggregates_record_both_the_rankings_and_the_scores(self):
        t = a_tracer()
        t.add_aggregates([{"ticker": "NVDA"}], {"NVDA": {"unified_score": 80}})
        agg = t.trace["aggregates"]
        assert agg["final_rankings"] == [{"ticker": "NVDA"}]
        assert agg["unified_scores"] == {"NVDA": {"unified_score": 80}}
        assert agg["generated_at"].endswith("Z")


# ═════════════════════════════════════════════════════════════════════════════
# Persistence — the same assertions against every TraceStore
# ═════════════════════════════════════════════════════════════════════════════

@pytest.fixture(params=["memory", "file"])
def store(request, tmp_path):
    """Each persistence test runs once per implementation.

    This is the substitutability check: if a store cannot pass these, it is not a
    valid stand-in for the one the pipeline actually uses.
    """
    if request.param == "memory":
        return InMemoryTraceStore()
    return FileTraceStore(tmp_path)


class TestStoreContract:
    def test_saving_returns_a_location_and_stamps_it_into_the_trace(self, store):
        t = a_tracer(store)
        location = t.save()
        assert location
        assert t.trace["artifacts"]["trace_path"] == location
        assert t.trace["artifacts"]["saved_at"].endswith("Z")

    def test_a_saved_trace_reads_back_identically(self, store):
        t = a_tracer(store)
        t.log_step("phase_1", {"n": 3})
        t.add_messages("NVDA", [a_mention()])
        t.save()
        assert store.load("run-1") == t.trace

    def test_loading_an_unknown_run_returns_none_rather_than_raising(self, store):
        assert store.load("never-saved") is None

    def test_listing_an_empty_store_returns_an_empty_list(self, store):
        assert store.list() == []

    def test_every_saved_run_is_listed(self, store):
        for run_id in ("run-1", "run-2", "run-3"):
            a_tracer(store, run_id=run_id).save()
        assert len(store.list()) == 3

    def test_the_limit_caps_the_listing(self, store):
        for run_id in ("run-1", "run-2", "run-3"):
            a_tracer(store, run_id=run_id).save()
        assert len(store.list(limit=2)) == 2

    def test_re_saving_a_run_overwrites_rather_than_duplicating(self, store):
        t = a_tracer(store)
        t.save()
        t.log_step("later")
        t.save()
        assert len(store.list()) == 1
        assert len(store.load("run-1")["steps"]) == 1


class TestFileStoreSpecifics:
    def test_the_directory_is_created_on_demand(self, tmp_path):
        target = tmp_path / "does" / "not" / "exist"
        a_tracer(FileTraceStore(target)).save()
        assert (target / "run-1.trace.json").exists()

    def test_what_lands_on_disk_is_valid_json(self, tmp_path):
        store = FileTraceStore(tmp_path)
        t = a_tracer(store)
        t.add_quant_metrics("NVDA", QuantMetrics(ticker="NVDA", rsi=55.0))
        path = Path(t.save())
        assert json.loads(path.read_text(encoding="utf-8"))["run_id"] == "run-1"

    def test_a_default_store_reads_the_module_directory_lazily(self):
        # Constructed with no directory, so it must resolve RUNS_DIR when used —
        # not capture it at construction.
        from src.utils import traces

        store = FileTraceStore()
        assert store.directory == traces.RUNS_DIR

    def test_the_default_tracer_persists_to_files(self):
        assert isinstance(Tracer(run_id="r", user_id="u").store, FileTraceStore)
