"""Tests for metered GCP NLP spending in the mention scorer.

Two claims are defended here, and both are about money and time rather than about
the maths. First, a run spends a unit on exactly the top-N mentions per source and
never on a post whose author already declared their own sentiment. Second, those
units are spent together rather than one blocking call after another, which is what
makes a higher GCP_SENTIMENT_TOP_N affordable in latency.

Nothing external is touched: the GCP model is a fake that records what it was asked.
"""

from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_models import SocialMention  # noqa: E402
from src.utils.ss_scoring import (  # noqa: E402
	EngagementPriority,
	GcpNlpModel,
	MentionScorer,
	SentimentModel,
)


class RecordingGcpModel(SentimentModel):
	"""Stands in for the metered API, counting units and round trips.

	``batches`` is the point of the exercise: one entry per ``score_many`` call, so
	a regression back to per-mention calls shows up as many batches of one.
	"""

	def __init__(self, value: float = 0.5):
		self.value = value
		self.scored: list[str] = []
		self.batches: list[list[str]] = []

	def score(self, text: str) -> float | None:
		self.scored.append(text)
		return self.value

	def score_many(self, texts: list[str]) -> dict[str, float | None]:
		self.batches.append(list(texts))
		return {text: self.score(text) for text in dict.fromkeys(texts)}


def _mention(text: str, engagement: int, declared: str | None = None) -> SocialMention:
	return SocialMention(
		ticker="NPN",
		text=text,
		source="stocktwits",
		engagement=engagement,
		declared_sentiment=declared,
	)


def _scorer(gcp: RecordingGcpModel, top_n: int = 10) -> MentionScorer:
	config = SentimentConfig.from_env()
	return MentionScorer(config=config.__class__(**{**config.__dict__, "gcp_top_n": top_n}), gcp=gcp)


def test_spends_on_the_top_n_only():
	gcp = RecordingGcpModel()
	# Engagement ascending, so the last ten posts are the ones worth paying for.
	mentions = [_mention(f"post number {i}", engagement=i) for i in range(15)]

	_scorer(gcp).score(mentions, EngagementPriority())

	assert len(gcp.scored) == 10
	assert set(gcp.scored) == {f"post number {i}" for i in range(5, 15)}


def test_units_are_spent_in_one_round_trip():
	gcp = RecordingGcpModel()
	mentions = [_mention(f"post number {i}", engagement=i) for i in range(15)]

	_scorer(gcp).score(mentions, EngagementPriority())

	assert len(gcp.batches) == 1
	assert len(gcp.batches[0]) == 10


def test_declared_sentiment_never_costs_a_unit():
	gcp = RecordingGcpModel()
	# Every one of these would otherwise be in the top-N by engagement.
	mentions = [
		_mention("tagged bullish already", engagement=100, declared="Bullish"),
		_mention("tagged bearish already", engagement=99, declared="Bearish"),
		_mention("an untagged take", engagement=98),
	]

	_scorer(gcp).score(mentions, EngagementPriority())

	assert gcp.scored == ["an untagged take"]


def test_prefetched_scores_match_calling_the_model_directly():
	"""The batch is a change of timing, not of arithmetic."""
	mentions = [_mention(f"post number {i}", engagement=i) for i in range(4)]

	batched = _scorer(RecordingGcpModel()).score(mentions, EngagementPriority())

	# The same scorer with an empty prefetch map falls through to per-mention calls.
	scorer = _scorer(RecordingGcpModel())
	one_at_a_time = [
		scorer.signed_score(mention, use_gcp=True, gcp_scores=None) for mention in mentions
	]

	assert [item["sentiment_raw"] for item in batched["scored"]] == [
		round(value, 4) for value in one_at_a_time
	]


def test_the_pool_really_overlaps_the_calls():
	"""The claim is concurrency, so prove it rather than trusting the pool.

	Each fake call waits on a barrier wide enough for the whole set. Sequentially
	the first call would sit there until the timeout and raise; together they all
	arrive and it lifts.
	"""
	texts = [f"post number {i}" for i in range(10)]
	barrier = threading.Barrier(len(texts), timeout=5)

	class BarrierModel(GcpNlpModel):
		def score(self, text: str) -> float | None:
			barrier.wait()
			return 0.5

	scores = BarrierModel(max_workers=10).score_many(texts)

	assert scores == {text: 0.5 for text in texts}


def test_the_pool_respects_its_in_flight_ceiling():
	"""Workers below the text count still finish, in more than one round trip."""
	texts = [f"post number {i}" for i in range(6)]
	in_flight = 0
	peak = 0
	lock = threading.Lock()

	class CountingModel(GcpNlpModel):
		def score(self, text: str) -> float | None:
			nonlocal in_flight, peak
			with lock:
				in_flight += 1
				peak = max(peak, in_flight)
			time.sleep(0.05)
			with lock:
				in_flight -= 1
			return 0.5

	CountingModel(max_workers=2).score_many(texts)

	assert peak <= 2


def test_a_repeated_post_costs_one_unit():
	gcp = RecordingGcpModel()
	mentions = [_mention("the same take twice", engagement=i) for i in range(2)]

	_scorer(gcp).score(mentions, EngagementPriority())

	assert len(gcp.scored) == 1
