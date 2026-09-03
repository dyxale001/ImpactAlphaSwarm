"""Unit tests for the unified ranking v2 formula (src/orchestration/ranking.py).

    rank_score = signal_strength x convergence x data_sufficiency x profile_fit

The module docstring says it is "the pure implementation: no I/O, no DB, no LLM,
every constant env-tunable, so it can be unit-tested and replayed offline". These
are those tests.

Two kinds of assertion live here, and the distinction matters when one fails:

  * INVARIANTS -- properties the design promises and that must hold for any
    input (bounds, symmetry, monotonicity, "profile_fit never promotes", "the
    stability pass never drops a candidate"). A failure here is a real defect.

  * PINNED VALUES -- the arithmetic the current constants produce. A failure here
    means a threshold moved. That is not automatically a bug, but it must be a
    deliberate change, because these numbers are the feed order users see.

Several tests are named for regressions the project has already paid for once;
those carry a comment saying which.
"""

import pytest

from src.orchestration import ranking
from src.orchestration.ranking import (
    CONVERGENCE_STATES,
    CONV_FLOOR,
    DS_FLOOR,
    PF_FLOOR,
    QUANT_NO_DATA,
    QUANT_RANKED,
    QUANT_SMALL_UNIVERSE,
    QUANT_UNMEASURED,
    RANKING_VERSION,
    apply_stability,
    convergence,
    convergence_state,
    data_sufficiency,
    profile_fit,
    quant_lean,
    rank_assets,
    rank_terms,
    sentiment_lean,
    signal_strength,
    strength_variants,
)


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────

def quant(momentum=None, rar=None, stability=None, state=QUANT_RANKED, **extra):
    """A Stage-B quant row as score_universe emits it."""
    row = {
        "sub_dimensions": {
            "momentum": momentum,
            "risk_adjusted_return": rar,
            "stability": stability,
        },
        "quant_normalisation": state,
    }
    row.update(extra)
    return row


def sentiment(score=None, news_count=0, mention_count=0):
    return {
        "sentiment_score": score,
        "news_count": news_count,
        "mention_count": mention_count,
    }


def row(ticker, score):
    """A minimal ranked row, which is all apply_stability reads."""
    return {"ticker": ticker, "rank_score": score}


# ═════════════════════════════════════════════════════════════════════════════
# quant_lean
# ═════════════════════════════════════════════════════════════════════════════

class TestQuantLean:
    @pytest.mark.parametrize("empty", [None, {}])
    def test_absent_quant_is_neutral_and_unmeasured(self, empty):
        assert quant_lean(empty) == (0.0, QUANT_UNMEASURED)

    def test_percentiles_map_linearly_onto_minus_one_to_one(self):
        assert quant_lean(quant(100, 100, 100))[0] == pytest.approx(1.0)
        assert quant_lean(quant(50, 50, 50))[0] == pytest.approx(0.0)
        assert quant_lean(quant(0, 0, 0))[0] == pytest.approx(-1.0)

    def test_mean_of_present_subdimensions(self):
        # (80 + 60 + 70) / 3 = 70th percentile -> 2*0.7 - 1
        lean, state = quant_lean(quant(80, 60, 70))
        assert lean == pytest.approx(0.4)
        assert state == QUANT_RANKED

    def test_missing_subdimensions_are_skipped_not_treated_as_zero(self):
        # Only momentum present: the mean is over what exists, so an absent
        # sub-dimension must not drag the lean toward -1.
        assert quant_lean(quant(momentum=80))[0] == pytest.approx(0.6)

    @pytest.mark.parametrize("state", [QUANT_SMALL_UNIVERSE, QUANT_NO_DATA])
    def test_unrankable_states_are_reported_not_collapsed_to_neutral(self, state):
        # INVARIANT (plan 3.1 / R6): "we could not measure this" must stay
        # distinguishable from "we measured it and it is mid-pack". Both return a
        # 0.0 lean, so the STATE is the only thing carrying the difference.
        assert quant_lean(quant(state=state)) == (0.0, state)

    def test_no_percentiles_under_a_ranked_state_falls_back_to_unmeasured(self):
        assert quant_lean(quant(state=QUANT_RANKED)) == (0.0, QUANT_UNMEASURED)

    def test_missing_state_with_percentiles_defaults_to_cross_sectional(self):
        assert quant_lean(quant(50, 50, 50, state=None))[1] == QUANT_RANKED

    def test_rsi_and_beta_are_never_folded_into_the_lean(self):
        # INVARIANT: RSI and beta are non-monotonic. Folding them in is precisely
        # what made the old composite "a covert verdict"; they are context bands
        # only. Adding them must not move the number.
        without = quant_lean(quant(60, 60, 60))
        with_bands = quant_lean(quant(60, 60, 60, rsi=12.0, beta=3.4, bands={"rsi": "oversold"}))
        assert without == with_bands

    def test_lean_is_always_within_bounds(self):
        for pct in (-500, -1, 0, 33.3, 50, 99.9, 100, 500):
            lean, _ = quant_lean(quant(pct, pct, pct))
            assert -1.0 <= lean <= 1.0


