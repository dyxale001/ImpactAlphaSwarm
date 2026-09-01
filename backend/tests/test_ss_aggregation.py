"""Unit tests for sentiment aggregation (src/utils/ss_aggregation.py).

The module's whole claim is that two weighting dimensions stay independent:

  * Reliability (tier) works ACROSS tiers -- each tier contributes its own
    average at a fixed share, so a tier's influence does not depend on how many
    articles it has.
  * Recency works WITHIN a tier -- newer articles of the same tier count more, on
    an exponential half-life.

That separation is the reason a handful of tier-1 wires are not drowned by a
flood of tier-3 contributor posts. It is also invisible in the output: a broken
version still returns a plausible number in [-1, 1]. These tests assert the
property directly rather than trusting the number to look reasonable.

Tier shares are pinned to their defaults in conftest (0.6 / 0.3 / 0.1).
"""

from datetime import datetime, timedelta, timezone

import pytest

from src.utils.ss_aggregation import (
    NEWS_RECENCY_HALFLIFE_DAYS,
    NEWS_WEIGHT,
    SOCIAL_WEIGHT,
    _aggregate_signed,
    _blend_sentiment,
    _influence_weights,
    _recency_weight,
    _recency_weighted_avg,
)


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────

def days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def article(sentiment, tier, days=0.0):
    return {"sentiment_raw": sentiment, "tier": tier, "created_at": days_ago(days)}


def post(sentiment, weight=1.0, days=0.0):
    """A social mention: no tier, carries an engagement weight."""
    return {"sentiment_raw": sentiment, "weight": weight, "created_at": days_ago(days)}


def counted(score, count):
    return {"sentiment_score": score, "mention_count": count}


# ═════════════════════════════════════════════════════════════════════════════
# _recency_weight
# ═════════════════════════════════════════════════════════════════════════════

class TestRecencyWeight:
    @pytest.mark.parametrize("missing", [None, ""])
    def test_a_missing_timestamp_is_not_penalised(self, missing):
        assert _recency_weight(missing) == 1.0

    @pytest.mark.parametrize("junk", ["not-a-date", "2026-13-45", 12345, "yesterday"])
    def test_an_unparseable_timestamp_is_not_penalised(self, junk):
        # Failing open matters: penalising a parse failure would quietly suppress
        # a whole source whose date format drifted.
        assert _recency_weight(junk) == 1.0

    def test_a_brand_new_article_carries_full_weight(self):
        assert _recency_weight(days_ago(0)) == pytest.approx(1.0, rel=1e-4)

    def test_a_future_timestamp_is_clamped_to_full_weight(self):
        future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        assert _recency_weight(future) == 1.0

    def test_one_half_life_halves_the_weight(self):
        assert _recency_weight(days_ago(NEWS_RECENCY_HALFLIFE_DAYS)) == pytest.approx(0.5, rel=1e-3)

    def test_two_half_lives_quarter_the_weight(self):
        assert _recency_weight(days_ago(2 * NEWS_RECENCY_HALFLIFE_DAYS)) == pytest.approx(0.25, rel=1e-3)

    def test_weight_decays_monotonically_with_age(self):
        weights = [_recency_weight(days_ago(d)) for d in (0, 1, 2, 4, 8, 16)]
        assert weights == sorted(weights, reverse=True)
        assert all(0.0 < w <= 1.0 for w in weights)

    def test_a_naive_timestamp_is_read_as_utc(self):
        naive = (datetime.now(timezone.utc) - timedelta(days=2)).replace(tzinfo=None).isoformat()
        assert _recency_weight(naive) == pytest.approx(0.5, rel=1e-3)

    def test_a_z_suffixed_timestamp_does_not_decay_on_this_runtime(self):
        # PINNED BEHAVIOUR, worth knowing. datetime.fromisoformat rejects a "Z"
        # suffix before Python 3.11 (the backend pins 3.10/3.12), so such a value
        # fails open at weight 1.0 -- recency silently stops applying rather than
        # raising. The live path is safe because created_at is written with
        # datetime.isoformat(), which emits "+00:00"; this test exists so that if
        # a raw Supabase/JSON timestamp is ever wired in directly, the silent
        # loss of decay is a visible decision and not a surprise.
        assert _recency_weight("2026-08-07T10:00:00Z") == 1.0


class TestRecencyWeightedAverage:
    def test_equal_weights_give_a_plain_mean(self):
        assert _recency_weighted_avg([(1.0, 1.0), (-1.0, 1.0)]) == pytest.approx(0.0)

    def test_heavier_items_pull_the_average(self):
        assert _recency_weighted_avg([(1.0, 3.0), (-1.0, 1.0)]) == pytest.approx(0.5)

    def test_zero_weights_fall_back_to_an_unweighted_mean(self):
        # Reached when every article is old enough for the decay to underflow.
        # Returning 0/0 here would poison the whole score with NaN.
        assert _recency_weighted_avg([(1.0, 0.0), (0.0, 0.0)]) == pytest.approx(0.5)

    def test_a_single_item_is_its_own_average(self):
        assert _recency_weighted_avg([(0.42, 0.001)]) == pytest.approx(0.42)


