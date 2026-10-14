"""Tests for the intraday news top-up that feeds "What's driving the sentiment".

Two claims carry the feature, and they are asserted first.

Rate limits. Finnhub allows sixty calls a minute per key, across every container, and the
tick shares its key with whale watching and user refreshes. So every call must clear the
limiter, a refusal is retried once after a pause and never hammered, and a run of
refusals ends the pass rather than burning through the rest of the batch.

Cost. GCP is spent only on articles nobody has scored before. An article already on a
stored day row reuses its stored score, which also keeps a past day from drifting when a
later pass spends its slots elsewhere.

Nothing external is touched: Finnhub is a fake HTTP client, GCP and VADER are fakes, and
the database is a fake repository behind the real NewsHistory and NewsDayBuilder.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.ns_daily import NewsHistory  # noqa: E402
from src.utils.ns_tick import NewsTicker  # noqa: E402
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_news import FinnhubSource  # noqa: E402
from src.utils.ss_scoring import MentionScorer, SentimentModel  # noqa: E402
from src.utils.ss_sources import PublisherRegistry  # noqa: E402

UTC = datetime.timezone.utc


def cfg(**overrides) -> SentimentConfig:
	base = dict(
		news_history_enabled=True,
		news_tick_enabled=True,
		news_tick_lookback_days=1,
		news_tick_quota=60,
		news_tick_backoff_seconds=15.0,
		news_tick_max_rate_limited=3,
		news_tick_max_seconds=240.0,
		news_tick_gcp_top_n=5,
		social_display_days=7,
	)
	base.update(overrides)
	return SentimentConfig(**base)


def today() -> datetime.date:
	return datetime.datetime.now(UTC).date()


def stamp(day: datetime.date, hour: int = 12) -> int:
	return int(datetime.datetime(day.year, day.month, day.day, hour, tzinfo=UTC).timestamp())


def article(n: int, day: datetime.date, source: str = "CNBC", headline: str | None = None) -> dict:
	return {
		"id": n,
		"headline": headline or f"Story {n} lifts the shares",
		"summary": f"Summary of story {n}.",
		"source": source,
		"url": f"https://www.cnbc.com/story-{n}",
		"datetime": stamp(day, hour=min(23, 8 + n % 10)),
	}


# ── fakes ────────────────────────────────────────────────────────────────────


class FakeResponse:
	def __init__(self, status: int, payload=None):
		self.status_code = status
		self._payload = payload if payload is not None else []

	def json(self):
		return self._payload


class FakeFinnhub:
	"""Answers company-news calls from a script of statuses per symbol.

	``script`` maps a symbol to a list of statuses served in order; once the list runs
	out the last status repeats. A 200 serves ``articles[symbol]``.
	"""

	def __init__(self, articles: dict[str, list[dict]], script: dict[str, list[int]] | None = None):
		self.articles = articles
		self.script = script or {}
		self.calls: list[dict] = []

	def get(self, url, params=None, headers=None, timeout=None):
		self.calls.append(dict(params or {}))
		sym = params["symbol"]
		statuses = self.script.get(sym, [200])
		served = sum(1 for call in self.calls if call["symbol"] == sym) - 1
		status = statuses[min(served, len(statuses) - 1)]
		return FakeResponse(status, self.articles.get(sym, []) if status == 200 else None)


class CountingLimiter:
	def __init__(self):
		self.waits = 0

	def wait(self) -> None:
		self.waits += 1


class FakeVader(SentimentModel):
	def score(self, text: str) -> float | None:
		return 0.2


class FakeGcp(SentimentModel):
	"""Records every text it was asked to score, so a test can see what was billed."""

	def __init__(self):
		self.billed: list[str] = []

	def score(self, text: str) -> float | None:
		self.billed.append(text)
		return 0.6


class FakeNewsRepo:
	"""The news_sentiment_daily table: stored article scores in, upserted rows out."""

	def __init__(self, stored: dict[str, dict[str, float]] | None = None):
		self.stored = stored or {}
		self.upserts: list[dict] = []
		self.score_reads: list[tuple[list[str], datetime.date]] = []

	def read_article_scores(self, tickers, since):
		self.score_reads.append((list(tickers), since))
		return {t: dict(self.stored.get(t, {})) for t in tickers}

	def upsert(self, rows):
		self.upserts.extend(rows)
		return len(rows)

	def prune(self, before):
		return None


def build(
	config: SentimentConfig,
	finnhub: FakeFinnhub,
	stored: dict[str, dict[str, float]] | None = None,
	gcp: FakeGcp | None = None,
):
	registry = PublisherRegistry()
	repo = FakeNewsRepo(stored)
	history = NewsHistory(config, registry, repository=repo)
	limiter = CountingLimiter()
	source = FinnhubSource(config, registry, limiter=limiter, api_key="test-key", http=finnhub)
	sleeps: list[float] = []
	ticker = NewsTicker(
		config=config,
		registry=registry,
		history=history,
		source=source,
		vader=FakeVader(),
		gcp=gcp or FakeGcp(),
		sleep=sleeps.append,
	)
	return ticker, repo, limiter, sleeps


# ── rate limits ──────────────────────────────────────────────────────────────


def test_every_call_clears_the_limiter():
	"""One wait per HTTP call, retries included. The limiter is the only thing keeping
	the tick at its share of a key other features are using at the same time."""
	finnhub = FakeFinnhub(
		{"AAPL": [article(1, today())], "MSFT": [article(2, today())]},
		script={"MSFT": [429, 200]},
	)
	ticker, _, limiter, _ = build(cfg(), finnhub)

	summary = ticker.tick(["AAPL", "MSFT"])

	assert summary["calls"] == 3
	assert len(finnhub.calls) == 3
	assert limiter.waits == 3


def test_a_refusal_is_retried_once_after_the_backoff():
	finnhub = FakeFinnhub({"AAPL": [article(1, today())]}, script={"AAPL": [429, 200]})
	ticker, repo, _, sleeps = build(cfg(news_tick_backoff_seconds=15.0), finnhub)

	summary = ticker.tick(["AAPL"])

	assert sleeps == [15.0]
	assert summary["rate_limited"] == 1
	assert summary["fetched"] == 1
	assert summary["stopped"] is None
	assert [row["ticker"] for row in repo.upserts] == ["AAPL"]


def test_a_ticker_refused_twice_is_skipped_not_hammered():
	"""Two attempts, then on to the next ticker. A third attempt at a key that has just
	refused twice is how one container ends up starving every other one."""
	finnhub = FakeFinnhub(
		{"AAPL": [article(1, today())], "MSFT": [article(2, today())]},
		script={"AAPL": [429, 429]},
	)
	ticker, repo, _, _ = build(cfg(news_tick_max_rate_limited=5), finnhub)

	summary = ticker.tick(["AAPL", "MSFT"])

	assert [c["symbol"] for c in finnhub.calls] == ["AAPL", "AAPL", "MSFT"]
	assert summary["fetched"] == 1
	assert {row["ticker"] for row in repo.upserts} == {"MSFT"}


def test_a_run_of_refusals_stops_the_pass():
	finnhub = FakeFinnhub(
		{s: [article(1, today())] for s in ("AAPL", "MSFT", "NVDA", "TSLA")},
		script={s: [429] for s in ("AAPL", "MSFT", "NVDA", "TSLA")},
	)
	ticker, repo, _, sleeps = build(cfg(news_tick_max_rate_limited=3), finnhub)

	summary = ticker.tick(["AAPL", "MSFT", "NVDA", "TSLA"])

	# AAPL refused twice, MSFT once: three in a row, and nothing after that is asked.
	assert [c["symbol"] for c in finnhub.calls] == ["AAPL", "AAPL", "MSFT"]
	assert summary["stopped"] == "rate_limited"
	assert summary["rate_limited"] == 3
	assert repo.upserts == []
	# No pause before the refusal that ends the pass: there is nothing left to wait for.
	assert sleeps == [15.0]


def test_a_success_resets_the_refusal_streak():
	finnhub = FakeFinnhub(
		{s: [article(1, today())] for s in ("AAPL", "MSFT", "NVDA")},
		script={"AAPL": [429, 200], "MSFT": [429, 200], "NVDA": [429, 200]},
	)
	ticker, _, _, _ = build(cfg(news_tick_max_rate_limited=2), finnhub)

	summary = ticker.tick(["AAPL", "MSFT", "NVDA"])

	assert summary["stopped"] is None
	assert summary["fetched"] == 3


def test_other_errors_skip_the_ticker_without_counting_as_refusals():
	finnhub = FakeFinnhub(
		{"AAPL": [], "MSFT": [article(2, today())]}, script={"AAPL": [500]}
	)
	ticker, repo, _, sleeps = build(cfg(), finnhub)

	summary = ticker.tick(["AAPL", "MSFT"])

	assert summary["rate_limited"] == 0
	assert sleeps == []
	assert summary["fetched"] == 1
	assert {row["ticker"] for row in repo.upserts} == {"MSFT"}


def test_quota_bounds_the_number_of_calls():
	tickers = [f"T{i}" for i in range(10)]
	finnhub = FakeFinnhub({t: [] for t in tickers})
	ticker, _, _, _ = build(cfg(news_tick_quota=4), finnhub)

	ticker.tick(tickers)

	assert len(finnhub.calls) == 4


def test_the_wall_clock_budget_stops_the_pass():
	finnhub = FakeFinnhub({"AAPL": [], "MSFT": []})
	ticker, _, _, _ = build(cfg(news_tick_max_seconds=0.0), finnhub)

	summary = ticker.tick(["AAPL", "MSFT"])

	assert summary["stopped"] == "budget"
	assert finnhub.calls == []


# ── what it fetches and stores ───────────────────────────────────────────────


def test_it_fetches_yesterday_and_today_only():
	finnhub = FakeFinnhub({"AAPL": []})
	ticker, repo, _, _ = build(cfg(), finnhub)

	ticker.tick(["AAPL"])

	call = finnhub.calls[0]
	assert call["from"] == (today() - datetime.timedelta(days=1)).isoformat()
	assert call["to"] == today().isoformat()
	assert call["token"] == "test-key"
	# The stored scores are read once, for the whole batch, over the same window.
	assert repo.score_reads == [(["AAPL"], today() - datetime.timedelta(days=1))]


def test_each_day_in_the_fetch_becomes_its_own_row():
	"""Yesterday's late articles land on yesterday, which is the gap the nightly leaves."""
	yesterday = today() - datetime.timedelta(days=1)
	finnhub = FakeFinnhub(
		{"AAPL": [article(1, today()), article(2, today()), article(3, yesterday)]}
	)
	ticker, repo, _, _ = build(cfg(), finnhub)

	summary = ticker.tick(["AAPL"])

	by_day = {row["as_of_day"]: row for row in repo.upserts}
	assert set(by_day) == {today().isoformat(), yesterday.isoformat()}
	assert by_day[today().isoformat()]["article_count"] == 2
	assert by_day[yesterday.isoformat()]["article_count"] == 1
	assert by_day[today().isoformat()]["tier1_count"] == 2
	assert summary["articles"] == 3
	assert summary["rows"] == 2