# ═════════════════════════════════════════════════════════════════════════════
# sentiment_lean
# ═════════════════════════════════════════════════════════════════════════════

class TestSentimentLean:
    @pytest.mark.parametrize("empty", [None, {}, {"sentiment_score": None}])
    def test_absent_sentiment_is_neutral_and_flagged_absent(self, empty):
        assert sentiment_lean(empty) == (0.0, False)

    def test_score_maps_from_0_100_onto_minus_one_to_one(self):
        assert sentiment_lean(sentiment(100, news_count=1))[0] == pytest.approx(1.0)
        assert sentiment_lean(sentiment(50, news_count=1))[0] == pytest.approx(0.0)
        assert sentiment_lean(sentiment(0, news_count=1))[0] == pytest.approx(-1.0)
        assert sentiment_lean(sentiment(75, news_count=1))[0] == pytest.approx(0.5)

    def test_out_of_range_scores_are_clamped(self):
        assert sentiment_lean(sentiment(500, news_count=1))[0] == 1.0
        assert sentiment_lean(sentiment(-500, news_count=1))[0] == -1.0

    @pytest.mark.parametrize(
        "news,social,expected",
        [(0, 0, False), (3, 0, True), (0, 7, True), (3, 7, True)],
    )
    def test_has_data_is_true_when_either_source_contributed(self, news, social, expected):
        _, has_data = sentiment_lean(sentiment(60, news_count=news, mention_count=social))
        assert has_data is expected

    def test_a_score_with_no_underlying_items_is_reported_as_no_coverage(self):
        # REGRESSION GUARD: the old code defaulted a missing score to 50, making
        # "no coverage" look identical to "genuinely mixed". A score can still
        # arrive with zero counts, and has_data must say so.
        lean, has_data = sentiment_lean(sentiment(75, news_count=0, mention_count=0))
        assert lean == pytest.approx(0.5)
        assert has_data is False


# ═════════════════════════════════════════════════════════════════════════════
# signal_strength / strength_variants
# ═════════════════════════════════════════════════════════════════════════════

class TestSignalStrength:
    @pytest.mark.parametrize(
        "combined,shift,clip,absolute",
        [
            (-1.0, 0.0, 0.0, 1.0),
            (-0.5, 0.25, 0.0, 0.5),
            (0.0, 0.5, 0.0, 0.0),
            (0.5, 0.75, 0.5, 0.5),
            (1.0, 1.0, 1.0, 1.0),
        ],
    )
    def test_every_direction_variant_is_computed(self, combined, shift, clip, absolute):
        # All three are persisted on every row so plan R1 (how to treat direction)
        # can be settled from shadow data without re-running the pipeline.
        variants = strength_variants(combined)
        assert variants["shift"] == pytest.approx(shift)
        assert variants["clip"] == pytest.approx(clip)
        assert variants["abs"] == pytest.approx(absolute)

    def test_variants_are_always_in_unit_range(self):
        for combined in (-5.0, -1.0, -0.3, 0.0, 0.3, 1.0, 5.0):
            for value in strength_variants(combined).values():
                assert 0.0 <= value <= 1.0

    @pytest.mark.parametrize("mode", ["shift", "clip", "abs"])
    def test_mode_selects_the_matching_variant(self, mode):
        assert signal_strength(0.4, mode) == pytest.approx(strength_variants(0.4)[mode])

    def test_filter_mode_drops_unfavourable_assets(self):
        assert signal_strength(-0.01, "filter") is None
        assert signal_strength(0.0, "filter") == pytest.approx(0.5)
        assert signal_strength(0.5, "filter") == pytest.approx(0.75)

    def test_unknown_mode_falls_back_to_shift_rather_than_crashing(self):
        # The source comment is explicit: "unknown value -> documented default,
        # never crash". A typo'd env var must not take the nightly run down.
        assert signal_strength(0.4, "nonsense") == pytest.approx(0.7)

    def test_mode_is_case_and_whitespace_insensitive(self):
        assert signal_strength(-0.5, "  ABS  ") == pytest.approx(0.5)

    def test_default_mode_is_read_from_module_config(self, monkeypatch):
        monkeypatch.setattr(ranking, "DIRECTION_MODE", "clip")
        assert signal_strength(-0.5) == 0.0


