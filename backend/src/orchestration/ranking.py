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

## Structure

Each of the four terms is a `RankingFactor` — one class, one question, one
`score()`. The three *qualifiers* share a shape the driver does not, so they share
a base class:

    RankingFactor (ABC)          what the ranker multiplies together
    ├── SignalStrength           the DRIVER: unbounded below, may veto an asset
    │                            entirely (`filter` mode returns None)
    └── FlooredFactor (ABC)      the QUALIFIERS: demote-only, never below a floor
        ├── Convergence          do the two signals agree?
        ├── DataSufficiency      is there enough evidence?
        └── ProfileFit           does exposure match what the user asked for?

The split is not decoration: a qualifier can only ever *reduce* a candidate's
placement and is bounded below so it cannot annihilate one, while the driver both
sets the scale and decides membership. `FlooredFactor` owns that shared
`floor + (1 - floor) × raw` lift so the three qualifiers each state only the one
thing that differs — how they read the signals.

Adding a fifth term is therefore a new subclass and one entry in
`AssetRanker.factors`; nothing already here changes.

`AssetRanker` is the facade over the whole thing, and every collaborator is
injectable with the production default — `AssetRanker()` is what the pipeline
runs, `AssetRanker(profile_fit=...)` is what a test runs.

The module-level functions below are kept as thin delegations to a shared default
ranker. They are the published surface of this module — the orchestrator and the
unit suite both call them by name — so they keep working unchanged.

Configuration is resolved at CALL time, not construction time: an explicitly
injected value wins, otherwise the module constant is read when the factor runs.
That keeps `monkeypatch.setattr(ranking, "DIRECTION_MODE", ...)` and a late
environment change behaving exactly as they did when these were free functions.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
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

# ── feed stability (plan §13 R9) ─────────────────────────────────────────────
# Candidates whose rank_score differs by less than this are treated as effectively
# tied, and ties keep last night's order. Default 0.02 sits just above the measured
# mean nightly drift (~0.015) and just above the median adjacent gap (~0.017), so it
# absorbs noise without masking real movement. Set to 0 to disable entirely.
TIE_EPSILON = float(os.getenv("RANK_TIE_EPSILON", "0.02"))

# Quant states (mirrors quant_analyst.score_universe + the legacy-null case).
QUANT_RANKED = "cross_sectional"
QUANT_SMALL_UNIVERSE = "insufficient_universe"
QUANT_NO_DATA = "no_data"
QUANT_UNMEASURED = "unmeasured"  # legacy row / field absent — never measured

CONVERGENCE_STATES = ("conflict", "mixed", "lean_together", "agree_strongly")


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


# ═════════════════════════════════════════════════════════════════════════════
# The resolved inputs, read once per asset
# ═════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class AssetSignals:
    """Everything the four factors read, resolved once per asset.

    Frozen because the factors must not be able to influence each other: each one
    answers its own question from the same fixed reading, which is what lets the
    disclosed breakdown be trusted as an explanation of the order.
    """

    ticker: str
    quant: Optional[dict]
    sentiment: Optional[dict]
    risk_tolerance: str
    quant_lean: float
    quant_state: str
    sent_lean: float
    has_sentiment: bool
    combined: float

    @property
    def direction(self) -> str:
        if self.combined > 0:
            return "favourable"
        if self.combined < 0:
            return "unfavourable"
        return "neutral"

    @property
    def news_count(self) -> Optional[int]:
        return (self.sentiment or {}).get("news_count")

    @property
    def social_count(self) -> Optional[int]:
        return (self.sentiment or {}).get("mention_count")

    @property
    def data_points(self) -> Optional[int]:
        return (self.quant or {}).get("data_points")

    @property
    def beta(self) -> Optional[float]:
        return (self.quant or {}).get("beta")


