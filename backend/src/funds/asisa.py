"""The ASISA fund classification, and the bracket policy layered over it.

Two things live here, and the split matters:

*Their* vocabulary — the classification South African fund managers already print
on every fact sheet. Three tiers: where a fund invests, what it holds, and its
focus within that. We do not invent categories, we read them.

*Our* policy — which of those categories each risk bracket surfaces. This is the
only place a judgement of ours enters the matching, and it is deliberately thin:
a bracket is a set of published categories, and the fund's own published risk
label still has to clear the ceiling on top of that. Both halves are in one file
so a single test can assert that every category our policy names actually exists
in the classification. A typo in a bracket would otherwise silently show a user
nothing.

The classification is a class rather than loose constants because its version is
real state: the standard was revised effective 1 October 2025, and a stored
category means nothing without the revision it belongs to. Handing a different
instance to the matcher is how a future revision gets tested before it ships.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AsisaCategory:
    """One classification entry, as printed on a fact sheet.

    ``code`` is ours — a stable slug so rules and tests do not depend on
    punctuation in a display name. ``name`` is theirs, verbatim, because it is
    what the fund's own document says and what the interface quotes back.
    """

    code: str
    tier1: str
    tier2: str
    tier3: str
    name: str


class AsisaClassification:
    """A versioned subset of the ASISA classification standard.

    Subset, not the whole standard: these are the categories the catalogue
    covers. An unknown category is a signal that a fund was transcribed into a
    class the bracket policy has no opinion about, which is a curation decision,
    not a lookup failure — so ``by_name`` returns None rather than guessing.

    Kept in step with the seeded rows in ``migrations/024_funds.sql`` by
    ``test_funds_asisa``, which reads the migration and compares. Reconcile
    against the published standard before the copy review.
    """

    def __init__(self, version: str, categories: tuple[AsisaCategory, ...]):
        self.version = version
        self.categories = categories
        self._by_code = {c.code: c for c in categories}
        self._by_name = {c.name: c for c in categories}

    def by_code(self, code: str) -> AsisaCategory | None:
        return self._by_code.get(code)

    def by_name(self, name: str) -> AsisaCategory | None:
        return self._by_name.get(name)

    def code_for(self, name: str) -> str | None:
        """The slug for a display name, or None if the name is not covered."""
        found = self._by_name.get(name)
        return found.code if found else None

    def is_known(self, name: str) -> bool:
        return name in self._by_name

    def names(self) -> tuple[str, ...]:
        return tuple(c.name for c in self.categories)

    def codes(self) -> frozenset[str]:
        return frozenset(self._by_code)

    def tree(self) -> dict[str, dict[str, list[str]]]:
        """Geography → asset class → focus, for the browse-by-category view.

        Built from ``categories`` rather than written out separately, so the
        page can never offer a filter the catalogue cannot answer.
        """
        grouped: dict[str, dict[str, list[str]]] = {}
        for category in self.categories:
            classes = grouped.setdefault(category.tier1, {})
            focuses = classes.setdefault(category.tier2, [])
            if category.tier3 not in focuses:
                focuses.append(category.tier3)
        return grouped


# ── their vocabulary: the classification, as published ──────────────────────
# Mirrors the seed in migrations/024_funds.sql exactly. Add a category in both
# places or the cross-check test fails, which is the intended tripwire.
ASISA_VERSION = "2025-10-01"

_CATEGORIES: tuple[AsisaCategory, ...] = (
    AsisaCategory("sa_ib_money_market",  "South African", "Interest Bearing", "Money Market",  "South African - Interest Bearing - Money Market"),
    AsisaCategory("sa_ib_short_term",    "South African", "Interest Bearing", "Short Term",    "South African - Interest Bearing - Short Term"),
    AsisaCategory("sa_ib_variable_term", "South African", "Interest Bearing", "Variable Term", "South African - Interest Bearing - Variable Term"),
    AsisaCategory("sa_ma_income",        "South African", "Multi Asset",      "Income",        "South African - Multi Asset - Income"),
    AsisaCategory("sa_ma_low_equity",    "South African", "Multi Asset",      "Low Equity",    "South African - Multi Asset - Low Equity"),
    AsisaCategory("sa_ma_medium_equity", "South African", "Multi Asset",      "Medium Equity", "South African - Multi Asset - Medium Equity"),
    AsisaCategory("sa_ma_high_equity",   "South African", "Multi Asset",      "High Equity",   "South African - Multi Asset - High Equity"),
    AsisaCategory("sa_ma_flexible",      "South African", "Multi Asset",      "Flexible",      "South African - Multi Asset - Flexible"),
    AsisaCategory("sa_eq_general",       "South African", "Equity",           "SA General",    "South African - Equity - SA General"),
    AsisaCategory("sa_re_general",       "South African", "Real Estate",      "General",       "South African - Real Estate - General"),
    AsisaCategory("gl_eq_general",       "Global",        "Equity",           "General",       "Global - Equity - General"),
    AsisaCategory("gl_ma_high_equity",   "Global",        "Multi Asset",      "High Equity",   "Global - Multi Asset - High Equity"),
    AsisaCategory("gl_re_general",       "Global",        "Real Estate",      "General",       "Global - Real Estate - General"),
    AsisaCategory("ww_ma_flexible",      "Worldwide",     "Multi Asset",      "Flexible",      "Worldwide - Multi Asset - Flexible"),
)

ASISA = AsisaClassification(ASISA_VERSION, _CATEGORIES)


# ── our policy: which categories each bracket surfaces ─────────────────────
# The starting map. It is a proposal validated against the seed funds' own
# sheets, not a finding: each seeded fund must land in the bracket its own
# document implies, and where it does not, the map is wrong and moves.
#
# Note what is NOT here: nothing computes an allocation, nothing scores a fund,
# and nothing orders one fund above another. A bracket only decides which
# published categories a user is shown, and the fund's own risk label still has
# to clear their ceiling.
BRACKET_CATEGORIES: dict[str, frozenset[str]] = {
    "Conservative": frozenset({
        "sa_ib_money_market",
        "sa_ib_short_term",
        "sa_ma_income",
        "sa_ma_low_equity",
    }),
    "Moderate": frozenset({
        "sa_ma_medium_equity",
        "sa_ma_high_equity",
        "sa_ib_variable_term",
        # Broad-market equity reaches a moderate bracket only as an index
        # tracker (see TRACKER_ONLY): "tracks the market" is a published
        # objective, while a stock-picking equity fund in the same category is a
        # different proposition at the same risk label.
        "sa_eq_general",
        "gl_eq_general",
    }),
    "Aggressive": frozenset({
        "sa_eq_general",
        "gl_eq_general",
        "sa_re_general",
        "gl_re_general",
        "ww_ma_flexible",
        "gl_ma_high_equity",
        "sa_ma_high_equity",
    }),
}

# Categories a bracket may see ONLY where the fund's stated objective is to track
# an index. Keyed by bracket so the restriction is visible rather than buried in
# a condition.
TRACKER_ONLY: dict[str, frozenset[str]] = {
    "Conservative": frozenset(),
    "Moderate": frozenset({"sa_eq_general", "gl_eq_general"}),
    "Aggressive": frozenset(),
}

# Purpose overrides. Money that has to be available is a liquidity question
# before it is a risk question, which is why an emergency fund collapses to
# these two categories whatever the answers elsewhere.
LIQUIDITY = frozenset({"sa_ib_money_market", "sa_ib_short_term"})

# Categories whose funds distribute income rather than accumulate it. The fund's
# own distribution frequency is shown next to the match, because "income" means
# a payment schedule to a reader and a category to a classification.
INCOME_DISTRIBUTING = frozenset({
    "sa_ma_income",
    "sa_ib_short_term",
    "sa_ib_variable_term",
    "sa_re_general",
})

# Ordered least to most risk-tolerant. "Most conservative signal wins" is a min()
# over this sequence, so the order here IS the precedence rule.
BRACKET_ORDER: tuple[str, ...] = ("Conservative", "Moderate", "Aggressive")

# A horizon caps the bracket but never raises it: someone who needs the money in
# eighteen months is not shown a five-year proposition however much risk they say
# they can take. Bands come from the onboarding answer.
HORIZON_CAP: dict[str, str] = {
    "under_2": "Conservative",
    "2_to_5": "Moderate",
    "5_plus": "Aggressive",
}