# ═════════════════════════════════════════════════════════════════════════════
# convergence
# ═════════════════════════════════════════════════════════════════════════════

class TestConvergence:
    def test_identical_leans_agree_completely(self):
        assert convergence(0.7, 0.7) == pytest.approx(1.0)

    def test_opposite_extremes_land_on_the_floor(self):
        assert convergence(1.0, -1.0) == pytest.approx(CONV_FLOOR)
        assert convergence(-1.0, 1.0) == pytest.approx(CONV_FLOOR)

    def test_convergence_is_symmetric(self):
        for a, b in [(0.3, -0.6), (1.0, 0.2), (-0.9, -0.1), (0.0, 0.5)]:
            assert convergence(a, b) == pytest.approx(convergence(b, a))

    def test_convergence_never_leaves_the_floor_to_one_band(self):
        for a in (-1.0, -0.5, 0.0, 0.5, 1.0):
            for b in (-1.0, -0.5, 0.0, 0.5, 1.0):
                assert CONV_FLOOR <= convergence(a, b) <= 1.0

    def test_disagreement_lowers_convergence_monotonically(self):
        # INVARIANT: the further apart the two signals, the lower the term.
        spreads = [convergence(0.0, gap) for gap in (0.0, 0.25, 0.5, 0.75, 1.0)]
        assert spreads == sorted(spreads, reverse=True)

    def test_hype_is_demoted_as_a_conflict_not_a_flat_penalty(self):
        # This term absorbs the old bolted-on "-25 hype penalty" (D-043): a name
        # with euphoric sentiment but weak quant is demoted because its signals
        # DISAGREE, which can be stated honestly, rather than by silently
        # subtracting points.
        hyped = convergence(ql=-0.8, sl=0.9)
        assert hyped == pytest.approx(0.235)
        assert convergence_state(hyped) == "conflict"


class TestConvergenceState:
    @pytest.mark.parametrize(
        "normalised,expected",
        [
            (1.00, "agree_strongly"),
            (0.85, "agree_strongly"),
            (0.84, "lean_together"),
            (0.70, "lean_together"),
            (0.69, "mixed"),
            (0.55, "mixed"),
            (0.54, "conflict"),
            (0.00, "conflict"),
        ],
    )
    def test_bucket_boundaries(self, normalised, expected):
        value = CONV_FLOOR + (1.0 - CONV_FLOOR) * normalised
        assert convergence_state(value) == expected

    def test_every_state_is_one_of_the_declared_labels(self):
        # The UI and the reasoning trace both switch on this string.
        for a in (-1.0, -0.4, 0.0, 0.4, 1.0):
            for b in (-1.0, -0.4, 0.0, 0.4, 1.0):
                assert convergence_state(convergence(a, b)) in CONVERGENCE_STATES

    def test_perfect_agreement_reads_as_agree_strongly(self):
        assert convergence_state(convergence(0.5, 0.5)) == "agree_strongly"


# ═════════════════════════════════════════════════════════════════════════════
# data_sufficiency
# ═════════════════════════════════════════════════════════════════════════════