def test_untrusted_publishers_are_dropped_as_the_nightly_drops_them():
	blog = article(2, today(), source="SomeBlog")
	# Its own domain: on a cnbc.com URL the wire recovery would rightly credit CNBC.
	blog["url"] = "https://someblog.example/story-2"
	finnhub = FakeFinnhub({"AAPL": [article(1, today()), blog]})
	ticker, repo, _, _ = build(cfg(), finnhub)

	ticker.tick(["AAPL"])

	assert repo.upserts[0]["article_count"] == 1


def test_a_ticker_with_no_news_writes_nothing():
	finnhub = FakeFinnhub({"AAPL": []})
	ticker, repo, _, _ = build(cfg(), finnhub)

	summary = ticker.tick(["AAPL"])

	assert summary["fetched"] == 1
	assert repo.upserts == []


# ── cost: GCP only for articles never scored before ──────────────────────────


def test_an_article_already_stored_reuses_its_score_and_is_never_billed():
	fresh = article(1, today(), headline="Fresh story arrives")
	known = article(2, today(), headline="Known story from this morning")
	finnhub = FakeFinnhub({"AAPL": [fresh, known]})
	gcp = FakeGcp()
	stored = {"AAPL": {known["url"]: 30.0}}
	ticker, repo, _, _ = build(cfg(), finnhub, stored=stored, gcp=gcp)

	summary = ticker.tick(["AAPL"])

	billed_text = " ".join(gcp.billed)
	assert "Fresh story arrives" in billed_text
	assert "Known story" not in billed_text
	assert summary["reused_scores"] == 1

	articles = {a["url"]: a for a in repo.upserts[0]["top_articles"]}
	assert articles[known["url"]]["sentiment_score"] == 30.0
	assert articles[known["url"]]["sentiment"] == "Negative"


