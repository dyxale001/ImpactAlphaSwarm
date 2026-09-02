"""Unit tests for the Supabase repositories (src/utils/supabase_client.py).

None of this could be tested before: every function reached the module-level
client directly, so exercising one meant talking to a live project. Each
repository now takes its client, which is the whole reason these run offline.

What is worth pinning here is not the query syntax but the rules the repositories
enforce on the caller's behalf:

  * risk tolerance is normalised ON READ, because the stored column holds six
    spellings of three levels and every exact-match consumer silently skipped the
    rows that did not match;
  * a read that fails degrades to an empty answer rather than raising, so one
    flaky call ages the data by a night instead of failing a nightly batch for
    every user;
  * seed rows are never rescored, retired or reclassified — the origin guard is
    in the repository, not left to the caller to remember;
  * the two news caches are one class, so they cannot drift apart.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import pytest  # noqa: E402

from src.utils.supabase_client import (  # noqa: E402
    AiRunRepository,
    AssetRepository,
    DiscoveryRepository,
    NewsCacheRepository,
    RankingRepository,
    RecommendationRepository,
    Repository,
    SentimentHistoryRepository,
    UserRepository,
)


# ═════════════════════════════════════════════════════════════════════════════
# A fake Supabase client
# ═════════════════════════════════════════════════════════════════════════════

class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Records the fluent calls made against one table and replays canned data."""

    def __init__(self, table, client):
        self.table_name = table
        self.client = client
        self.calls = []
        self.payload = None

    def _record(self, name, *args, **kw):
        self.calls.append((name, args, kw))
        return self

    def select(self, *a, **kw):
        return self._record("select", *a, **kw)

    def eq(self, *a, **kw):
        return self._record("eq", *a, **kw)

    def neq(self, *a, **kw):
        return self._record("neq", *a, **kw)

    def gt(self, *a, **kw):
        return self._record("gt", *a, **kw)

    def lt(self, *a, **kw):
        return self._record("lt", *a, **kw)

    def gte(self, *a, **kw):
        return self._record("gte", *a, **kw)

    def in_(self, *a, **kw):
        return self._record("in_", *a, **kw)

    def limit(self, *a, **kw):
        return self._record("limit", *a, **kw)

    def order(self, *a, **kw):
        return self._record("order", *a, **kw)

    def delete(self, *a, **kw):
        return self._record("delete", *a, **kw)

    def insert(self, payload, *a, **kw):
        self.payload = payload
        return self._record("insert", payload, *a, **kw)

    def update(self, payload, *a, **kw):
        self.payload = payload
        return self._record("update", payload, *a, **kw)

    def upsert(self, payload, *a, **kw):
        self.payload = payload
        return self._record("upsert", payload, *a, **kw)

    def execute(self):
        self.client.executed.append(self)
        if self.client.raises:
            raise RuntimeError("supabase is down")
        return FakeResponse(self.client.rows.get(self.table_name, []))


class FakeClient:
    def __init__(self, rows=None, raises=False):
        self.rows = rows or {}
        self.raises = raises
        self.executed = []
        self.queries = []

    def table(self, name):
        q = FakeQuery(name, self)
        self.queries.append(q)
        return q

    def tables_touched(self):
        return [q.table_name for q in self.executed]

    def ops_on(self, table):
        return [name for q in self.executed if q.table_name == table for name, _a, _k in q.calls]


# ═════════════════════════════════════════════════════════════════════════════
# The base
# ═════════════════════════════════════════════════════════════════════════════

class TestRepositoryBase:
    def test_an_injected_client_is_used_instead_of_the_module_one(self):
        client = FakeClient()
        AssetRepository(client).tickers_in_universes(["Technology"])
        assert client.tables_touched() == ["assets"]

    def test_each_repository_names_its_own_table(self):
        assert UserRepository.table_name == "user_analysis"
        assert AssetRepository.table_name == "assets"
        assert AiRunRepository.table_name == "ai_runs"
        assert RankingRepository.table_name == "ranking_shadow"

    def test_every_repository_is_a_repository(self):
        for cls in (UserRepository, AssetRepository, AiRunRepository,
                    RankingRepository, DiscoveryRepository, NewsCacheRepository):
            assert issubclass(cls, Repository)


# ═════════════════════════════════════════════════════════════════════════════
# Users
# ═════════════════════════════════════════════════════════════════════════════