class TestDataSufficiency:
    @pytest.mark.parametrize("empty", [(0, 0, 0), (None, None, None)])
    def test_no_evidence_lands_on_the_floor(self, empty):
        assert data_sufficiency(*empty) == pytest.approx(DS_FLOOR)

    def test_full_coverage_reaches_one(self):
        assert data_sufficiency(10, 25, 120) == pytest.approx(1.0)

    def test_each_part_saturates_so_extra_coverage_buys_nothing(self):
        # INVARIANT: without saturation this term would permanently favour
        # mega-caps, which have more of every kind of coverage than anything else.
        assert data_sufficiency(10_000, 10_000, 10_000) == pytest.approx(1.0)
        assert data_sufficiency(10, 25, 120) == data_sufficiency(50, 250, 1200)

    def test_partial_coverage_is_the_mean_of_the_three_parts(self):
        # news saturated, nothing else: DS_FLOOR + (1 - DS_FLOOR) * (1/3)
        assert data_sufficiency(10, 0, 0) == pytest.approx(0.2 + 0.8 / 3)
        # half news, full social, half quant -> mean 2/3
        assert data_sufficiency(5, 25, 60) == pytest.approx(0.2 + 0.8 * (2 / 3))

    def test_more_evidence_never_lowers_the_term(self):
        previous = 0.0
        for n in range(0, 12):
            current = data_sufficiency(n, n, n)
            assert current >= previous
            previous = current

    def test_stays_within_the_floor_to_one_band(self):
        for args in [(0, 0, 0), (1, 1, 1), (9, 24, 119), (10, 25, 120), (99, 99, 999)]:
            assert DS_FLOOR <= data_sufficiency(*args) <= 1.0

    def test_thin_coverage_demotes_but_does_not_annihilate(self):
        # A strong signal on a thinly covered name should still be rankable.
        assert data_sufficiency(0, 0, 0) > 0.0


# ═════════════════════════════════════════════════════════════════════════════
# profile_fit
# ═════════════════════════════════════════════════════════════════════════════

class TestProfileFit:
    def test_unknown_beta_is_not_a_mismatch(self):
        assert profile_fit(None, "Conservative") == 1.0

    @pytest.mark.parametrize("tolerance", ["Moderate", "Aggressive"])
    def test_only_conservative_profiles_are_demoted(self, tolerance):
        assert profile_fit(3.0, tolerance) == 1.0

    @pytest.mark.parametrize("beta", [0.0, 0.5, 1.0, 1.2])
    def test_conservative_profile_accepts_beta_up_to_the_threshold(self, beta):
        assert profile_fit(beta, "Conservative") == 1.0

    def test_overshoot_demotes_proportionally(self):
        # beta 1.7 overshoots by 0.5 -> PF_FLOOR + (1 - PF_FLOOR) * 0.5
        assert profile_fit(1.7, "Conservative") == pytest.approx(0.65)

    def test_demotion_bottoms_out_at_the_floor(self):
        assert profile_fit(2.2, "Conservative") == pytest.approx(PF_FLOOR)
        assert profile_fit(50.0, "Conservative") == pytest.approx(PF_FLOOR)

    def test_negative_beta_is_inverse_exposure_not_excess_risk(self):
        # REGRESSION GUARD: observed live, DUK at beta -0.29. Comparing on the
        # MAGNITUDE would demote an inversely-correlated (i.e. low market risk)
        # asset for a cautious user, which is backwards.
        assert profile_fit(-0.29, "Conservative") == 1.0
        assert profile_fit(-2.0, "Conservative") == 1.0

    def test_profile_fit_only_ever_demotes(self):
        # INVARIANT (D-084): a boost for "good fit" would be advice-flavoured. A
        # demotion for "more volatile than you asked for" is a fact about the
        # user's own stated preference. So the term is capped at 1.0.
        for beta in (-3.0, -0.5, 0.0, 0.9, 1.2, 1.5, 4.0):
            for tolerance in ("Conservative", "Moderate", "Aggressive"):
                assert profile_fit(beta, tolerance) <= 1.0

    def test_caller_must_pass_a_normalised_risk_tolerance(self):
        # REGRESSION GUARD: the raw column held six spellings of three levels, so
        # exact-match comparisons silently skipped most of them and risk
        # personalisation was dead for ~39% of stored profiles. This function
        # matches "Conservative" EXACTLY by design -- normalisation is
        # supabase_client.normalize_risk_tolerance's job. This test pins that
        # contract so the boundary stays visible rather than being rediscovered.
        assert profile_fit(3.0, "Conservative") == pytest.approx(PF_FLOOR)
        for unnormalised in ("conservative", "CONSERVATIVE", " Conservative", "low"):
            assert profile_fit(3.0, unnormalised) == 1.0


# ═════════════════════════════════════════════════════════════════════════════
# rank_terms
# ═════════════════════════════════════════════════════════════════════════════

