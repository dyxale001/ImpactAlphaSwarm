"""Tests for the backwards walk that fills a ticker's history in.

The claims defended here are the ones that decide whether this ships or gets reverted a
third time.

The first build put the seed inside ``SocialCollector.collect``, conditional on a ticker
having no stored history. That made a ticker the run had not seen before expensive *in
the run*, and on night one every ticker was new: thirty tickers walking twelve pages
against a one second floor is six minutes of sleeping, roughly ten of that run's
eighteen minutes.

So the two load bearing tests here are the ones asserting a NEGATIVE: that a run over a
ticker with no history costs exactly what a run over a seeded one costs, and that
nothing in the analysis path can reach a backfill at all. Everything else is about the
walk staying inside its bounds.

Nothing external is touched. StockTwits is a fake stream and the store is a fake.
"""

from __future__ import annotations

import datetime
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.ss_backfill import SeedRegistry, SocialBackfiller  # noqa: E402
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_social import SocialCollector, StockTwitsSource  # noqa: E402

UTC = datetime.timezone.utc


def cfg(**overrides) -> SentimentConfig:
	base = dict(
		social_history_enabled=True,
		social_display_days=7,
		social_accumulate_days=2,
		stocktwits_day_max_pages=6,
		social_backfill_max_pages=30,
		social_backfill_quota=30,
	)
	base.update(overrides)
	return SentimentConfig(**base)


class FakeStream:
	"""A StockTwits stand-in whose posts get older the further back you page."""

	def __init__(self, per_page: int = 30, day_step: float = 0.5, delay: float = 0.0):
		self.per_page = per_page
		self.day_step = day_step
		self.delay = delay
		self.calls = 0

	def get(self, url, params=None, headers=None, timeout=None):
		self.calls += 1
		if self.delay:
			time.sleep(self.delay)
		age = datetime.datetime.now(UTC) - datetime.timedelta(days=self.day_step * self.calls)
		start = 100_000 - self.calls * 1000
		messages = [
			{
				"id": start + i,
				"body": f"AAPL still looks strong here, post {start + i}",
				"created_at": age.isoformat(),
				"user": {"username": f"u{start + i}"},
				"symbols": [{"symbol": "AAPL"}],
			}
			for i in range(self.per_page)
		]
		return FakeResponse({"messages": messages, "cursor": {"more": True, "max": start}})


class FakeResponse:
	status_code = 200

	def __init__(self, payload):
		self._payload = payload

	def json(self):
		return self._payload


class _NoWait:
	def wait(self) -> None:
		return None


class FakeHistory:
	"""Stands in for SocialHistory: records what it was asked to store."""

	def __init__(self, config, seeded=None):
		self.config = config
		self.enabled = config.social_history_enabled
		self.records: list[tuple[dict, bool]] = []
		self.repository = FakeRepo(seeded or set())

	def record(self, scored_by_ticker, seeded=False):
		self.records.append((scored_by_ticker, seeded))
		return sum(1 for posts in scored_by_ticker.values() if posts)


class FakeRepo:
	def __init__(self, seeded: set[str]):
		self.seeded = {s.upper() for s in seeded}
		self.lookups = 0

	def seeded_tickers(self, tickers):
		self.lookups += 1
		return {t.upper() for t in tickers} & self.seeded


class FakeScorer:
	"""Counts how many times it is asked to score, and for what."""

	def __init__(self):
		self.batches: list[int] = []

	def score(self, mentions, priority):
		self.batches.append(len(mentions))
		return {"scored": [{"created_at": m.created_at, "message_id": m.message_id} for m in mentions]}


def backfiller(config, stream, seeded=None, scorer=None) -> SocialBackfiller:
	source = StockTwitsSource(config, session=stream)
	source.limiter = _NoWait()
	return SocialBackfiller(
		config=config,
		history=FakeHistory(config, seeded),
		source=source,
		scorer=scorer or FakeScorer(),
		seeds=SeedRegistry(),
	)


# ── the regression that killed the first build ───────────────────────────────


