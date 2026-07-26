"""Unified ranking v2 — disclosed, multi-term feed ordering (D-087 → D-099+).

Replaces the 0-100 "confidence score" (`quant×0.5 + sentiment×0.5 − 25 hype ± risk`)
with a ranking built from four questions a user can actually be shown:

    rank_score = signal_strength × convergence × data_sufficiency × profile_fit

The composite is a SORT KEY ONLY — never displayed as a grade. See
UNIFIED_SCORING_PLAN.md for the reasoning; this module is the pure implementation:
no I/O, no DB, no LLM, every constant env-tunable, so it can be unit-tested and
replayed offline.

Two design notes that matter for the rollout:

*   **Every term is returned alongside the composite** (`rank_terms`), because the
    product promise is disclosure — the UI and the reasoning trace must be able to
    say *why* an asset placed where it did.
*   **The raw directional leans are returned too** (`quant_lean`, `sent_lean`,
    `combined`). The open question of how to treat DIRECTION (plan §13 R1 — should
    a strongly *bearish* asset rank high?) is deliberately left settleable from
    data: persist these and every candidate strength variant can be recomputed
    post-hoc via `strength_variants()`, so a shadow run answers the question
    without re-running the pipeline.
"""

from __future__ import annotations

import os
from typing import Any, Optional

# Bump when the formula changes, so persisted rows stay interpretable.
RANKING_VERSION = "v2.0"

# ── weights: the old hidden 50/50, now a disclosed editorial choice ───────────
W_QUANT = float(os.getenv("RANK_W_QUANT", "0.5"))
W_SENT = float(os.getenv("RANK_W_SENT", "0.5"))

# ── direction handling (plan §13 R1) ─────────────────────────────────────────
# "shift"  (c+1)/2   — opportunity feed, keeps unfavourable assets ordered  [default]
# "clip"   max(0,c)  — opportunity feed, unfavourable all collapse to 0 (they tie)
# "abs"    |c|       — clarity feed: notability regardless of direction
# "filter" like shift, but unfavourable assets are dropped from the feed entirely
DIRECTION_MODE = os.getenv("RANK_DIRECTION_MODE", "shift").strip().lower()

# ── floors: how much a qualifier can demote, at most ─────────────────────────
# Widened from the first draft after the all-runs replay: with the original
# floors (.4/.5/.6) the qualifiers spanned so little that ordering collapsed onto
# signal_strength alone in 7 of 15 real runs.
CONV_FLOOR = float(os.getenv("RANK_CONV_FLOOR", "0.1"))
DS_FLOOR = float(os.getenv("RANK_DS_FLOOR", "0.2"))
PF_FLOOR = float(os.getenv("RANK_PF_FLOOR", "0.3"))

# ── "enough data" saturation points ──────────────────────────────────────────
DS_NEWS_FULL = int(os.getenv("RANK_DS_NEWS_FULL", "10"))
DS_SOCIAL_FULL = int(os.getenv("RANK_DS_SOCIAL_FULL", "25"))
DS_QUANT_FULL = int(os.getenv("RANK_DS_QUANT_FULL", "120"))

# Quant states (mirrors quant_analyst.score_universe + the legacy-null case).
QUANT_RANKED = "cross_sectional"
QUANT_SMALL_UNIVERSE = "insufficient_universe"
QUANT_NO_DATA = "no_data"
QUANT_UNMEASURED = "unmeasured"  # legacy row / field absent — never measured

CONVERGENCE_STATES = ("conflict", "mixed", "lean_together", "agree_strongly")


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


# ═════════════════════════════════════════════════════════════════════════════
# The two leans (shared inputs, both in [-1, +1])
# ═════════════════════════════════════════════════════════════════════════════