class TestUserRepository:
    def test_preferences_are_returned_for_a_known_user(self):
        client = FakeClient({"user_analysis": [
            {"investment_universe": ["Technology"], "risk_tolerance": "Moderate",
             "ai_derived_expertise": "advanced"}
        ]})
        prefs = UserRepository(client).preferences("u1")
        assert prefs == {
            "user_id": "u1",
            "universes": ["Technology"],
            "risk_tolerance": "Moderate",
            "expertise_level": "advanced",
        }

    @pytest.mark.parametrize("stored,expected", [
        ("conservative", "Conservative"),
        ("aggresive", "Aggressive"),      # the misspelling seen in live data
        ("AGGRESSIVE", "Aggressive"),
        ("nonsense", "Moderate"),         # unknown falls back to the neutral profile
        (None, "Moderate"),
    ])
    def test_risk_tolerance_is_normalised_on_read(self, stored, expected):
        # The column is free text; exact-match consumers downstream silently skipped
        # every row that did not already read "Conservative"/"Moderate"/"Aggressive".
        client = FakeClient({"user_analysis": [{"risk_tolerance": stored}]})
        assert UserRepository(client).preferences("u1")["risk_tolerance"] == expected

    def test_a_json_encoded_universe_list_is_parsed(self):
        client = FakeClient({"user_analysis": [{"investment_universe": '["Finance"]'}]})
        assert UserRepository(client).preferences("u1")["universes"] == ["Finance"]

    def test_a_missing_expertise_defaults_to_novice(self):
        client = FakeClient({"user_analysis": [{}]})
        assert UserRepository(client).preferences("u1")["expertise_level"] == "novice"

    def test_an_unknown_user_is_none(self):
        assert UserRepository(FakeClient()).preferences("nobody") is None

    def test_a_failed_read_degrades_to_none(self):
        assert UserRepository(FakeClient(raises=True)).preferences("u1") is None

    def test_a_failed_active_user_read_degrades_to_an_empty_list(self):
        assert UserRepository(FakeClient(raises=True)).active_ids() == []


# ═════════════════════════════════════════════════════════════════════════════
# Assets
# ═════════════════════════════════════════════════════════════════════════════

class TestAssetRepository:
    def test_tickers_are_returned_for_the_given_universes(self):
        client = FakeClient({"assets": [{"ticker": "AAA"}, {"ticker": "BBB"}]})
        assert sorted(AssetRepository(client).tickers_in_universes(["Technology"])) == ["AAA", "BBB"]

    def test_duplicate_tickers_are_collapsed(self):
        client = FakeClient({"assets": [{"ticker": "AAA"}, {"ticker": "AAA"}]})
        assert AssetRepository(client).tickers_in_universes(["Technology"]) == ["AAA"]

    def test_rows_without_a_ticker_are_skipped(self):
        client = FakeClient({"assets": [{"ticker": "AAA"}, {"ticker": None}, {}]})
        assert AssetRepository(client).tickers_in_universes(["Technology"]) == ["AAA"]

    def test_no_universes_means_no_query_at_all(self):
        client = FakeClient()
        assert AssetRepository(client).tickers_in_universes([]) == []
        assert client.executed == []

    def test_a_failed_read_degrades_to_an_empty_list(self):
        assert AssetRepository(FakeClient(raises=True)).tickers_in_universes(["T"]) == []

    def test_universes_are_mapped_by_ticker(self):
        client = FakeClient({"assets": [
            {"ticker": "AAA", "universe": "Technology"},
            {"ticker": "BBB", "universe": "Finance"},
        ]})
        assert AssetRepository(client).universes_of(["AAA", "BBB"]) == {
            "AAA": "Technology", "BBB": "Finance",
        }

    def test_no_tickers_means_no_query_at_all(self):
        client = FakeClient()
        assert AssetRepository(client).universes_of([]) == {}
        assert client.executed == []

    def test_a_failed_universe_read_degrades_to_an_empty_map(self):
        assert AssetRepository(FakeClient(raises=True)).universes_of(["AAA"]) == {}

    def test_an_existing_asset_id_is_returned_without_an_insert(self):
        client = FakeClient({"assets": [{"id": "asset-1"}]})
        assert AssetRepository(client).get_or_create_id("AAA") == "asset-1"
        assert "insert" not in client.ops_on("assets")


