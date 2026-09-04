"""The fund houses' risk-profile indicator, normalised to 1-5.

Every Minimum Disclosure Document carries a risk profile indicator, and no two
managers word it the same way: one prints a five-step scale from Low to High,
another says simply "Medium", a third omits it. The ceiling rule needs one
number to compare, the interface quotes the manager's own words, so both are
kept and this module is the only place that maps between them.

Unknown is None, not a guess. That is the whole point: a fund whose manager does
not publish a risk profile cannot be filtered by one, so it never appears in a
match and stays browsable instead. Inferring a level here would be exactly the
judgement the product is not licensed to make — and it would be invisible,
because a guessed 3 looks identical to a published 3.

Left as constants and pure functions, following ``normalize_risk_tolerance`` in
``supabase_client``: this is a lookup over a dict, and a class around it would
add a name without adding a seam.
"""

from __future__ import annotations

from typing import Any

# The five published steps, in order. The words are the ones fund houses print.
RISK_SCALE: dict[int, str] = {
    1: "Low",
    2: "Low to Moderate",
    3: "Moderate",
    4: "Moderate to High",
    5: "High",
}

# The highest published risk level each profile is shown. A user is never shown
# a fund its own manager rates above their bracket, which is the entire
# mechanism: two published labels, neither computed here.
#
# Aggressive is 5 rather than 4 deliberately — it means "no ceiling" rather than
# "the top step", so a manager who adds a sixth step one day does not silently
# start being filtered out.
CEILINGS: dict[str, int] = {
    "Conservative": 2,
    "Moderate": 3,
    "Aggressive": 5,
}

DEFAULT_CEILING = CEILINGS["Moderate"]

# Casefolded wordings seen on real fact sheets and platform pages, mapped to the
# scale. Both dash styles and the spelled-out "to" appear in practice, and the
# separator is collapsed before lookup so only the words need listing here.
_RISK_ALIASES: dict[str, int] = {
    "low": 1,
    "very low": 1,
    "low to moderate": 2,
    "low to medium": 2,
    "moderately low": 2,
    "moderate": 3,
    "medium": 3,
    "moderate to high": 4,
    "medium to high": 4,
    "moderately high": 4,
    "high": 5,
    "very high": 5,
    "aggressive": 5,
}

# Wordings that explicitly mean "not published". Distinguished from an
# unrecognised string so a genuinely absent indicator is not mistaken for a
# transcription error the validators should flag.
_ABSENT = frozenset({"", "-", "--", "n/a", "na", "none", "not applicable", "not published", "unknown"})


def _collapse(value: str) -> str:
    """Reduce a printed risk label to comparable words.

    Hyphens, en dashes and slashes all appear as the separator; "Low - Moderate",
    "Low–Moderate" and "Low to Moderate" are the same label.
    """
    text = value.strip().casefold()
    for separator in ("–", "—", "-", "/"):
        text = text.replace(separator, " to ")
    return " ".join(text.split())


def normalize(value: Any) -> int | None:
    """Map a printed risk label to 1-5, or None when it is not usable.

    None covers three cases that all behave the same downstream — absent,
    unrecognised, and not a string at all — because in every one of them we do
    not know the manager's rating and must not pretend to.
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # A stored level round-trips; a fraction does not. 2.5 is not a step any
        # fact sheet prints, and truncating it to 2 would be a guess dressed as
        # a published rating.
        if float(value).is_integer():
            level = int(value)
            return level if level in RISK_SCALE else None
        return None
    if not isinstance(value, str):
        return None
    collapsed = _collapse(value)
    if collapsed in _ABSENT:
        return None
    return _RISK_ALIASES.get(collapsed)


def label_for(level: int | None) -> str | None:
    """The scale's own word for a level, for interfaces that have no raw label."""
    if level is None:
        return None
    return RISK_SCALE.get(level)


def ceiling_for(risk_tolerance: str) -> int:
    """The highest published risk level this profile is shown.

    Expects an already-normalised label (``normalize_risk_tolerance`` in
    ``supabase_client`` is what produces one). An unrecognised label falls back
    to the moderate ceiling rather than the permissive one: guessing wrong
    downward shows a user fewer funds, guessing wrong upward shows them funds
    their own answers said to exclude.
    """
    return CEILINGS.get(risk_tolerance, DEFAULT_CEILING)


def within_ceiling(level: int | None, risk_tolerance: str) -> bool:
    """Whether a fund's published risk level clears this profile's ceiling.

    An unpublished level (None) never clears. Stated once here so every caller
    fails the same way.
    """
    if level is None:
        return False
    return level <= ceiling_for(risk_tolerance)