class SignalReader:
    """Turns the raw quant and sentiment payloads into directional leans.

    Separate from the factors on purpose: this is the only place that knows the
    *shape* of the upstream payloads, so a change to what the quant analyst or the
    sentiment scout emits lands here and nowhere else.
    """

    def __init__(self, w_quant: Optional[float] = None, w_sent: Optional[float] = None):
        self._w_quant = w_quant
        self._w_sent = w_sent

    @property
    def w_quant(self) -> float:
        return W_QUANT if self._w_quant is None else self._w_quant

    @property
    def w_sent(self) -> float:
        return W_SENT if self._w_sent is None else self._w_sent

    def quant_lean(self, quant: Optional[dict]) -> tuple[float, str]:
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

    def sentiment_lean(self, sentiment: Optional[dict]) -> tuple[float, bool]:
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

    def read(
        self,
        ticker: str,
        quant: Optional[dict],
        sentiment: Optional[dict],
        risk_tolerance: str,
    ) -> AssetSignals:
        ql, q_state = self.quant_lean(quant)
        sl, has_sent = self.sentiment_lean(sentiment)
        return AssetSignals(
            ticker=ticker,
            quant=quant,
            sentiment=sentiment,
            risk_tolerance=risk_tolerance,
            quant_lean=ql,
            quant_state=q_state,
            sent_lean=sl,
            has_sentiment=has_sent,
            combined=self.w_quant * ql + self.w_sent * sl,
        )


# ═════════════════════════════════════════════════════════════════════════════
# The four terms
# ═════════════════════════════════════════════════════════════════════════════

class RankingFactor(ABC):
    """One disclosed term in the ranking product.

    Every factor answers a single question about an asset and returns a number the
    ranker multiplies in. The question is the class name; the answer is ``score``.
    """

    name: str = "factor"

    @abstractmethod
    def score(self, signals: AssetSignals) -> Optional[float]:
        """Return this term's value, or ``None`` to drop the asset from the feed."""


class FlooredFactor(RankingFactor, ABC):
    """A qualifier: it can only ever DEMOTE, and never below its floor.

    The floor is what stops a single thin dimension from annihilating an otherwise
    strong candidate — a demotion is a statement that we are less sure, not that
    the asset is bad. Subclasses supply only ``raw`` (the reading in ``[0, 1]``,
    where 1 means "no reason to demote") and the floor they fall back to.
    """

    def __init__(self, floor: Optional[float] = None):
        self._floor = floor

    @property
    def floor(self) -> float:
        return self.default_floor() if self._floor is None else self._floor

    @abstractmethod
    def default_floor(self) -> float:
        """The module constant this qualifier falls back to, read at call time."""

    @abstractmethod
    def raw(self, signals: AssetSignals) -> float:
        """The unfloored reading in ``[0, 1]``; 1 means "nothing to demote for"."""

    def score(self, signals: AssetSignals) -> float:
        floor = self.floor
        return floor + (1.0 - floor) * _clamp(self.raw(signals))


class SignalStrength(RankingFactor):
    """How strongly the objective signals lean, under the configured direction
    treatment.

    The driver term: it sets the scale of the composite, and in ``filter`` mode it
    is also the only factor that can remove an asset from the feed entirely.
    """

    name = "signal_strength"

    def __init__(self, mode: Optional[str] = None):
        self._mode = mode

    @property
    def mode(self) -> str:
        return (self._mode or DIRECTION_MODE).strip().lower()

    def variants(self, combined: float) -> dict[str, float]:
        """Every candidate direction treatment for one combined lean.

        Returned on every ranked asset so the shadow report can settle plan §13 R1
        from persisted data instead of re-running the pipeline.
        """
        return {
            "shift": _clamp((combined + 1.0) / 2.0),
            "clip": _clamp(max(0.0, combined)),
            "abs": _clamp(abs(combined)),
        }

    def of(self, combined: float, mode: Optional[str] = None) -> Optional[float]:
        """Strength for a bare combined lean, without a full ``AssetSignals``."""
        resolved = (mode or self._mode or DIRECTION_MODE).strip().lower()
        variants = self.variants(combined)
        if resolved == "filter":
            return None if combined < 0 else variants["shift"]
        if resolved in variants:
            return variants[resolved]
        return variants["shift"]  # unknown value → documented default, never crash

    def score(self, signals: AssetSignals) -> Optional[float]:
        return self.of(signals.combined)