# ═════════════════════════════════════════════════════════════════════════════
# News caches — one class, two tables
# ═════════════════════════════════════════════════════════════════════════════

class TestNewsCacheRepository:
    @pytest.mark.parametrize("table", ["marketaux_news_cache", "finnhub_news_cache"])
    def test_each_instance_writes_to_its_own_table(self, table):
        client = FakeClient()
        NewsCacheRepository(table, client).save({"AAA": [{"headline": "x"}]})
        assert client.tables_touched() == [table]

    @pytest.mark.parametrize("table", ["marketaux_news_cache", "finnhub_news_cache"])
    def test_each_instance_reads_from_its_own_table(self, table):
        client = FakeClient({table: [{"ticker": "AAA", "articles": [{"h": 1}]}]})
        assert NewsCacheRepository(table, client).load(["AAA"]) == {"AAA": [{"h": 1}]}

    def test_a_ticker_that_lost_coverage_is_still_written(self):
        # Writing the empty list is what stops it serving stale articles for ever.
        client = FakeClient()
        NewsCacheRepository("finnhub_news_cache", client).save({"AAA": []})
        assert client.executed[0].payload == [
            {"ticker": "AAA", "articles": [], "fetched_at": client.executed[0].payload[0]["fetched_at"]}
        ]

    def test_nothing_to_save_issues_no_query(self):
        client = FakeClient()
        NewsCacheRepository("finnhub_news_cache", client).save({})
        assert client.executed == []

    def test_no_tickers_to_load_issues_no_query(self):
        client = FakeClient()
        assert NewsCacheRepository("finnhub_news_cache", client).load([]) == {}
        assert client.executed == []

    def test_a_null_articles_column_reads_as_an_empty_list(self):
        client = FakeClient({"finnhub_news_cache": [{"ticker": "AAA", "articles": None}]})
        assert NewsCacheRepository("finnhub_news_cache", client).load(["AAA"]) == {"AAA": []}


# ═════════════════════════════════════════════════════════════════════════════
# Ranking shadow
# ═════════════════════════════════════════════════════════════════════════════

class TestRankingRepository:
    def test_every_row_is_stamped_with_the_run_and_the_night(self):
        client = FakeClient()
        result = RankingRepository(client).save_shadow("run-1", [{"ticker": "AAA"}])
        inserted = [q for q in client.executed if "insert" in [c[0] for c in q.calls]][0]
        assert inserted.payload[0]["run_id"] == "run-1"
        assert inserted.payload[0]["as_of_night"] == result["as_of_night"]

    def test_the_nights_slice_is_cleared_before_inserting(self):
        # Deleted rather than upserted, so tickers that dropped out of the candidate
        # set do not linger as stale rows.
        client = FakeClient()
        RankingRepository(client).save_shadow("run-1", [{"ticker": "AAA"}])
        assert client.ops_on("ranking_shadow")[0] == "delete"

    def test_nothing_to_log_is_reported_rather_than_written(self):
        client = FakeClient()
        assert RankingRepository(client).save_shadow("run-1", []) == {"status": "no_rows"}
        assert RankingRepository(client).save_shadow("", [{"a": 1}]) == {"status": "no_rows"}
        assert client.executed == []

    def test_a_failure_is_reported_never_raised(self):
        # Shadow logging must not be able to fail an analysis.
        result = RankingRepository(FakeClient(raises=True)).save_shadow("run-1", [{"t": "A"}])
        assert result["status"] == "error"

    def test_only_the_most_recent_earlier_night_is_returned(self):
        client = FakeClient({"ranking_shadow": [
            {"ticker": "AAA", "v2_rank": 1, "as_of_night": "2026-08-31"},
            {"ticker": "BBB", "v2_rank": 2, "as_of_night": "2026-08-31"},
            {"ticker": "CCC", "v2_rank": 1, "as_of_night": "2026-08-30"},
        ]})
        assert RankingRepository(client).previous_ranking("run-1") == {"AAA": 1, "BBB": 2}

    def test_a_row_without_a_rank_is_skipped(self):
        client = FakeClient({"ranking_shadow": [
            {"ticker": "AAA", "v2_rank": None, "as_of_night": "2026-08-31"},
        ]})
        assert RankingRepository(client).previous_ranking("run-1") == {}

    def test_no_prior_night_degrades_to_no_hysteresis(self):
        assert RankingRepository(FakeClient()).previous_ranking("run-1") == {}

    def test_a_missing_run_id_degrades_to_no_hysteresis(self):
        client = FakeClient()
        assert RankingRepository(client).previous_ranking("") == {}
        assert client.executed == []

    def test_a_failed_read_degrades_to_no_hysteresis(self):
        assert RankingRepository(FakeClient(raises=True)).previous_ranking("run-1") == {}


