"""Tests for three figures the sentiment pages showed that were not true.

1. A post's "% of score" was its share of the sample it arrived in, not of the day. A
   day is many samples added together, so a post from a ten post tick claimed ten per
   cent of a day of three hundred.
2. A run that scored no posts stored the scorer's neutral 50 as the social score, which
   the card showed as a real "Social 50, Neutral".
3. News carried over from an earlier run had no age limit, so weeks-old articles sat
   under "news from the past 7 days" beside a score computed when they were fresh.

No network and no database: everything here is a pure function or a fake.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents import sentiment_scout  # noqa: F401,E402  (import order breaks a cycle)
from src.utils.rec_writer import CarriedNews, RecommendationWriter  # noqa: E402
from src.utils.ss_config import SentimentConfig  # noqa: E402
from src.utils.ss_daily import SocialDayBuilder, SocialHistory  # noqa: E402

TODAY = datetime.date(2026, 10, 10)


# ── 1. a post's share of the whole day ───────────────────────────────────────


def scored_post(n: int, raw: float, weight: float) -> dict:
	return {
		"text": f"post {n}",
		"source": f"stocktwits:user{n}",
		"url": f"https://stocktwits.com/m/{n}",
		"created_at": "2026-10-10T12:00:00+00:00",
		"message_id": n,
		"weight": weight,
		"sentiment_raw": raw,
		"sentiment_contribution": round((raw + 1) * 50, 2),
	}


def test_a_stored_post_keeps_its_weight():
	builder = SocialDayBuilder(SentimentConfig(social_day_top_posts=15))

	row = builder.build("AAPL", [scored_post(1, 0.6, 2.5), scored_post(2, -0.4, 1.0)])[0]

	weights = {post["url"]: post["weight"] for post in row["top_posts"]}
	assert weights == {"https://stocktwits.com/m/1": 2.5, "https://stocktwits.com/m/2": 1.0}


def test_influence_is_the_share_of_the_whole_day_not_the_sample():
	"""Two posts from a small tick: the sample made each 50 per cent of "the score". On
	a day whose total weight is 40, a post weighing 2 is 5 per cent of it."""
	posts = [
		{"url": "a", "weight": 2.0, "influence": 50.0, "sentiment_score": 80},
		{"url": "b", "weight": 2.0, "influence": 50.0, "sentiment_score": 20},
	]

	shares = SocialHistory._day_shares(posts, 40.0)

	assert [p["influence"] for p in shares] == [5.0, 5.0]


def test_a_post_stored_before_weights_were_kept_recovers_it_from_its_rank():
	# rank is abs(raw) * weight; raw 0.6 (score 80) with rank 1.2 means weight 2.
	posts = [{"url": "a", "rank": 1.2, "sentiment_score": 80, "influence": 90.0}]

	shares = SocialHistory._day_shares(posts, 20.0)

	assert shares[0]["influence"] == 10.0


def test_a_neutral_post_with_no_weight_has_no_share_rather_than_a_wrong_one():
	posts = [{"url": "a", "rank": 0.0, "sentiment_score": 50, "influence": 30.0}]

	shares = SocialHistory._day_shares(posts, 20.0)

	assert shares[0]["influence"] is None


def test_a_day_with_no_total_weight_claims_no_shares():
	shares = SocialHistory._day_shares([{"url": "a", "weight": 1.0}], None)

	assert shares[0]["influence"] is None


def test_the_history_point_serves_day_shares():
	row = {
		"as_of_night": "2026-10-10",
		"social_sentiment_score": 60,
		"post_count": 30,
		"weight_sum": 50.0,
		"top_posts": [{"url": "a", "weight": 5.0, "influence": 80.0}],
	}

	point = SocialHistory._point(TODAY, row)

	assert point["top_posts"][0]["influence"] == 10.0


# ── 2. no posts is no reading, not a neutral one ─────────────────────────────


def test_a_run_with_no_posts_stores_no_social_score():
	sentiment = {"social_sentiment_score": 50, "mention_count": 0, "sentiment_score": 64}

	assert RecommendationWriter._social_score(sentiment) is None


def test_a_run_with_posts_stores_its_score_even_when_it_is_fifty():
	sentiment = {"social_sentiment_score": 50, "mention_count": 12}

	assert RecommendationWriter._social_score(sentiment) == 50


def test_the_blended_score_is_never_stored_as_the_social_one():
	"""The old fallback chain reached for the blended score when social was missing."""
	sentiment = {"mention_count": 3, "sentiment_score": 64}

	assert RecommendationWriter._social_score(sentiment) is None


# ── 3. carried-over news is recent, re-scored and labelled ───────────────────


def article(day: str, score: float, tier: int = 1, sentiment: str = "Positive") -> dict:
	return {
		"source": "CNBC",
		"tier": tier,
		"date": day,
		"headline": f"Story on {day}",
		"url": f"https://www.cnbc.com/{day}",
		"sentiment": sentiment,
		"sentiment_score": score,
		"influence": 99.0,
	}


def carried(**kwargs) -> CarriedNews:
	return CarriedNews(lookback_days=7, today=TODAY, **kwargs)


def test_articles_older_than_the_window_are_not_carried():
	prior = {
		"created_at": "2026-10-08T22:00:00",
		"news_articles": [article("2026-10-07", 80), article("2026-09-20", 20, sentiment="Negative")],
	}

	restated = carried().restate(prior)

	assert [a["date"] for a in restated["news_articles"]] == ["2026-10-07"]
	assert restated["news_count"] == 1
	assert restated["news_bullish"] == 1 and restated["news_bearish"] == 0


def test_nothing_is_carried_when_every_article_is_too_old():
	prior = {"created_at": "2026-09-25T22:00:00", "news_articles": [article("2026-09-20", 80)]}

	assert carried().restate(prior) is None


def test_the_window_edge_matches_the_finnhub_fetch():
	"""Finnhub fetches from today minus the lookback, inclusive."""
	prior = {"created_at": "2026-10-04", "news_articles": [article("2026-10-03", 70)]}

	assert carried().restate(prior)["news_count"] == 1
	assert carried().restate({"news_articles": [article("2026-10-02", 70)]}) is None


def test_the_score_and_influence_describe_only_the_articles_carried():
	"""The stored score included the dropped article. Restated, it is the survivor's."""
	prior = {
		"created_at": "2026-10-08T22:00:00",
		"news_sentiment_score": 50,
		"news_articles": [article("2026-10-08", 80), article("2026-09-01", 20, sentiment="Negative")],
	}

	restated = carried().restate(prior)

	assert restated["news_sentiment_score"] == 80
	assert restated["news_articles"][0]["influence"] == 100.0