class Convergence(FlooredFactor):
    """Do the two independent signals AGREE? 1.0 = identical lean.

    This absorbs the old bolted-on ``−25`` hype penalty: a name with euphoric
    sentiment and weak quant is demoted because its signals *conflict*, which can
    be stated honestly ("signals conflict — look closer") instead of silently
    subtracting points. It also finally matches D-043, which defined the score as
    quant/sentiment convergence in the first place.
    """

    name = "convergence"

    def default_floor(self) -> float:
        return CONV_FLOOR

    def raw(self, signals: AssetSignals) -> float:
        return self.agreement(signals.quant_lean, signals.sent_lean)

    @staticmethod
    def agreement(ql: float, sl: float) -> float:
        return 1.0 - abs(ql - sl) / 2.0

    def of(self, ql: float, sl: float) -> float:
        """Convergence for a bare pair of leans."""
        floor = self.floor
        return floor + (1.0 - floor) * _clamp(self.agreement(ql, sl))

    def state(self, value: float) -> str:
        """Bucket a convergence value into the label shown to the user."""
        floor = self.floor
        span = 1.0 - floor
        normalised = 0.0 if span <= 0 else (value - floor) / span
        if normalised >= 0.85:
            return "agree_strongly"
        if normalised >= 0.70:
            return "lean_together"
        if normalised >= 0.55:
            return "mixed"
        return "conflict"


class DataSufficiency(FlooredFactor):
    """Is there enough evidence to trust the read? Thin coverage demotes, but the
    floor stops it from annihilating an otherwise strong candidate.

    Each part saturates: past "enough", more coverage adds nothing, otherwise the
    term would permanently favour mega-caps over everything else.
    """

    name = "data_sufficiency"

    def __init__(
        self,
        floor: Optional[float] = None,
        news_full: Optional[int] = None,
        social_full: Optional[int] = None,
        quant_full: Optional[int] = None,
    ):
        super().__init__(floor)
        self._news_full = news_full
        self._social_full = social_full
        self._quant_full = quant_full

    def default_floor(self) -> float:
        return DS_FLOOR

    @property
    def news_full(self) -> int:
        return DS_NEWS_FULL if self._news_full is None else self._news_full

    @property
    def social_full(self) -> int:
        return DS_SOCIAL_FULL if self._social_full is None else self._social_full

    @property
    def quant_full(self) -> int:
        return DS_QUANT_FULL if self._quant_full is None else self._quant_full

    @staticmethod
    def _saturate(count: Optional[int], full: int) -> float:
        # A saturation point of 0 means "this dimension is not required", which is
        # full marks rather than a division by zero.
        return _clamp((count or 0) / full) if full > 0 else 1.0

    def raw(self, signals: AssetSignals) -> float:
        return self.of_counts(signals.news_count, signals.social_count, signals.data_points)

    def of_counts(
        self,
        news_count: Optional[int],
        social_count: Optional[int],
        data_points: Optional[int],
    ) -> float:
        parts = [
            self._saturate(news_count, self.news_full),
            self._saturate(social_count, self.social_full),
            self._saturate(data_points, self.quant_full),
        ]
        return sum(parts) / len(parts)

    def of(
        self,
        news_count: Optional[int],
        social_count: Optional[int],
        data_points: Optional[int],
    ) -> float:
        """Sufficiency for bare counts."""
        floor = self.floor
        return floor + (1.0 - floor) * _clamp(self.of_counts(news_count, social_count, data_points))


class ProfileFit(FlooredFactor):
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

    name = "profile_fit"

    CONSERVATIVE_BETA_CEILING = 1.2

    def default_floor(self) -> float:
        return PF_FLOOR

    def raw(self, signals: AssetSignals) -> float:
        return self.of_beta(signals.beta, signals.risk_tolerance)

    def of_beta(self, beta: Optional[float], risk_tolerance: str) -> float:
        if beta is None:
            return 1.0
        # A negative beta is inverse exposure, i.e. LOW market risk — not a mismatch
        # for a cautious user, so compare on the signed value, not the magnitude.
        if risk_tolerance == "Conservative" and beta > self.CONSERVATIVE_BETA_CEILING:
            overshoot = beta - self.CONSERVATIVE_BETA_CEILING
            return _clamp(1.0 - overshoot)
        return 1.0

    def of(self, beta: Optional[float], risk_tolerance: str) -> float:
        """Fit for a bare beta and risk tolerance."""
        floor = self.floor
        return floor + (1.0 - floor) * _clamp(self.of_beta(beta, risk_tolerance))