# ═════════════════════════════════════════════════════════════════════════════
# Discovery pool
# ═════════════════════════════════════════════════════════════════════════════

class TestDiscoveryRepository:
    def test_a_seed_row_is_never_reclassified(self):
        # The curated row wins; it is already poolable as a seed.
        client = FakeClient({"assets": [{"id": "1", "origin": "seed"}]})
        result = DiscoveryRepository(client).upsert_discovered(
            "AAA", "A Corp", "Technology", 0.9, ["llm"]
        )
        assert result == {"status": "skipped_seed", "ticker": "AAA"}
        assert "update" not in client.ops_on("assets")

    def test_an_existing_discovered_row_is_refreshed(self):
        client = FakeClient({"assets": [{"id": "1", "origin": "discovered"}]})
        result = DiscoveryRepository(client).upsert_discovered(
            "AAA", "A Corp", "Technology", 0.9, ["llm"]
        )
        assert result == {"status": "updated", "ticker": "AAA"}

    def test_refreshing_clears_the_quarantine(self):
        # A fresh, validated sighting supersedes a bench.
        client = FakeClient({"assets": [{"id": "1", "origin": "discovered"}]})
        DiscoveryRepository(client).upsert_discovered("AAA", "A", "Technology", 0.9, [])
        updated = [q for q in client.executed if q.payload and "is_active" in (q.payload or {})][0]
        assert updated.payload["is_active"] is True
        assert updated.payload["quarantined_until"] is None
        assert updated.payload["quarantine_reason"] is None

    def test_an_unknown_ticker_is_inserted_as_discovered(self):
        client = FakeClient()
        result = DiscoveryRepository(client).upsert_discovered(
            "AAA", "A Corp", "Technology", 0.9, ["llm"]
        )
        assert result == {"status": "inserted", "ticker": "AAA"}
        inserted = [q for q in client.executed if "insert" in [c[0] for c in q.calls]][0]
        assert inserted.payload["origin"] == "discovered"

    def test_a_nameless_insert_falls_back_to_the_ticker(self):
        client = FakeClient()
        DiscoveryRepository(client).upsert_discovered("AAA", "", "Technology", 0.9, [])
        inserted = [q for q in client.executed if "insert" in [c[0] for c in q.calls]][0]
        assert inserted.payload["name"] == "AAA"

    def test_an_upsert_failure_is_reported_never_raised(self):
        result = DiscoveryRepository(FakeClient(raises=True)).upsert_discovered(
            "AAA", "A", "Technology", 0.9, []
        )
        assert result["status"] == "error"

    def test_retiring_nothing_issues_no_query(self):
        client = FakeClient()
        DiscoveryRepository(client).retire([])
        assert client.executed == []

    def test_retirement_is_a_soft_flag_not_a_delete(self):
        # Rows are retired, never deleted, so ai_recommendation history keeps
        # resolving.
        client = FakeClient()
        DiscoveryRepository(client).retire(["AAA"])
        assert "delete" not in client.ops_on("assets")
        assert client.executed[0].payload["is_active"] is False

    def test_retirement_is_guarded_on_discovered_origin(self):
        client = FakeClient()
        DiscoveryRepository(client).retire(["AAA"])
        eqs = [(a[0], a[1]) for q in client.executed for name, a, _k in q.calls if name == "eq"]
        assert ("origin", "discovered") in eqs

    def test_quarantining_nothing_issues_no_query(self):
        client = FakeClient()
        DiscoveryRepository(client).quarantine([], "reason", "2026-10-01")
        assert client.executed == []

    def test_an_empty_quant_result_benches_the_ticker(self):
        client = FakeClient()
        DiscoveryRepository(client).mark_quant_empty(["AAA"], quarantine_days=30)
        assert client.executed[0].payload["quarantine_reason"] == "no_quant_data"

    def test_marking_nothing_issues_no_query(self):
        client = FakeClient()
        DiscoveryRepository(client).mark_quant_empty([])
        assert client.executed == []

    def test_no_universes_means_no_pool_query(self):
        client = FakeClient()
        assert DiscoveryRepository(client).pool_rows([]) == []
        assert client.executed == []

    def test_a_failed_pool_read_degrades_to_an_empty_list(self):
        assert DiscoveryRepository(FakeClient(raises=True)).pool_rows(["Technology"]) == []

    def test_the_audit_row_goes_to_its_own_table(self):
        client = FakeClient()
        DiscoveryRepository(client).record_run({"a": 1}, [], "ok")
        assert client.tables_touched() == ["discovery_runs"]

    def test_a_failed_audit_does_not_fail_discovery(self):
        DiscoveryRepository(FakeClient(raises=True)).record_run({}, [], "ok")  # must not raise