def test_a_run_costs_the_same_whether_the_ticker_has_history_or_not():
	"""THE test. The reverted build branched on ``high_water_mark is None`` inside the
	collector, so an unseen ticker walked twelve pages while a familiar one walked one.
	A run must not be able to tell the difference, because on night one nothing is
	familiar and every ticker takes the expensive branch at once.
	"""
	config = cfg()

	familiar = FakeStream()
	known = StockTwitsSource(config, session=familiar)
	known.limiter = _NoWait()
	known.collect(["AAPL"])

	stranger = FakeStream()
	unknown = StockTwitsSource(config, session=stranger)
	unknown.limiter = _NoWait()
	unknown.collect(["ZZZZ"])

	assert known.request_count == unknown.request_count, (
		"a run priced a new ticker differently from a familiar one, which is exactly "
		"the branch that cost eighteen minutes"
	)


def test_nothing_in_the_collection_path_can_reach_a_backfill():
	"""The structural guarantee, asserted rather than assumed. If a future change wires
	a backfiller into the scout or the collector, this fails.

	Imports are read out of the AST rather than grepped from the source, so a docstring
	explaining why the backfiller is not here does not itself trip the test.
	"""
	import ast

	root = Path(__file__).resolve().parents[1] / "src"
	watched = [root / "agents" / "sentiment_scout.py", root / "utils" / "ss_social.py"]

	for path in watched:
		tree = ast.parse(path.read_text(encoding="utf-8"))
		imported: set[str] = set()
		for node in ast.walk(tree):
			if isinstance(node, ast.Import):
				imported.update(alias.name for alias in node.names)
			elif isinstance(node, ast.ImportFrom):
				imported.add(node.module or "")
				imported.update(alias.name for alias in node.names)

		assert not any("ss_backfill" in name for name in imported), (
			f"{path.name} imports the backfill module"
		)
		assert "SocialBackfiller" not in imported, f"{path.name} imports SocialBackfiller"


def test_the_scout_holds_no_backfiller():
	"""The same guarantee at runtime rather than at parse time: a fully built scout must
	not have a backfiller hanging off any of its collaborators."""
	from src.agents.sentiment_scout import SentimentScout

	class NoSocial:
		def collect(self, tickers):
			return {t: [] for t in tickers}

	class NoNews:
		def collect(self, tickers, mode=None):
			return {t: [] for t in tickers}

	scout = SentimentScout(social_collector=NoSocial(), news_collector=NoNews())
	for name, value in vars(scout).items():
		assert not isinstance(value, SocialBackfiller), f"scout.{name} is a backfiller"


def test_the_run_walk_is_shallower_than_the_backfill_walk():
	"""The two depths are separate settings on purpose. Fusing them puts the display
	window's depth on the run's path, which is the first build's mistake in miniature."""
	config = cfg()
	source = StockTwitsSource(config, session=FakeStream())
	source.limiter = _NoWait()

	run_edge = source.window_start()
	backfill_edge = source.window_start(config.social_display_days)
	assert backfill_edge < run_edge
	assert config.stocktwits_day_max_pages < config.social_backfill_max_pages


# ── the walk stays inside its bounds ─────────────────────────────────────────


def test_the_backfill_reaches_the_whole_window_on_a_busy_ticker():
	"""The reason the backfill gets its own page ceiling. A page is about thirty posts,
	so the run's six pages is under two days for a ticker posting all day, and
	migrations/015 shipped exactly that: two bars of seven filled, on precisely the
	assets people open."""
	config = cfg()
	# Half a day per page, so seven days needs fourteen pages: past the run's six.
	stream = FakeStream(day_step=0.5)
	bf = backfiller(config, stream)
	bf.seed_one("AAPL")

	assert stream.calls > config.stocktwits_day_max_pages, (
		"the walk stopped at the run's ceiling and cannot have covered the window"
	)
	assert stream.calls <= config.social_backfill_max_pages


def test_the_backfill_page_ceiling_still_bounds_it():
	config = cfg(social_backfill_max_pages=8)
	# Never reaches the window edge, so only the ceiling can stop it.
	stream = FakeStream(day_step=0.01)
	bf = backfiller(config, stream)
	bf.seed_one("AAPL")
	assert stream.calls == 8


def test_the_wall_clock_budget_stops_a_slow_backfill():
	config = cfg(social_backfill_max_seconds=0.1, social_backfill_max_pages=50)
	stream = FakeStream(day_step=0.01, delay=0.03)
	bf = backfiller(config, stream)
	bf.seed_one("AAPL")
	assert stream.calls < 50, "the budget did not stop the walk"