class TestRankTerms:
    def test_composite_is_exactly_the_product_of_the_four_disclosed_terms(self):
        # INVARIANT and the whole product promise: the four factors shown to the
        # user ARE the sort key. If this drifts, the displayed breakdown stops
        # explaining the order.
        terms = rank_terms("NVDA", quant(80, 70, 60), sentiment(70, news_count=8, mention_count=20), "Moderate")
        expected = (
            terms["signal_strength"]
            * terms["convergence"]
            * terms["data_sufficiency"]
            * terms["profile_fit"]
        )
        assert terms["rank_score"] == pytest.approx(expected)

    def test_every_disclosed_key_is_present(self):
        terms = rank_terms("MSFT", quant(50, 50, 50), sentiment(50, news_count=1), "Moderate")
        for key in (
            "ticker", "ranking_version", "rank_score", "signal_strength",
            "convergence", "convergence_state", "data_sufficiency", "profile_fit",
            "quant_lean", "sent_lean", "combined_lean", "direction",
            "direction_mode", "strength_variants", "quant_state", "has_sentiment",
            "weights",
        ):
            assert key in terms, f"missing disclosed key: {key}"

    def test_version_is_stamped_so_persisted_rows_stay_interpretable(self):
        terms = rank_terms("AAPL", None, None, "Moderate")
        assert terms["ranking_version"] == RANKING_VERSION

    def test_combined_lean_applies_the_configured_weights(self):
        terms = rank_terms("AAPL", quant(100, 100, 100), sentiment(0, news_count=1), "Moderate")
        assert terms["quant_lean"] == pytest.approx(1.0)
        assert terms["sent_lean"] == pytest.approx(-1.0)
        assert terms["combined_lean"] == pytest.approx(0.5 * 1.0 + 0.5 * -1.0)

    @pytest.mark.parametrize(
        "q,s,expected",
        [
            (quant(100, 100, 100), sentiment(100, news_count=1), "favourable"),
            (quant(0, 0, 0), sentiment(0, news_count=1), "unfavourable"),
            (quant(50, 50, 50), sentiment(50, news_count=1), "neutral"),
        ],
    )
    def test_direction_label(self, q, s, expected):
        assert rank_terms("T", q, s, "Moderate")["direction"] == expected

    def test_an_asset_with_no_inputs_at_all_still_produces_a_row(self):
        # The nightly run must not crash on a candidate that failed every fetch.
        terms = rank_terms("GHOST", None, None, "Moderate")
        assert terms["rank_score"] is not None
        assert terms["quant_state"] == QUANT_UNMEASURED
        assert terms["has_sentiment"] is False
        assert terms["direction"] == "neutral"

    def test_provenance_explains_a_neutral_lean(self):
        # A 0.0 lean from "no universe to rank against" must be tellable apart
        # from a 0.0 lean from "measured, mid-pack".
        unrankable = rank_terms("T", quant(state=QUANT_SMALL_UNIVERSE), None, "Moderate")
        midpack = rank_terms("T", quant(50, 50, 50), None, "Moderate")
        assert unrankable["quant_lean"] == midpack["quant_lean"] == 0.0
        assert unrankable["quant_state"] == QUANT_SMALL_UNIVERSE
        assert midpack["quant_state"] == QUANT_RANKED

    def test_beta_for_profile_fit_is_read_from_the_quant_row(self):
        risky = quant(50, 50, 50, beta=2.5)
        assert rank_terms("T", risky, None, "Conservative")["profile_fit"] < 1.0
        assert rank_terms("T", risky, None, "Aggressive")["profile_fit"] == 1.0

    def test_counts_for_data_sufficiency_are_read_from_the_right_fields(self):
        thin = rank_terms("T", quant(50, 50, 50, data_points=0), sentiment(50), "Moderate")
        thick = rank_terms(
            "T", quant(50, 50, 50, data_points=250),
            sentiment(50, news_count=40, mention_count=90), "Moderate",
        )
        assert thin["data_sufficiency"] == pytest.approx(DS_FLOOR)
        assert thick["data_sufficiency"] == pytest.approx(1.0)

    def test_filter_mode_yields_a_null_score_for_unfavourable_assets(self, monkeypatch):
        monkeypatch.setattr(ranking, "DIRECTION_MODE", "filter")
        terms = rank_terms("T", quant(0, 0, 0), sentiment(0, news_count=1), "Moderate")
        assert terms["signal_strength"] is None
        assert terms["rank_score"] is None