def quant_lean(quant: Optional[dict]) -> tuple[float, str]:
    """Directional quant lean from the Stage-B percentiles, plus the state it came
    from.

    Only ``cross_sectional`` yields a real lean. The other three states return a
    NEUTRAL lean **and** their state, because "we could not measure this" must stay
    distinguishable from "we measured it and it is mid-pack" — collapsing them is
    exactly the opacity this rework removes (plan §3.1 / §13 R6).

    Percentiles are the monotonic sub-dimensions only (momentum, risk-adjusted
    return, stability). RSI and beta are non-monotonic and are never folded in —
    that is what made the old composite a covert verdict.
    """
    if not quant:
        return 0.0, QUANT_UNMEASURED

    state = quant.get("quant_normalisation")
    subs = quant.get("sub_dimensions") or {}
    present = [
        v for v in (subs.get("momentum"), subs.get("risk_adjusted_return"), subs.get("stability"))
        if v is not None
    ]

    if not present:
        # No usable percentiles: report the state that explains why.
        if state in (QUANT_SMALL_UNIVERSE, QUANT_NO_DATA):
            return 0.0, state
        return 0.0, QUANT_UNMEASURED

    mean_pct = sum(present) / len(present) / 100.0  # percentiles are 0-100
    return _clamp(2 * mean_pct - 1, -1.0, 1.0), (state or QUANT_RANKED)


def sentiment_lean(sentiment: Optional[dict]) -> tuple[float, bool]:
    """Directional sentiment lean from the blended D-078 score, and whether any
    sentiment data existed at all.

    A missing score is neutral *and* reported as absent — the old code silently
    defaulted to 50, making "no coverage" look identical to "genuinely mixed".
    """
    if not sentiment:
        return 0.0, False
    score = sentiment.get("sentiment_score")
    if score is None:
        return 0.0, False
    has_data = bool((sentiment.get("news_count") or 0) or (sentiment.get("mention_count") or 0))
    return _clamp((float(score) - 50.0) / 50.0, -1.0, 1.0), has_data


# ═════════════════════════════════════════════════════════════════════════════
# The four terms
# ═════════════════════════════════════════════════════════════════════════════

def strength_variants(combined: float) -> dict[str, float]:
    """Every candidate direction treatment for one combined lean.

    Returned on every ranked asset so the shadow report can settle plan §13 R1
    from persisted data instead of re-running the pipeline.
    """
    return {
        "shift": _clamp((combined + 1.0) / 2.0),
        "clip": _clamp(max(0.0, combined)),
        "abs": _clamp(abs(combined)),
    }


def signal_strength(combined: float, mode: str = None) -> Optional[float]:
    """How strongly the objective signals lean, under the configured direction
    treatment. ``None`` means "drop this asset from the feed" (``filter`` mode)."""
    mode = (mode or DIRECTION_MODE).strip().lower()
    variants = strength_variants(combined)
    if mode == "filter":
        return None if combined < 0 else variants["shift"]
    if mode in variants:
        return variants[mode]
    return variants["shift"]  # unknown value → documented default, never crash


def convergence(ql: float, sl: float) -> float:
    """Do the two independent signals AGREE? 1.0 = identical lean.

    This absorbs the old bolted-on ``−25`` hype penalty: a name with euphoric
    sentiment and weak quant is demoted because its signals *conflict*, which can
    be stated honestly ("signals conflict — look closer") instead of silently
    subtracting points. It also finally matches D-043, which defined the score as
    quant/sentiment convergence in the first place.
    """
    agreement = 1.0 - abs(ql - sl) / 2.0
    return CONV_FLOOR + (1.0 - CONV_FLOOR) * _clamp(agreement)


def convergence_state(value: float) -> str:
    """Bucket a convergence value into the label shown to the user."""
    span = 1.0 - CONV_FLOOR
    normalised = 0.0 if span <= 0 else (value - CONV_FLOOR) / span
    if normalised >= 0.85:
        return "agree_strongly"
    if normalised >= 0.70:
        return "lean_together"
    if normalised >= 0.55:
        return "mixed"
    return "conflict"