# ═════════════════════════════════════════════════════════════════════════════
# Feed stability
# ═════════════════════════════════════════════════════════════════════════════

class StabilityPolicy:
    """Hold near-equal candidates in yesterday's order (plan §13 R9).

    The problem this solves is measured: the four terms drift only ~0.015 a night,
    but ``shift`` compresses rank_score into roughly 0.34–0.77, so the median gap
    between adjacent candidates (~0.017) is smaller than one night's drift for 47%
    of pairs. Ranks therefore flip on noise, which reads as an unstable feed even
    though nothing meaningful changed.

    Deliberately NOT smoothing the scores themselves: the product promises that the
    four displayed factors ARE the sort key, so an EMA over rank_score would make
    the shown breakdown stop explaining the order. This only reorders *within* the
    noise band, so an asset improving by more than epsilon still moves freely — no
    incumbent can be frozen in place.
    """

    def __init__(self, epsilon: Optional[float] = None):
        self._epsilon = epsilon

    @property
    def epsilon(self) -> float:
        return TIE_EPSILON if self._epsilon is None else self._epsilon

    def apply(
        self,
        ranked: list[dict[str, Any]],
        previous_rank: Optional[dict[str, int]] = None,
        epsilon: Optional[float] = None,
    ) -> list[dict[str, Any]]:
        """Reorder within the noise band only.

        ``epsilon = 0`` disables the mechanism and returns the input order, which
        makes rollback an env change rather than a deploy.
        """
        eps = self.epsilon if epsilon is None else epsilon
        if eps <= 0 or len(ranked) < 2:
            return list(ranked)

        previous_rank = previous_rank or {}
        if not previous_rank:
            return list(ranked)

        out: list[dict[str, Any]] = []
        group: list[dict[str, Any]] = []

        # Walk the score-ordered list and group runs of candidates whose
        # *consecutive* gaps are under epsilon — those are "effectively tied".
        for row in ranked:
            if not group:
                group = [row]
                continue
            gap = (group[-1]["rank_score"] or 0.0) - (row["rank_score"] or 0.0)
            if gap < eps:
                group.append(row)          # still inside the noise band
            else:
                self._flush(group, previous_rank, out)
                group = [row]
        self._flush(group, previous_rank, out)
        return out

    @staticmethod
    def _flush(
        group: list[dict[str, Any]],
        previous_rank: dict[str, int],
        out: list[dict[str, Any]],
    ) -> None:
        if len(group) <= 1:
            out.extend(group)
            return
        # Incumbents first, in last night's order; then newcomers by tonight's score.
        # Newcomers exist because the discovery pool admits up to 5 per universe
        # per night.
        incumbents = [r for r in group if r["ticker"] in previous_rank]
        newcomers = [r for r in group if r["ticker"] not in previous_rank]
        incumbents.sort(key=lambda r: (previous_rank[r["ticker"]], r["ticker"]))
        newcomers.sort(key=lambda r: (-(r["rank_score"] or 0.0), r["ticker"]))
        out.extend(incumbents + newcomers)


# ═════════════════════════════════════════════════════════════════════════════
# Composition
# ═════════════════════════════════════════════════════════════════════════════