# ── which tickers get walked ─────────────────────────────────────────────────


def test_only_unseeded_tickers_are_walked():
	config = cfg()
	bf = backfiller(config, FakeStream(), seeded={"AAPL", "MSFT"})
	assert bf.pending(["AAPL", "MSFT", "NVDA", "TSLA"]) == ["NVDA", "TSLA"]


def test_a_seeded_ticker_costs_no_requests_at_all():
	"""Seeding happens once per ticker ever. A night where nothing is new must make no
	HTTP calls."""
	config = cfg()
	stream = FakeStream()
	bf = backfiller(config, stream, seeded={"AAPL", "MSFT"})
	summary = bf.backfill(["AAPL", "MSFT"])

	assert stream.calls == 0
	assert summary["pending"] == 0 and summary["seeded"] == 0


def test_the_quota_bounds_the_worst_night():
	"""However many tickers are new, a night's cost is a number we chose. The reverted
	build had no equivalent, which is why night one seeded all thirty at once."""
	config = cfg(social_backfill_quota=2, social_backfill_max_pages=3)
	stream = FakeStream(day_step=0.01)
	bf = backfiller(config, stream)

	summary = bf.backfill([f"T{i}" for i in range(30)])
	assert summary["pending"] == 30
	assert summary["seeded"] == 2
	assert stream.calls <= 2 * 3


def test_the_flag_off_means_no_walk_and_no_writes():
	config = cfg(social_history_enabled=False)
	stream = FakeStream()
	bf = backfiller(config, stream)

	assert bf.backfill(["AAPL"])["seeded"] == 0
	assert bf.seed_one("AAPL") == 0
	assert stream.calls == 0


# ── the lazy seed behind the endpoint ────────────────────────────────────────


def test_a_second_seed_of_the_same_ticker_does_nothing_while_one_is_running():
	"""A page that is loading a chart is a page somebody may reload. Five reloads must
	be one walk, not five."""
	config = cfg()
	seeds = SeedRegistry()
	assert seeds.claim("AAPL") is True
	assert seeds.claim("AAPL") is False
	assert seeds.claim("MSFT") is True

	seeds.release("AAPL")
	assert seeds.claim("AAPL") is True


def test_a_failed_seed_releases_its_claim():
	"""Otherwise one error locks that ticker out of ever being seeded again for the
	life of the process."""
	config = cfg()

	class Exploding(FakeStream):
		def get(self, *args, **kwargs):
			raise RuntimeError("stocktwits fell over")

	bf = backfiller(config, Exploding())
	assert bf.seed_one("AAPL") == 0
	assert bf.seeds.active() == set()


def test_a_silent_ticker_is_still_recorded_as_walked():
	"""The trap migrations/015 fell into. A quiet ticker writes no day rows, so if
	"has rows" were the seeded test it would look unwalked on every page load and
	re-crawl forever."""
	config = cfg()

	class Empty(FakeStream):
		def get(self, *args, **kwargs):
			self.calls += 1
			return FakeResponse({"messages": [], "cursor": {"more": False}})

	bf = backfiller(config, Empty())
	bf.seed_one("QUIET")

	assert bf.history.records, "the walk recorded nothing at all"
	_, seeded = bf.history.records[-1]
	assert seeded is True, "a silent walk must still mark the ticker as walked"


# ── scoring ──────────────────────────────────────────────────────────────────


def test_the_backfill_scores_one_day_at_a_time():
	"""MentionScorer spends its metered GCP calls on the top N of whatever list it is
	handed. Scoring a whole week in one call would buy ten signals for the week and
	leave the older days on VADER alone, so the far end of the chart would be scored by
	a different method than the near end and the seam would read as a sentiment move."""
	config = cfg(social_backfill_max_pages=6)
	scorer = FakeScorer()
	# A day per page, so six pages is six distinct days.
	bf = backfiller(config, FakeStream(day_step=1.0), scorer=scorer)
	bf.seed_one("AAPL")

	assert len(scorer.batches) > 1, "the whole walk was scored as one batch"
	assert all(size > 0 for size in scorer.batches)
