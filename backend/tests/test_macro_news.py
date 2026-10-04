"""Tests for macro news: the questions, the tag rule, the collector, the Jev client,
a pull end to end over in-memory fakes, and the HTTP surface.

No network anywhere. Finnhub and Jev are replaced at their HTTP call, the database by
an in-memory repository, so what is tested is everything this package decides.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.asset_discovery import UNIVERSES  # noqa: E402
from src.macro import collector as collector_mod  # noqa: E402
from src.macro import universes as uni  # noqa: E402
from src.macro.collector import Article, MacroNewsCollector, parse_article  # noqa: E402
from src.macro.digest import DigestStory, MacroDigestGenerator, MacroDigestPromptBuilder  # noqa: E402
from src.macro.jev_client import JevClient, parse_answers  # noqa: E402
from src.macro.routes import get_service, mount_macro_news, router  # noqa: E402
from src.macro.service import MacroNewsService  # noqa: E402
from src.macro.tagger import Scores, tags_for  # noqa: E402
from src.utils.ss_sources import PublisherRegistry  # noqa: E402

NOW = datetime(2026, 10, 4, 12, 0, tzinfo=timezone.utc)


def _answers(gate=0.9, mw=0.1, **universe_p) -> dict[str, Any]:
    """A Jev response body. Universes default to 0.01 unless given by question id."""
    answers = {uni.GATE_ID: {"type": "noul", "noul": gate}, uni.MARKET_WIDE_ID: {"type": "noul", "noul": mw}}
    for u in UNIVERSES:
        qid = uni.question_id(u)
        answers[qid] = {"type": "noul", "noul": universe_p.get(qid, 0.01)}
    return {"model": "typesafe/jev-1.13-20260917", "answers": answers, "usage": {"cost": 0.00005}}


def _scores(gate=0.9, mw=0.1, **by_name) -> Scores:
    return Scores(gate=gate, market_wide=mw, universes={u: by_name.get(u, 0.01) for u in UNIVERSES})


def _article(fid: int, headline: str = "Fed signals pause", hours_ago: int = 1) -> Article:
    return Article(
        finnhub_id=fid,
        headline=headline,
        blurb="",
        source="Reuters",
        url=f"https://www.reuters.com/{fid}",
        image_url=None,
        published_at=NOW - timedelta(hours=hours_ago),
    )


# ── the questions ────────────────────────────────────────────────────────────


def test_every_universe_has_wording_and_nothing_else_does():
    assert set(uni.NEWS_RULES) == set(UNIVERSES)


def test_drift_between_universes_and_wording_is_an_error():
    with pytest.raises(RuntimeError, match="Space"):
        uni.check_rules_cover(UNIVERSES + ["Space"], uni.NEWS_RULES)
    rules = dict(uni.NEWS_RULES)
    rules["Retired"] = rules["Finance"]
    with pytest.raises(RuntimeError, match="Retired"):
        uni.check_rules_cover(UNIVERSES, rules)


def test_one_question_per_universe_plus_gate_and_market_wide():
    qs = uni.build_questions()
    assert list(qs)[:2] == [uni.GATE_ID, uni.MARKET_WIDE_ID]
    assert len(qs) == len(UNIVERSES) + 2
    assert all(q["type"] == "noul" for q in qs.values())
    assert uni.question_id("AI & Robotics") == "u_ai_robotics"
    assert uni.question_id("Media & Communications") == "u_media_communications"


def test_every_question_asks_for_relevance_not_direction():
    for qid, q in uni.build_questions().items():
        if qid != uni.GATE_ID:
            assert q["instructions"].endswith(uni.RELEVANCE_ONLY), qid


def test_universe_questions_exclude_general_market_effects():
    for universe, rule in uni.NEWS_RULES.items():
        text = rule.question()
        assert "A general effect on markets, the economy or investor mood does NOT count" in text, universe
        assert text.startswith("Does this news directly concern "), universe


def test_question_version_moves_when_wording_does(monkeypatch):
    before = uni.question_version()
    assert before == uni.question_version()
    changed = dict(uni.NEWS_RULES)
    rule = changed["Finance"]
    changed["Finance"] = uni.NewsRule(rule.concern, rule.counts + ", or a stock exchange", rule.who)
    monkeypatch.setattr(uni, "NEWS_RULES", changed)
    assert uni.question_version() != before


# ── the tag rule ─────────────────────────────────────────────────────────────


def test_gate_blocks_every_tag():
    assert tags_for(_scores(gate=0.59, mw=0.99, Finance=0.99)) == []


def test_market_wide_first_then_universes_in_order():
    tags = tags_for(_scores(mw=0.98, Finance=0.97, Technology=0.8))
    assert tags == [uni.MARKET_WIDE, "Technology", "Finance"]


def test_threshold_is_inclusive_and_low_scores_earn_nothing():
    assert tags_for(_scores(Healthcare=0.6)) == ["Healthcare"]
    assert tags_for(_scores(Healthcare=0.59)) == []


def test_unscored_article_earns_no_tags():
    assert tags_for(None) == []


# ── the collector ────────────────────────────────────────────────────────────


def _raw(fid=1, source="Reuters", url="https://www.reuters.com/x", headline="Oil jumps 4%", summary="", ts=None):
    return {
        "id": fid,
        "category": "top news",
        "datetime": ts if ts is not None else int(NOW.timestamp()),
        "headline": headline,
        "image": "",
        "related": "",
        "source": source,
        "summary": summary,
        "url": url,
    }


def test_parse_keeps_trusted_publishers_and_drops_the_rest():
    reg = PublisherRegistry()
    assert parse_article(_raw(source="Reuters"), reg).source == "Reuters"
    assert parse_article(_raw(source="Some Blog", url="https://blog.invalid/x"), reg) is None


def test_parse_credits_a_syndicated_wire_story_to_the_wire():
    reg = PublisherRegistry()
    article = parse_article(_raw(source="Yahoo", url="https://www.reuters.com/markets/x"), reg)
    assert article.source == "Reuters"


def test_parse_rejects_malformed_items():
    reg = PublisherRegistry()
    assert parse_article("not a dict", reg) is None
    assert parse_article(_raw(headline=""), reg) is None
    assert parse_article({**_raw(), "datetime": "soon"}, reg) is None
    assert parse_article({k: v for k, v in _raw().items() if k != "id"}, reg) is None


def test_parse_keeps_the_blurb_exactly_as_sent():
    reg = PublisherRegistry()
    article = parse_article(_raw(headline="Oil jumps 4%", summary="Oil jumps 4%  Reuters"), reg)
    assert article.blurb == "Oil jumps 4%  Reuters"
    assert article.state().endswith("Oil jumps 4%\nOil jumps 4%  Reuters")


class _Resp:
    def __init__(self, status: int, payload: Any):
        self.status_code = status
        self._payload = payload

    def json(self):
        return self._payload


def test_fetch_filters_by_min_id_dedupes_and_sorts(monkeypatch):
    monkeypatch.setenv("FINNHUB_API_KEY", "k")
    seen = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        seen.update(params)
        return _Resp(200, [_raw(fid=12), _raw(fid=10), _raw(fid=12), _raw(fid=5)])

    monkeypatch.setattr(collector_mod.requests, "get", fake_get)
    articles = MacroNewsCollector().fetch(min_id=9)
    assert [a.finnhub_id for a in articles] == [10, 12]
    assert seen["minId"] == 9 and seen["category"] == "general"


def test_fetch_degrades_to_empty(monkeypatch):
    monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
    assert MacroNewsCollector().fetch() == []
    monkeypatch.setenv("FINNHUB_API_KEY", "k")
    monkeypatch.setattr(collector_mod.requests, "get", lambda *a, **k: _Resp(429, {}))
    assert MacroNewsCollector().fetch() == []
    monkeypatch.setattr(collector_mod.requests, "get", lambda *a, **k: _Resp(200, {"error": "x"}))
    assert MacroNewsCollector().fetch() == []


# ── the Jev client ───────────────────────────────────────────────────────────


def test_parse_answers_maps_question_ids_back_to_universe_names():
    scores = parse_answers(_answers(gate=0.98, mw=0.97, u_finance=0.96))
    assert scores.gate == 0.98 and scores.market_wide == 0.97
    assert scores.universes["Finance"] == 0.96
    assert list(scores.universes) == UNIVERSES


def test_parse_answers_refuses_partial_or_impossible_answers():
    body = _answers()
    del body["answers"][uni.question_id("Healthcare")]
    assert parse_answers(body) is None
    assert parse_answers(_answers(gate=1.4)) is None
    assert parse_answers({"error": {"code": 402}}) is None


class _Session:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls: list[dict] = []

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return self.responses.pop(0)


def test_score_sends_every_question_and_records_model_and_cost(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY_OPENROUTER", "sk-test")
    session = _Session(_Resp(200, _answers(u_technology=0.99)))
    client = JevClient(session=session)
    scores = client.score("Reuters, 2026-10-02: Nvidia ...")
    assert scores.universes["Technology"] == 0.99
    sent = session.calls[0]
    assert sent["headers"]["Authorization"] == "Bearer sk-test"
    assert set(sent["json"]["questions"]) == set(uni.build_questions())
    assert client.model_used == "typesafe/jev-1.13-20260917"
    assert client.cost == pytest.approx(0.00005)


def test_score_retries_a_server_error_but_not_missing_credit(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY_OPENROUTER", "sk-test")
    retried = _Session(_Resp(500, {}), _Resp(200, _answers()))
    assert JevClient(session=retried).score("s") is not None
    assert len(retried.calls) == 2

    broke = _Session(_Resp(402, {"error": {"code": 402}}), _Resp(200, _answers()))
    assert JevClient(session=broke).score("s") is None
    assert len(broke.calls) == 1


def test_no_key_means_no_call(monkeypatch):
    monkeypatch.delenv("TYPESAFE_API_KEY_OPENROUTER", raising=False)
    session = _Session()
    client = JevClient(session=session)
    assert client.score_many(["a", "b"]) == [None, None]
    assert session.calls == []


# ── a pull, end to end over fakes ────────────────────────────────────────────


class FakeRepo:
    def __init__(self):
        self.rows: dict[int, dict[str, Any]] = {}
        self.pruned_before: Optional[datetime] = None

    def max_finnhub_id(self):
        return max(self.rows) if self.rows else None

    def read_window(self, since):
        rows = [r for r in self.rows.values() if datetime.fromisoformat(r["published_at"]) >= since]
        return sorted(rows, key=lambda r: r["published_at"], reverse=True)

    def upsert(self, rows):
        for row in rows:
            self.rows[row["finnhub_id"]] = {**self.rows.get(row["finnhub_id"], {}), **row}
        return len(rows)

    def prune(self, before):
        self.pruned_before = before

    # Overviews: newest last in the list, so "latest" is the last one per group.
    digests: list

    def latest_digests(self):
        latest = {}
        for row in getattr(self, "digests", []):
            latest[row["universe"]] = row
        return latest

    def insert_digest(self, row):
        self.digests = [*getattr(self, "digests", []), row]
        return True


class FakeCollector:
    def __init__(self, articles):
        self.articles = articles
        self.min_ids: list = []

    def fetch(self, min_id=None):
        self.min_ids.append(min_id)
        return [a for a in self.articles if not min_id or a.finnhub_id > min_id]


class FakeJev:
    """Scores by headline; a headline not in the table fails, like an outage."""

    def __init__(self, table: dict[str, Scores]):
        self.table = table
        self.model_used = "typesafe/jev-1.13-20260917"
        self.cost = 0.0
        self.states: list[str] = []

    def score_many(self, states):
        self.states.extend(states)
        self.cost += 0.00005 * len(states)
        return [next((s for h, s in self.table.items() if h in st), None) for st in states]


class FakeDigester:
    """Writes "<group>: <n> stories" and records what it was asked for."""

    model = "openai/gpt-oss-20b"

    def __init__(self, fail: bool = False):
        self.calls: list[tuple[str, int]] = []
        self.fail = fail

    def generate(self, group, stories, total):
        self.calls.append((group, total))
        return None if self.fail else f"{group}: {total} stories, led by {stories[0].headline}."


def _service(articles, table, repo=None, digester=None):
    return MacroNewsService(
        repository=repo or FakeRepo(),
        collector=FakeCollector(articles),
        jev=FakeJev(table),
        digester=digester or FakeDigester(),
        now=lambda: NOW,
    )


def test_pull_scores_tags_and_stores_new_stories():
    arts = [_article(1, "Fed signals pause"), _article(2, "Photos of the week")]
    svc = _service(arts, {"Fed signals pause": _scores(gate=0.99, mw=0.98, Finance=0.98)})
    result = svc.pull()
    assert result["ok"] and result["fetched"] == 2 and result["scored"] == 1 and result["tagged"] == 1
    fed, photos = svc.repository.rows[1], svc.repository.rows[2]
    assert fed["tags"] == [uni.MARKET_WIDE, "Finance"]
    assert fed["universe_probs"]["Finance"] == 0.98 and fed["question_version"] == uni.question_version()
    # A story Jev could not score is kept, unscored, rather than lost.
    assert "scored_at" not in photos and photos["headline"] == "Photos of the week"
    assert svc.repository.pruned_before == NOW - timedelta(days=30)


def test_next_pull_asks_only_for_newer_stories_and_retries_unscored_ones():
    repo = FakeRepo()
    _service([_article(1, "Outage story")], {}, repo).pull()
    assert "scored_at" not in repo.rows[1]

    svc = _service([_article(1, "Outage story"), _article(2, "Lilly trial")],
                   {"Outage story": _scores(Healthcare=0.1), "Lilly trial": _scores(Healthcare=0.99)}, repo)
    result = svc.pull()
    assert svc.collector.min_ids == [1]
    assert result["fetched"] == 1 and result["retried"] == 1 and result["scored"] == 2
    assert repo.rows[1]["scored_at"] and repo.rows[2]["tags"] == ["Healthcare"]


def test_stories_scored_by_older_questions_are_rescored_on_the_next_pull():
    repo = FakeRepo()
    _service([_article(1)], {"Fed": _scores(Finance=0.9)}, repo).pull()
    repo.rows[1]["question_version"] = "old-wording"
    result = _service([], {"Fed": _scores(Finance=0.9)}, repo).pull()
    assert result["retried"] == 1 and repo.rows[1]["question_version"] == uni.question_version()


def test_rescore_rescores_the_window_without_fetching():
    repo = FakeRepo()
    _service([_article(1), _article(2, "Old story", hours_ago=24 * 10)], {"Fed": _scores(Finance=0.4)}, repo).pull()
    svc = _service([_article(3)], {"Fed": _scores(Finance=0.9)}, repo)
    result = svc.rescore()
    assert svc.collector.min_ids == []  # nothing fetched
    assert result["retried"] == 1  # the 10-day-old story is outside the window
    assert repo.rows[1]["tags"] == ["Finance"]


def test_feed_splits_tagged_from_the_rest_and_keeps_every_universe():
    repo = FakeRepo()
    _service([_article(1, "Fed signals pause"), _article(2, "Photos of the week", hours_ago=2)],
             {"Fed signals pause": _scores(mw=0.98, Finance=0.98), "Photos of the week": _scores(gate=0.1)}, repo).pull()
    feed = _service([], {}, repo).feed()
    assert feed["universes"] == UNIVERSES and feed["threshold"] == 0.6
    assert [a["id"] for a in feed["tagged"]] == [1] and [a["id"] for a in feed["other"]] == [2]
    fed = feed["tagged"][0]
    assert list(fed["universes"]) == UNIVERSES and fed["market_wide"] == 0.98 and fed["scored"] is True


def test_feed_reads_a_universe_added_after_scoring_as_null():
    repo = FakeRepo()
    _service([_article(1)], {"Fed": _scores(Finance=0.9)}, repo).pull()
    del repo.rows[1]["universe_probs"]["Media & Communications"]
    item = _service([], {}, repo).feed()["tagged"][0]
    assert item["universes"]["Media & Communications"] is None


# ── overviews ────────────────────────────────────────────────────────────────


def test_pull_writes_an_overview_per_group_with_stories():
    digester = FakeDigester()
    svc = _service([_article(1, "Fed signals pause"), _article(2, "Lilly trial")],
                   {"Fed": _scores(mw=0.98, Finance=0.97), "Lilly": _scores(Healthcare=0.95)}, digester=digester)
    result = svc.pull()
    assert sorted(g for g, _ in digester.calls) == sorted([uni.MARKET_WIDE, "Finance", "Healthcare"])
    assert result["overviews"] == 3
    stored = svc.repository.latest_digests()
    assert stored["Finance"]["article_ids"] == [1] and stored["Finance"]["model"] == "openai/gpt-oss-20b"


def test_an_unchanged_group_is_not_rewritten_and_a_changed_one_is():
    repo, digester = FakeRepo(), FakeDigester()
    _service([_article(1, "Fed")], {"Fed": _scores(Finance=0.9)}, repo, digester).pull()
    _service([_article(1, "Fed")], {"Fed": _scores(Finance=0.9)}, repo, digester).pull()
    assert digester.calls == [("Finance", 1)]
    _service([_article(1, "Fed"), _article(2, "Bank results")],
             {"Fed": _scores(Finance=0.9), "Bank": _scores(Finance=0.8)}, repo, digester).pull()
    assert digester.calls[-1] == ("Finance", 2)


def test_a_failed_overview_stores_nothing_and_is_retried_next_pull():
    repo = FakeRepo()
    _service([_article(1, "Fed")], {"Fed": _scores(Finance=0.9)}, repo, FakeDigester(fail=True)).pull()
    assert repo.latest_digests() == {}
    digester = FakeDigester()
    _service([], {}, repo, digester).pull()
    assert digester.calls == [("Finance", 1)]


def test_overview_stories_are_most_relevant_first():
    repo = FakeRepo()
    _service([_article(1, "Mild"), _article(2, "Strong")],
             {"Mild": _scores(Finance=0.65), "Strong": _scores(Finance=0.95)}, repo).pull()
    assert repo.latest_digests()["Finance"]["summary"].endswith("led by Strong.")


def test_feed_carries_overviews_only_for_groups_with_stories():
    repo = FakeRepo()
    _service([_article(1, "Fed")], {"Fed": _scores(Finance=0.9)}, repo).pull()
    repo.digests.append({"universe": "Healthcare", "slot_start": NOW.isoformat(), "summary": "Old.", "article_ids": [99]})
    feed = _service([], {}, repo).feed()
    assert set(feed["overviews"]) == {"Finance"}
    assert feed["overviews"]["Finance"]["article_count"] == 1


def test_prompt_lists_most_relevant_first_caps_the_list_and_drops_repeat_blurbs():
    stories = [DigestStory("Reuters", NOW, f"Story {i}", f"Story {i}  Reuters") for i in range(10)]
    stories[0] = DigestStory("CNBC", NOW, "Private capital funds Hollywood", "Financing is diversifying.")
    prompt = MacroDigestPromptBuilder().build("Media & Communications", stories, total=10)
    assert "[1] CNBC" in prompt and "Summary: Financing is diversifying." in prompt
    assert "[8]" in prompt and "[9]" not in prompt
    assert "8 most relevant of 10" in prompt
    assert "Summary: Story 3" not in prompt
    assert "Never say whether the news is good or bad" in prompt and "buy, sell or hold" in prompt
    assert "markets broadly" in MacroDigestPromptBuilder().build(uni.MARKET_WIDE, stories[:1], total=1)


def test_guard_discards_advice_direction_and_bad_lengths():
    gen = MacroDigestGenerator(client=object())
    ok = "Reuters reported that the Bank of England admitted mishandling its first response to the Iran shock."
    assert gen.validate("Finance", ok) == ok
    for bad in [
        ok + " Investors should watch banks.",
        ok + " This is good news for lenders.",
        ok + " Bank shares will rise.",
        ok + " It creates an opportunity.",
        "Too short.",
        "x" * 700,
    ]:
        assert gen.validate("Finance", bad) is None, bad


def test_generator_without_groq_writes_nothing():
    class NoClient(MacroDigestGenerator):
        @property
        def client(self):
            return None

    assert NoClient().generate("Finance", [DigestStory("Reuters", NOW, "h", "")], total=1) is None


def test_generator_retries_then_cleans_the_reply():
    class Flaky:
        model = "m"

        def __init__(self):
            self.n = 0

        def complete(self, prompt):
            self.n += 1
            if self.n == 1:
                raise RuntimeError("429")
            return "Reuters reported that UK gilt yields rose above six percent for the first time since 1998."

    gen = MacroDigestGenerator(client=Flaky())
    gen.BACKOFF_SECONDS = (0.0, 0.0)
    assert gen.generate("Finance", [DigestStory("Reuters", NOW, "Gilts top 6%", "")], total=1).startswith("Reuters")


# ── HTTP ─────────────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    app = FastAPI()
    assert mount_macro_news(app, enabled=True)
    repo = FakeRepo()
    _service([_article(1)], {"Fed": _scores(Finance=0.9)}, repo).pull()
    svc = _service([_article(1), _article(2, "Lilly")], {"Fed": _scores(Finance=0.9), "Lilly": _scores(Healthcare=0.9)}, repo)
    app.dependency_overrides[get_service] = lambda: svc
    return TestClient(app)


def test_pull_needs_the_scheduler_secret(client, monkeypatch):
    monkeypatch.delenv("DAILY_RUN_SECRET", raising=False)
    assert client.post("/api/macro/pull").status_code == 503
    monkeypatch.setenv("DAILY_RUN_SECRET", "s3cret")
    assert client.post("/api/macro/pull", headers={"X-Daily-Run-Secret": "wrong"}).status_code == 401
    ok = client.post("/api/macro/pull", headers={"X-Daily-Run-Secret": "s3cret"})
    assert ok.status_code == 200 and ok.json()["fetched"] == 1
    assert client.post("/api/macro/rescore", headers={"X-Daily-Run-Secret": "s3cret"}).json()["ok"]


def test_news_is_served_and_days_is_bounded(client):
    body = client.get("/api/macro/news").json()
    assert body["days"] == 7 and [a["id"] for a in body["tagged"]] == [1]
    assert client.get("/api/macro/news?days=0").status_code == 422
    assert client.get("/api/macro/news?days=31").status_code == 422


def test_flag_off_mounts_nothing():
    app = FastAPI()
    assert mount_macro_news(app, enabled=False) is False
    assert TestClient(app).get("/api/macro/news").status_code == 404


def test_router_paths():
    assert {r.path for r in router.routes} == {"/api/macro/pull", "/api/macro/rescore", "/api/macro/news"}


def test_generator_asks_again_when_the_reply_runs_long():
    class Wordy:
        model = "m"

        def __init__(self):
            self.prompts = []

        def complete(self, prompt):
            self.prompts.append(prompt)
            if len(self.prompts) == 1:
                return "Reuters reported a long list of things. " * 30
            return "Reuters reported that UK gilt yields rose above six percent for the first time since 1998."

    client = Wordy()
    text = MacroDigestGenerator(client=client).generate("Finance", [DigestStory("Reuters", NOW, "Gilts top 6%", "")], total=1)
    assert text.startswith("Reuters reported that UK gilt")
    assert "too long" in client.prompts[1] and "broke a rule" in client.prompts[1]


def test_stock_tips_never_reach_the_prompt_and_boilerplate_blurbs_are_dropped():
    class Recorder:
        model = "m"
        prompt = ""

        def complete(self, prompt):
            Recorder.prompt = prompt
            return "CNBC reported that Lilly released mixed data from an obesity drug trial."

    stories = [
        DigestStory("CNBC", NOW, "Jim Cramer sees a huge catalyst for Apple. How to play the stock", ""),
        DigestStory("CNBC", NOW, "Wall Street closes a strong quarter. Plus, Lilly's mixed trial data",
                    "Every weekday, the Investing Club releases the Homestretch."),
    ]
    assert MacroDigestGenerator(client=Recorder()).generate("Healthcare", stories, total=2) is not None
    assert "Cramer" not in Recorder.prompt and "Homestretch" not in Recorder.prompt
    assert "Lilly's mixed trial data" in Recorder.prompt


def test_a_reply_that_judges_the_news_gets_one_corrected_retry():
    class Judgy:
        model = "m"

        def __init__(self):
            self.prompts = []

        def complete(self, prompt):
            self.prompts.append(prompt)
            if len(self.prompts) == 1:
                return "CNBC reported that Nvidia hit record highs, which is good news for chipmakers."
            return "CNBC reported that Nvidia shares reached a new record high this week."

    client = Judgy()
    text = MacroDigestGenerator(client=client).generate("Technology", [DigestStory("CNBC", NOW, "Nvidia hits a record", "")], total=1)
    assert text == "CNBC reported that Nvidia shares reached a new record high this week."
    assert '"good news"' in client.prompts[1]


def test_a_second_bad_reply_is_discarded():
    class Stubborn:
        model = "m"

        def complete(self, prompt):
            return "CNBC reported record highs for Nvidia, and investors should take note of it."

    assert MacroDigestGenerator(client=Stubborn()).generate("Technology", [DigestStory("CNBC", NOW, "h", "")], total=1) is None


def test_feed_flags_stock_tips_as_commentary():
    repo = FakeRepo()
    _service([_article(1, "Jim Cramer sees a huge catalyst for Apple. How to play the stock"), _article(2, "Fed signals pause")],
             {"Cramer": _scores(Technology=0.99), "Fed": _scores(Finance=0.9)}, repo).pull()
    by_id = {a["id"]: a for a in _service([], {}, repo).feed()["tagged"]}
    assert by_id[1]["commentary"] is True and by_id[2]["commentary"] is False