# ═════════════════════════════════════════════════════════════════════════════
# apply_stability
# ═════════════════════════════════════════════════════════════════════════════

class TestApplyStability:
    def test_disabled_by_a_zero_epsilon(self):
        # Rollback is meant to be an env change, not a deploy.
        ranked = [row("A", 0.50), row("B", 0.49)]
        assert apply_stability(ranked, {"B": 1, "A": 2}, epsilon=0.0) == ranked

    def test_no_history_leaves_the_order_untouched(self):
        ranked = [row("A", 0.50), row("B", 0.49)]
        assert apply_stability(ranked, None, epsilon=0.02) == ranked
        assert apply_stability(ranked, {}, epsilon=0.02) == ranked

    @pytest.mark.parametrize("ranked", [[], [row("A", 0.5)]])
    def test_trivial_inputs_pass_through(self, ranked):
        assert apply_stability(ranked, {"A": 1}, epsilon=0.02) == ranked

    def test_tied_incumbents_keep_last_nights_order(self):
        # A->B and B->C gaps are both inside the noise band, so all three are
        # effectively tied and yesterday's order wins.
        ranked = [row("A", 0.50), row("B", 0.49), row("C", 0.48)]
        out = apply_stability(ranked, {"C": 1, "A": 2, "B": 3}, epsilon=0.02)
        assert [r["ticker"] for r in out] == ["C", "A", "B"]

    def test_newcomers_sort_after_incumbents_within_a_tie_group(self):
        # The discovery pool admits up to 5 new names a night; they must not
        # leapfrog an incumbent on a difference that is only noise.
        ranked = [row("NEW", 0.500), row("OLD", 0.495)]
        out = apply_stability(ranked, {"OLD": 1}, epsilon=0.02)
        assert [r["ticker"] for r in out] == ["OLD", "NEW"]

    def test_newcomers_are_ordered_among_themselves_by_tonights_score(self):
        ranked = [row("N1", 0.500), row("N2", 0.495), row("OLD", 0.490)]
        out = apply_stability(ranked, {"OLD": 1}, epsilon=0.02)
        assert [r["ticker"] for r in out] == ["OLD", "N1", "N2"]

    def test_a_real_improvement_still_moves_freely(self):
        # INVARIANT: this only reorders WITHIN the noise band. An asset that
        # improved by more than epsilon must overtake, or incumbents would be
        # frozen in place and the feed would stop responding to the market.
        ranked = [row("RISER", 0.60), row("INCUMBENT", 0.40)]
        out = apply_stability(ranked, {"INCUMBENT": 1, "RISER": 2}, epsilon=0.02)
        assert [r["ticker"] for r in out] == ["RISER", "INCUMBENT"]

    def test_a_gap_of_exactly_epsilon_is_not_a_tie(self):
        # Grouping is a strict "gap < epsilon". Values chosen to be exact in
        # binary so the boundary is tested, not float noise.
        ranked = [row("A", 0.75), row("B", 0.50)]
        out = apply_stability(ranked, {"B": 1, "A": 2}, epsilon=0.25)
        assert [r["ticker"] for r in out] == ["A", "B"]

    def test_a_gap_just_inside_epsilon_is_a_tie(self):
        ranked = [row("A", 0.75), row("B", 0.60)]
        out = apply_stability(ranked, {"B": 1, "A": 2}, epsilon=0.25)
        assert [r["ticker"] for r in out] == ["B", "A"]

    def test_separate_tie_groups_do_not_merge(self):
        ranked = [row("A", 0.90), row("B", 0.89), row("C", 0.50), row("D", 0.49)]
        out = apply_stability(ranked, {"B": 1, "A": 2, "D": 3, "C": 4}, epsilon=0.02)
        assert [r["ticker"] for r in out] == ["B", "A", "D", "C"]

    def test_the_stability_pass_never_adds_drops_or_duplicates_a_candidate(self):
        # INVARIANT: this is a reordering, full stop. Losing a candidate here
        # would silently shrink the feed.
        ranked = [row(t, s) for t, s in
                  [("A", 0.80), ("B", 0.79), ("C", 0.78), ("D", 0.50), ("E", 0.20)]]
        out = apply_stability(ranked, {"C": 1, "A": 2, "E": 3}, epsilon=0.02)
        assert sorted(r["ticker"] for r in out) == ["A", "B", "C", "D", "E"]
        assert len(out) == len(ranked)

    def test_input_list_is_not_mutated(self):
        ranked = [row("A", 0.50), row("B", 0.49)]
        before = [r["ticker"] for r in ranked]
        apply_stability(ranked, {"B": 1, "A": 2}, epsilon=0.02)
        assert [r["ticker"] for r in ranked] == before

    def test_null_scores_are_tolerated(self):
        ranked = [row("A", 0.50), row("B", None)]
        out = apply_stability(ranked, {"A": 1, "B": 2}, epsilon=0.02)
        assert sorted(r["ticker"] for r in out) == ["A", "B"]