def test_gcp_slots_go_to_fresh_articles_before_known_ones():
	"""With one slot, the fresh article gets it even when the known one is newer. A slot
	spent on a known article buys nothing, since its stored score replaces the result."""
	day = today()
	known = article(1, day, headline="Known story")
	known["datetime"] = stamp(day, hour=23)
	fresh = article(2, day, headline="Fresh story")
	fresh["datetime"] = stamp(day, hour=1)
	finnhub = FakeFinnhub({"AAPL": [known, fresh]})
	gcp = FakeGcp()
	ticker, _, _, _ = build(
		cfg(news_tick_gcp_top_n=1), finnhub, stored={"AAPL": {known["url"]: 70.0}}, gcp=gcp
	)

	ticker.tick(["AAPL"])

	assert len(gcp.billed) == 1
	assert "Fresh story" in gcp.billed[0]


def test_the_tick_uses_its_own_gcp_ceiling():
	finnhub = FakeFinnhub({"AAPL": [article(n, today()) for n in range(1, 9)]})
	gcp = FakeGcp()
	ticker, _, _, _ = build(cfg(news_tick_gcp_top_n=3, gcp_top_n=10), finnhub, gcp=gcp)

	ticker.tick(["AAPL"])

	assert len(gcp.billed) == 3


def test_a_fresh_article_is_scored_exactly_as_the_run_scores_it():
	"""VADER and GCP averaged, on the same cleaned text, so a tick's day sits on the same
	scale as the nightly's."""
	finnhub = FakeFinnhub({"AAPL": [article(1, today())]})
	ticker, repo, _, _ = build(cfg(), finnhub)

	ticker.tick(["AAPL"])

	only = repo.upserts[0]["top_articles"][0]
	expected = MentionScorer.combine_scores(0.2, 0.6)
	assert only["sentiment_score"] == round((expected + 1) * 50, 2)