class AssetRanker:
    """The facade: read the signals, ask each factor its question, multiply.

    Every collaborator defaults to the production implementation, so
    ``AssetRanker()`` is exactly what the nightly run uses and any single piece can
    be replaced without touching the rest.
    """

    def __init__(
        self,
        reader: Optional[SignalReader] = None,
        strength: Optional[SignalStrength] = None,
        convergence: Optional[Convergence] = None,
        sufficiency: Optional[DataSufficiency] = None,
        profile_fit: Optional[ProfileFit] = None,
        stability: Optional[StabilityPolicy] = None,
    ):
        self.reader = reader or SignalReader()
        self.strength = strength or SignalStrength()
        self.convergence = convergence or Convergence()
        self.sufficiency = sufficiency or DataSufficiency()
        self.profile_fit = profile_fit or ProfileFit()
        self.stability = stability or StabilityPolicy()

    @property
    def qualifiers(self) -> tuple[FlooredFactor, ...]:
        """The demote-only terms, in disclosure order."""
        return (self.convergence, self.sufficiency, self.profile_fit)

    @property
    def factors(self) -> tuple[RankingFactor, ...]:
        """Every term that contributes to ``rank_score``, driver first."""
        return (self.strength, *self.qualifiers)

    def terms(
        self,
        ticker: str,
        quant: Optional[dict],
        sentiment: Optional[dict],
        risk_tolerance: str,
    ) -> dict[str, Any]:
        """Full disclosed breakdown for one asset. ``rank_score`` is None when the
        configured direction mode filters the asset out of the feed."""
        signals = self.reader.read(ticker, quant, sentiment, risk_tolerance)

        strength = self.strength.score(signals)
        conv = self.convergence.score(signals)
        suff = self.sufficiency.score(signals)
        fit = self.profile_fit.score(signals)

        composite = None if strength is None else strength * conv * suff * fit

        return {
            "ticker": ticker,
            "ranking_version": RANKING_VERSION,
            # composite — sort key only, never a displayed grade
            "rank_score": composite,
            # the four disclosed terms
            "signal_strength": strength,
            "convergence": conv,
            "convergence_state": self.convergence.state(conv),
            "data_sufficiency": suff,
            "profile_fit": fit,
            # raw leans + direction: what makes §13 R1 settleable from shadow data
            "quant_lean": signals.quant_lean,
            "sent_lean": signals.sent_lean,
            "combined_lean": signals.combined,
            "direction": signals.direction,
            "direction_mode": DIRECTION_MODE,
            "strength_variants": self.strength.variants(signals.combined),
            # provenance of the inputs, so a neutral lean can be explained
            "quant_state": signals.quant_state,
            "has_sentiment": signals.has_sentiment,
            "weights": {"quant": self.reader.w_quant, "sentiment": self.reader.w_sent},
        }

    def rank(
        self,
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
            self.terms(t, quant_results.get(t), sentiment_results.get(t), risk_tolerance)
            for t in tickers
        ]
        keep = [row for row in scored if row["rank_score"] is not None]
        keep.sort(key=lambda row: (-row["rank_score"], row["ticker"]))
        return keep


# ═════════════════════════════════════════════════════════════════════════════
# Published surface — thin delegations to the default ranker
# ═════════════════════════════════════════════════════════════════════════════
# The orchestrator and the unit suite call these by name. They stay so that the
# class layer above is an implementation detail callers can adopt at their own
# pace, not a breaking change.

_DEFAULT = AssetRanker()


def quant_lean(quant: Optional[dict]) -> tuple[float, str]:
    return _DEFAULT.reader.quant_lean(quant)


def sentiment_lean(sentiment: Optional[dict]) -> tuple[float, bool]:
    return _DEFAULT.reader.sentiment_lean(sentiment)


def strength_variants(combined: float) -> dict[str, float]:
    return _DEFAULT.strength.variants(combined)


def signal_strength(combined: float, mode: str = None) -> Optional[float]:
    return _DEFAULT.strength.of(combined, mode)


def convergence(ql: float, sl: float) -> float:
    return _DEFAULT.convergence.of(ql, sl)


def convergence_state(value: float) -> str:
    return _DEFAULT.convergence.state(value)


def data_sufficiency(
    news_count: Optional[int],
    social_count: Optional[int],
    data_points: Optional[int],
) -> float:
    return _DEFAULT.sufficiency.of(news_count, social_count, data_points)


def profile_fit(beta: Optional[float], risk_tolerance: str) -> float:
    return _DEFAULT.profile_fit.of(beta, risk_tolerance)


def rank_terms(
    ticker: str,
    quant: Optional[dict],
    sentiment: Optional[dict],
    risk_tolerance: str,
) -> dict[str, Any]:
    return _DEFAULT.terms(ticker, quant, sentiment, risk_tolerance)


def apply_stability(
    ranked: list[dict[str, Any]],
    previous_rank: Optional[dict[str, int]] = None,
    epsilon: float = None,
) -> list[dict[str, Any]]:
    return _DEFAULT.stability.apply(ranked, previous_rank, epsilon)


def rank_assets(
    tickers: list[str],
    quant_results: dict[str, dict],
    sentiment_results: dict[str, dict],
    risk_tolerance: str,
) -> list[dict[str, Any]]:
    return _DEFAULT.rank(tickers, quant_results, sentiment_results, risk_tolerance)