def test_carried_articles_are_tagged_with_where_they_came_from():
	prior = {"created_at": "2026-10-08T22:00:00", "news_articles": [article("2026-10-08", 60)]}

	only = carried().restate(prior)["news_articles"][0]

	assert only["carried_over"] is True
	assert only["carried_from"] == "2026-10-08"


def test_restating_never_mutates_the_prior_row():
	original = article("2026-10-08", 60)
	prior = {"created_at": "2026-10-08", "news_articles": [original]}

	carried().restate(prior)

	assert "carried_over" not in original
	assert original["influence"] == 99.0


class _FakeQuery:
	def __init__(self, rows):
		self.rows = rows

	def select(self, *_a, **_k):
		return self

	def in_(self, *_a, **_k):
		return self

	def gt(self, *_a, **_k):
		return self

	def order(self, *_a, **_k):
		return self

	def limit(self, *_a, **_k):
		return self

	def execute(self):
		class _Resp:
			pass

		resp = _Resp()
		resp.data = self.rows
		return resp


class _FakeClient:
	def __init__(self, rows):
		self.rows = rows

	def table(self, _name):
		return _FakeQuery(self.rows)


def test_the_writer_drops_an_asset_whose_prior_news_is_all_stale():
	rows = [
		{"asset_id": "fresh", "created_at": "2026-10-08", "news_count": 1,
		 "news_articles": [article("2026-10-08", 70)]},
		{"asset_id": "stale", "created_at": "2026-09-10", "news_count": 1,
		 "news_articles": [article("2026-09-10", 70)]},
	]
	writer = RecommendationWriter(client=_FakeClient(rows), prices=object(), carried_news=carried())
	ranked = [{"ticker": "AAA"}, {"ticker": "BBB"}]
	sentiment = {"AAA": {"news_count": 0}, "BBB": {"news_count": 0}}

	prior = writer._prior_news_for(ranked, sentiment, {"AAA": "fresh", "BBB": "stale"})

	assert set(prior) == {"fresh"}
	assert prior["fresh"]["news_articles"][0]["carried_over"] is True