# ═════════════════════════════════════════════════════════════════════════════
# _aggregate_signed
# ═════════════════════════════════════════════════════════════════════════════

class TestAggregateSigned:
    def test_no_items_is_neutral(self):
        assert _aggregate_signed([]) == 0.0

    def test_a_single_tier_returns_its_own_average(self):
        assert _aggregate_signed([article(1.0, tier=1)]) == pytest.approx(1.0)
        assert _aggregate_signed([article(-1.0, tier=2)]) == pytest.approx(-1.0)

    def test_the_result_stays_within_bounds(self):
        items = [article(1.0, 1), article(-1.0, 2), article(0.4, 3), post(-0.9, weight=8)]
        assert -1.0 <= _aggregate_signed(items) <= 1.0

    def test_one_tier1_wire_outweighs_a_flood_of_tier3_posts(self):
        # THE headline property. A per-article mean here would give
        # (1 + 20*-1) / 21 = -0.90; the tier-share structure gives a positive
        # number because tier 1 keeps its full 0.6 share against tier 3's 0.1.
        items = [article(1.0, tier=1)] + [article(-1.0, tier=3) for _ in range(20)]
        assert _aggregate_signed(items) == pytest.approx((0.6 - 0.1) / (0.6 + 0.1))
        assert _aggregate_signed(items) > 0

    def test_tier_influence_is_independent_of_article_count(self):
        # INVARIANT: adding more articles that agree with their own tier's
        # average must not change the blend at all.
        few = [article(1.0, 1), article(-1.0, 3)]
        many = [article(1.0, 1)] + [article(-1.0, 3) for _ in range(50)]
        assert _aggregate_signed(few) == pytest.approx(_aggregate_signed(many))

    def test_an_older_tier1_wire_still_outweighs_newer_tier3_articles(self):
        # Recency lives INSIDE the tier average and never across tiers, so age
        # cannot demote a tier below its share.
        items = [article(1.0, tier=1, days=10)] + [article(-1.0, tier=3, days=0) for _ in range(5)]
        assert _aggregate_signed(items) > 0

    def test_recency_orders_articles_within_a_tier(self):
        # Same tier, opposite readings: the newer one wins.
        fresh_positive = [article(1.0, tier=1, days=0), article(-1.0, tier=1, days=6)]
        fresh_negative = [article(-1.0, tier=1, days=0), article(1.0, tier=1, days=6)]
        assert _aggregate_signed(fresh_positive) > 0
        assert _aggregate_signed(fresh_negative) < 0

    def test_shares_are_renormalised_over_the_tiers_actually_present(self):
        # Tiers 1 and 3 only: 0.6 and 0.1 renormalise over 0.7.
        items = [article(1.0, tier=1), article(0.0, tier=3)]
        assert _aggregate_signed(items) == pytest.approx(0.6 / 0.7)

    @pytest.mark.parametrize("tier", [None, 0, 4, "1"])
    def test_items_without_a_recognised_tier_are_treated_as_social(self, tier):
        # Only 1/2/3 count as tiered news; anything else falls to the untiered
        # (engagement-weighted) path rather than being dropped or crashing.
        items = [{"sentiment_raw": 1.0, "tier": tier, "created_at": days_ago(0), "weight": 1.0}]
        assert _aggregate_signed(items) == pytest.approx(1.0)

    def test_social_engagement_pulls_the_average(self):
        items = [post(1.0, weight=3.0), post(-1.0, weight=1.0)]
        assert _aggregate_signed(items) == pytest.approx(0.5)

    def test_negative_engagement_is_clamped_to_zero_not_sign_flipped(self):
        # A negative weight would invert the post's sentiment, turning an
        # unpopular bullish take into a bearish signal.
        items = [post(1.0, weight=-5.0), post(-1.0, weight=1.0)]
        assert _aggregate_signed(items) == pytest.approx(-1.0)

    def test_any_tiered_item_takes_precedence_over_the_untiered_fallback(self):
        # The untiered path is a fallback for "no news at all", not a blend.
        items = [article(1.0, tier=1), post(-1.0, weight=100.0)]
        assert _aggregate_signed(items) == pytest.approx(1.0)


# ═════════════════════════════════════════════════════════════════════════════
# _influence_weights
# ═════════════════════════════════════════════════════════════════════════════