# ── switches and keys ────────────────────────────────────────────────────────


def test_nothing_happens_with_the_tick_switched_off():
	finnhub = FakeFinnhub({"AAPL": [article(1, today())]})
	ticker, repo, _, _ = build(cfg(news_tick_enabled=False), finnhub)

	summary = ticker.tick(["AAPL"])

	assert summary["enabled"] is False
	assert finnhub.calls == []
	assert repo.upserts == []


def test_nothing_happens_with_the_news_history_switched_off():
	"""It would fetch and score and then have nowhere to put any of it."""
	finnhub = FakeFinnhub({"AAPL": [article(1, today())]})
	ticker, _, _, _ = build(cfg(news_history_enabled=False), finnhub)

	summary = ticker.tick(["AAPL"])

	assert summary["enabled"] is False
	assert finnhub.calls == []


def _keyless_ticker(config: SentimentConfig) -> NewsTicker:
	return NewsTicker(
		config=config,
		history=NewsHistory(config, repository=FakeNewsRepo()),
		vader=FakeVader(),
		gcp=FakeGcp(),
		sleep=lambda _: None,
	)


def test_a_dedicated_key_is_preferred_and_paced_at_the_ordinary_interval(monkeypatch):
	monkeypatch.setenv("FINNHUB_API_KEY2", "team-key")
	monkeypatch.setenv("FINNHUB_API_KEY", "main-key")
	ticker = _keyless_ticker(cfg(finnhub_min_interval=1.1, news_tick_min_interval=2.0))

	source, key = ticker._source_for_tick()

	assert key == "dedicated"
	assert source.api_key() == "team-key"
	assert source.limiter.min_interval == 1.1


def test_without_a_dedicated_key_it_shares_the_main_key_at_the_slower_pace(monkeypatch):
	monkeypatch.delenv("FINNHUB_API_KEY2", raising=False)
	monkeypatch.setenv("FINNHUB_API_KEY", "main-key")
	ticker = _keyless_ticker(cfg(finnhub_min_interval=1.1, news_tick_min_interval=2.0))

	source, key = ticker._source_for_tick()

	assert key == "shared"
	assert source.api_key() == "main-key"
	from src.utils.ss_news import FINNHUB_LIMITER

	# The process wide limiter first, so it never collides with a refresh on the same
	# container, then its own slower pace for the containers it cannot see.
	assert source.limiter.limiters[0] is FINNHUB_LIMITER
	assert source.limiter.limiters[1].min_interval == 2.0