def data_sufficiency(
    news_count: Optional[int],
    social_count: Optional[int],
    data_points: Optional[int],
) -> float:
    """Is there enough evidence to trust the read? Thin coverage demotes, but the
    floor stops it from annihilating an otherwise strong candidate.

    Each part saturates: past "enough", more coverage adds nothing, otherwise the
    term would permanently favour mega-caps over everything else.
    """
    parts = [
        _clamp((news_count or 0) / DS_NEWS_FULL) if DS_NEWS_FULL > 0 else 1.0,
        _clamp((social_count or 0) / DS_SOCIAL_FULL) if DS_SOCIAL_FULL > 0 else 1.0,
        _clamp((data_points or 0) / DS_QUANT_FULL) if DS_QUANT_FULL > 0 else 1.0,
    ]
    return DS_FLOOR + (1.0 - DS_FLOOR) * (sum(parts) / len(parts))


def profile_fit(beta: Optional[float], risk_tolerance: str) -> float:
    """Does the asset's market exposure match what the user *told us*?

    Only ever DEMOTES a mismatch — it never promotes. A boost for "strong signals"
    would be advice-flavoured; a demotion for "more volatile than you asked for" is
    a fact about the user's own stated preference (D-084: personalisation, not
    advice).

    Note ``risk_tolerance`` must already be normalised (see
    ``supabase_client.normalize_risk_tolerance``) — the raw column holds six
    spellings of three levels, and exact-match comparisons silently skipped most
    of them.
    """
    if beta is None:
        return 1.0
    # A negative beta is inverse exposure, i.e. LOW market risk — not a mismatch
    # for a cautious user, so compare on the signed value, not the magnitude.
    if risk_tolerance == "Conservative" and beta > 1.2:
        overshoot = beta - 1.2
        return PF_FLOOR + (1.0 - PF_FLOOR) * _clamp(1.0 - overshoot)
    return 1.0


# ═════════════════════════════════════════════════════════════════════════════
# Composition
# ═════════════════════════════════════════════════════════════════════════════

def rank_terms(
    ticker: str,
    quant: Optional[dict],
    sentiment: Optional[dict],
    risk_tolerance: str,
) -> dict[str, Any]:
    """Full disclosed breakdown for one asset. ``rank_score`` is None when the
    configured direction mode filters the asset out of the feed."""
    ql, q_state = quant_lean(quant)
    sl, has_sent = sentiment_lean(sentiment)
    combined = W_QUANT * ql + W_SENT * sl

    strength = signal_strength(combined)
    conv = convergence(ql, sl)
    suff = data_sufficiency(
        (sentiment or {}).get("news_count"),
        (sentiment or {}).get("mention_count"),
        (quant or {}).get("data_points"),
    )
    fit = profile_fit((quant or {}).get("beta"), risk_tolerance)

    return {
        "ticker": ticker,
        "ranking_version": RANKING_VERSION,
        # composite — sort key only, never a displayed grade
        "rank_score": None if strength is None else strength * conv * suff * fit,
        # the four disclosed terms
        "signal_strength": strength,
        "convergence": conv,
        "convergence_state": convergence_state(conv),
        "data_sufficiency": suff,
        "profile_fit": fit,
        # raw leans + direction: what makes §13 R1 settleable from shadow data
        "quant_lean": ql,
        "sent_lean": sl,
        "combined_lean": combined,
        "direction": "favourable" if combined > 0 else "unfavourable" if combined < 0 else "neutral",
        "direction_mode": DIRECTION_MODE,
        "strength_variants": strength_variants(combined),
        # provenance of the inputs, so a neutral lean can be explained
        "quant_state": q_state,
        "has_sentiment": has_sent,
        "weights": {"quant": W_QUANT, "sentiment": W_SENT},
    }


def rank_assets(
    tickers: list[str],
    quant_results: dict[str, dict],
    sentiment_results: dict[str, dict],
    risk_tolerance: str,
) -> list[dict[str, Any]]:
    """Rank a candidate set, best first.

    Ties break on ticker so the order is reproducible run-to-run (the same
    determinism rule as the discovery pool read). Assets filtered out by the
    direction mode are omitted entirely.
    """
    scored = [
        rank_terms(t, quant_results.get(t), sentiment_results.get(t), risk_tolerance)
        for t in tickers
    ]
    keep = [row for row in scored if row["rank_score"] is not None]
    keep.sort(key=lambda row: (-row["rank_score"], row["ticker"]))
    return keep