# ═════════════════════════════════════════════════════════════════════════════
# rank_assets
# ═════════════════════════════════════════════════════════════════════════════

class TestRankAssets:
    def test_returns_best_first(self):
        out = rank_assets(
            ["LOW", "HIGH", "MID"],
            {
                "HIGH": quant(90, 90, 90),
                "MID": quant(50, 50, 50),
                "LOW": quant(10, 10, 10),
            },
            {
                "HIGH": sentiment(90, news_count=10),
                "MID": sentiment(50, news_count=10),
                "LOW": sentiment(10, news_count=10),
            },
            "Moderate",
        )
        assert [r["ticker"] for r in out] == ["HIGH", "MID", "LOW"]
        scores = [r["rank_score"] for r in out]
        assert scores == sorted(scores, reverse=True)

    def test_ties_break_on_ticker_so_the_order_is_reproducible(self):
        identical_q = quant(60, 60, 60)
        identical_s = sentiment(60, news_count=5, mention_count=5)
        out = rank_assets(
            ["ZZZ", "AAA", "MMM"],
            {t: identical_q for t in ("ZZZ", "AAA", "MMM")},
            {t: identical_s for t in ("ZZZ", "AAA", "MMM")},
            "Moderate",
        )
        assert [r["ticker"] for r in out] == ["AAA", "MMM", "ZZZ"]

    def test_a_ticker_with_no_data_is_still_ranked_not_dropped(self):
        out = rank_assets(["GHOST"], {}, {}, "Moderate")
        assert [r["ticker"] for r in out] == ["GHOST"]
        assert out[0]["quant_state"] == QUANT_UNMEASURED

    def test_filter_mode_omits_unfavourable_assets_entirely(self, monkeypatch):
        monkeypatch.setattr(ranking, "DIRECTION_MODE", "filter")
        out = rank_assets(
            ["GOOD", "BAD"],
            {"GOOD": quant(90, 90, 90), "BAD": quant(5, 5, 5)},
            {"GOOD": sentiment(90, news_count=5), "BAD": sentiment(5, news_count=5)},
            "Moderate",
        )
        assert [r["ticker"] for r in out] == ["GOOD"]

    def test_empty_universe_returns_empty(self):
        assert rank_assets([], {}, {}, "Moderate") == []

    def test_conservative_profile_demotes_a_high_beta_name(self):
        # End-to-end personalisation check: same market inputs, different stated
        # risk tolerance, different order.
        quants = {"CALM": quant(70, 70, 70, beta=0.6), "WILD": quant(70, 70, 70, beta=2.5)}
        sents = {"CALM": sentiment(70, news_count=5), "WILD": sentiment(70, news_count=5)}

        conservative = rank_assets(["CALM", "WILD"], quants, sents, "Conservative")
        aggressive = rank_assets(["CALM", "WILD"], quants, sents, "Aggressive")

        # Conservative: identical market signals, but WILD is demoted purely for
        # overshooting the user's own stated tolerance.
        assert [r["ticker"] for r in conservative] == ["CALM", "WILD"]
        by_ticker = {r["ticker"]: r for r in conservative}
        assert by_ticker["WILD"]["rank_score"] < by_ticker["CALM"]["rank_score"]
        assert by_ticker["CALM"]["profile_fit"] == 1.0

        # Aggressive: no beta constraint, so the two score identically and only
        # the deterministic ticker tie-break separates them.
        assert [r["ticker"] for r in aggressive] == ["CALM", "WILD"]
        assert aggressive[0]["rank_score"] == pytest.approx(aggressive[1]["rank_score"])