class TestInfluenceWeights:
    def test_no_items_gives_no_weights(self):
        assert _influence_weights([]) == {}

    def test_weights_sum_to_one(self):
        # These are displayed as each article's share of the score, so they have
        # to be a real decomposition rather than arbitrary numbers.
        items = [article(1.0, 1), article(0.5, 2), article(-0.5, 3), article(0.2, 1)]
        assert sum(_influence_weights(items).values()) == pytest.approx(1.0)

    def test_a_tier1_article_outweighs_a_tier3_one(self):
        tier1, tier3 = article(1.0, 1), article(-1.0, 3)
        weights = _influence_weights([tier1, tier3])
        assert weights[id(tier1)] == pytest.approx(0.6 / 0.7)
        assert weights[id(tier3)] == pytest.approx(0.1 / 0.7)

    def test_a_tiers_share_is_split_across_its_own_articles_by_recency(self):
        # One tier only, so it holds the entire share; the newer article takes
        # the larger slice of it.
        fresh, stale = article(1.0, 1, days=0), article(1.0, 1, days=6)
        weights = _influence_weights([fresh, stale])
        assert sum(weights.values()) == pytest.approx(1.0)
        assert weights[id(fresh)] > weights[id(stale)]

    def test_adding_articles_to_a_tier_dilutes_that_tier_not_the_others(self):
        # The mirror of the count-independence property in _aggregate_signed.
        tier1 = article(1.0, 1)
        tier3_items = [article(-1.0, 3) for _ in range(4)]
        weights = _influence_weights([tier1] + tier3_items)
        assert weights[id(tier1)] == pytest.approx(0.6 / 0.7)
        assert sum(weights[id(i)] for i in tier3_items) == pytest.approx(0.1 / 0.7)

    def test_social_only_weights_are_shares_of_engagement(self):
        loud, quiet = post(1.0, weight=3.0), post(-1.0, weight=1.0)
        weights = _influence_weights([loud, quiet])
        assert sum(weights.values()) == pytest.approx(1.0)
        assert weights[id(loud)] == pytest.approx(0.75)
        assert weights[id(quiet)] == pytest.approx(0.25)

    def test_zero_total_engagement_falls_back_to_an_even_split(self):
        a, b = post(1.0, weight=0.0), post(-1.0, weight=0.0)
        weights = _influence_weights([a, b])
        assert weights[id(a)] == pytest.approx(0.5)
        assert weights[id(b)] == pytest.approx(0.5)

    def test_tiered_items_suppress_the_untiered_branch(self):
        # Matches _aggregate_signed: once any tiered news exists, social posts
        # do not receive an influence share.
        tiered, social = article(1.0, 1), post(-1.0, weight=10.0)
        weights = _influence_weights([tiered, social])
        assert weights[id(tiered)] == pytest.approx(1.0)
        assert id(social) not in weights


# ═════════════════════════════════════════════════════════════════════════════
# _blend_sentiment
# ═════════════════════════════════════════════════════════════════════════════

class TestBlendSentiment:
    def test_no_data_from_either_source_is_neutral_fifty(self):
        assert _blend_sentiment(counted(0, 0), counted(0, 0)) == 50

    def test_falls_back_to_social_when_there_is_no_news(self):
        assert _blend_sentiment(counted(99, 0), counted(30, 5)) == 30

    def test_falls_back_to_news_when_there_is_no_social(self):
        assert _blend_sentiment(counted(80, 5), counted(99, 0)) == 80

    def test_both_sources_blend_on_the_configured_weights(self):
        # 0.7 * 80 + 0.3 * 40 = 68
        assert _blend_sentiment(counted(80, 5), counted(40, 5)) == 68

    def test_news_is_weighted_above_social(self):
        # D-078: trusted financial reporting is a more reliable signal than
        # retail chatter, so the blend must sit nearer the news score.
        assert NEWS_WEIGHT > SOCIAL_WEIGHT
        assert NEWS_WEIGHT + SOCIAL_WEIGHT == pytest.approx(1.0)
        blended = _blend_sentiment(counted(90, 5), counted(10, 5))
        assert abs(blended - 90) < abs(blended - 10)

    def test_agreeing_sources_leave_the_score_where_they_both_are(self):
        assert _blend_sentiment(counted(70, 3), counted(70, 9)) == 70

    def test_the_blend_is_an_integer(self):
        # The column is an int; a float here would fail on write.
        result = _blend_sentiment(counted(77, 5), counted(43, 5))
        assert isinstance(result, int)

    def test_the_blend_stays_between_the_two_inputs(self):
        for news_score, social_score in [(80, 40), (10, 90), (55, 55), (0, 100)]:
            blended = _blend_sentiment(counted(news_score, 4), counted(social_score, 4))
            assert min(news_score, social_score) <= blended <= max(news_score, social_score)

    def test_the_count_gate_is_zero_not_falsy_data(self):
        # A source with items but a genuinely 0 sentiment score must still take
        # part in the blend rather than being treated as absent.
        assert _blend_sentiment(counted(0, 5), counted(100, 5)) == 30