def test_with_no_key_at_all_it_says_so_and_fetches_nothing(monkeypatch):
	monkeypatch.delenv("FINNHUB_API_KEY2", raising=False)
	monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
	ticker = _keyless_ticker(cfg())

	summary = ticker.tick(["AAPL"])

	assert summary["key"] == "none"
	assert summary["stopped"] == "no_key"
	assert summary["calls"] == 0


def test_a_blank_dedicated_key_falls_back_to_the_main_one(monkeypatch):
	monkeypatch.setenv("FINNHUB_API_KEY2", "   ")
	monkeypatch.setenv("FINNHUB_API_KEY", "main-key")
	ticker = _keyless_ticker(cfg())

	_, key = ticker._source_for_tick()

	assert key == "shared"


# ── the refactored source still serves the nightly ───────────────────────────


def test_finnhub_collect_still_returns_parsed_articles_per_ticker():
	config = cfg(news_lookback_days=7)
	finnhub = FakeFinnhub(
		{"AAPL": [article(1, today())], "MSFT": []}, script={"MSFT": [429]}
	)
	limiter = CountingLimiter()
	source = FinnhubSource(config, limiter=limiter, api_key="k", http=finnhub)

	results = source.collect(["AAPL", "MSFT"])

	assert [m.headline for m in results["AAPL"]] == ["Story 1 lifts the shares"]
	assert results["MSFT"] == []
	assert limiter.waits == 2
	assert finnhub.calls[0]["from"] == (today() - datetime.timedelta(days=7)).isoformat()


# ── the endpoint ─────────────────────────────────────────────────────────────


class _StubTicker:
	def __init__(self, result=None, error: Exception | None = None):
		self.result = result or {}
		self.error = error
		self.calls: list[list[str]] = []

	def tick(self, tickers, quota=None):
		self.calls.append(list(tickers))
		if self.error:
			raise self.error
		return self.result


@pytest.fixture
def tick_client(monkeypatch):
	from fastapi.testclient import TestClient

	import src.api as api
	import src.utils.supabase_client as supabase_client

	monkeypatch.setattr(api, "DAILY_RUN_SECRET", "s3cret")
	monkeypatch.setattr(supabase_client, "get_recently_ranked_tickers", lambda days: ["AAPL"])

	def install(social: _StubTicker, news: _StubTicker):
		monkeypatch.setattr(api, "_social_ticker", lambda: social)
		monkeypatch.setattr(api, "_news_ticker", lambda: news)
		return TestClient(api.app)

	return install


def test_the_endpoint_runs_both_halves_and_keeps_the_social_keys_on_top(tick_client):
	social = _StubTicker({"enabled": True, "walked": 3, "new_posts": 9})
	news = _StubTicker({"enabled": True, "fetched": 3, "rows": 4})
	client = tick_client(social, news)

	body = client.post("/api/social/tick", headers={"x-daily-run-secret": "s3cret"}).json()

	assert body["ok"] is True
	assert body["walked"] == 3
	assert body["news"] == {"enabled": True, "fetched": 3, "rows": 4}
	assert social.calls == [["AAPL"]] and news.calls == [["AAPL"]]


def test_a_news_failure_never_costs_the_social_top_up(tick_client):
	social = _StubTicker({"enabled": True, "walked": 3})
	news = _StubTicker(error=RuntimeError("finnhub down"))
	client = tick_client(social, news)

	body = client.post("/api/social/tick", headers={"x-daily-run-secret": "s3cret"}).json()

	assert body["ok"] is True
	assert body["walked"] == 3
	assert "finnhub down" in body["news"]["error"]


def test_a_social_failure_still_reports_the_news(tick_client):
	social = _StubTicker(error=RuntimeError("stocktwits down"))
	news = _StubTicker({"enabled": True, "rows": 2})
	client = tick_client(social, news)

	body = client.post("/api/social/tick", headers={"x-daily-run-secret": "s3cret"}).json()

	assert body["ok"] is False
	assert body["news"] == {"enabled": True, "rows": 2}


def test_the_endpoint_still_requires_the_secret(tick_client):
	client = tick_client(_StubTicker(), _StubTicker())

	res = client.post("/api/social/tick", headers={"x-daily-run-secret": "wrong"})

	assert res.status_code == 401