# ═════════════════════════════════════════════════════════════════════════════
# Recommendations — the backfill's ticker source
# ═════════════════════════════════════════════════════════════════════════════
# Folded in from PR #37 (Ally, 2026-09-02), which added it as a module function
# reaching the client directly. Same queries, same degrade-to-empty rule.

class TestRecommendationRepository:
    def test_recently_ranked_tickers_are_resolved_through_the_assets_table(self):
        client = FakeClient({
            "ai_recommendation": [{"asset_id": "a1"}, {"asset_id": "a2"}],
            "assets": [{"id": "a1", "ticker": "nvda"}, {"id": "a2", "ticker": "MSFT"}],
        })
        assert RecommendationRepository(client).recently_ranked_tickers() == ["MSFT", "NVDA"]

    def test_tickers_are_upper_cased_and_deduplicated(self):
        client = FakeClient({
            "ai_recommendation": [{"asset_id": "a1"}, {"asset_id": "a1"}],
            "assets": [{"id": "a1", "ticker": "nvda"}, {"id": "a1", "ticker": "NVDA"}],
        })
        assert RecommendationRepository(client).recently_ranked_tickers() == ["NVDA"]

    def test_no_recent_recommendations_means_the_assets_table_is_never_queried(self):
        client = FakeClient({"ai_recommendation": []})
        assert RecommendationRepository(client).recently_ranked_tickers() == []
        assert client.tables_touched() == ["ai_recommendation"]

    def test_rows_without_an_asset_id_are_skipped(self):
        client = FakeClient({
            "ai_recommendation": [{"asset_id": None}, {}],
        })
        assert RecommendationRepository(client).recently_ranked_tickers() == []

    def test_a_failed_read_degrades_to_an_empty_list(self):
        # A backfill that cannot see the database does nothing rather than crawling a guess.
        assert RecommendationRepository(FakeClient(raises=True)).recently_ranked_tickers() == []


# ═════════════════════════════════════════════════════════════════════════════
# Sentiment history — the freshness read
# ═════════════════════════════════════════════════════════════════════════════
# Also folded in from PR #37. The tables themselves are written by ss_daily /
# ns_daily through their own client; this is the one read the assets header needs.

class TestSentimentHistoryRepository:
    def test_the_later_of_the_two_tables_wins(self):
        client = FakeClient({
            "social_sentiment_daily": [{"updated_at": "2026-09-01T10:00:00Z"}],
            "news_sentiment_daily": [{"updated_at": "2026-09-02T08:00:00Z"}],
        })
        assert SentimentHistoryRepository(client).last_updated() == "2026-09-02T08:00:00Z"

    def test_both_tables_are_consulted(self):
        client = FakeClient()
        SentimentHistoryRepository(client).last_updated()
        assert client.tables_touched() == ["social_sentiment_daily", "news_sentiment_daily"]

    def test_one_empty_table_does_not_hide_the_other(self):
        client = FakeClient({
            "social_sentiment_daily": [],
            "news_sentiment_daily": [{"updated_at": "2026-09-02T08:00:00Z"}],
        })
        assert SentimentHistoryRepository(client).last_updated() == "2026-09-02T08:00:00Z"

    def test_both_tables_empty_is_unknown_not_a_guess(self):
        assert SentimentHistoryRepository(FakeClient()).last_updated() is None

    def test_a_failed_read_degrades_to_unknown(self):
        assert SentimentHistoryRepository(FakeClient(raises=True)).last_updated() is None
