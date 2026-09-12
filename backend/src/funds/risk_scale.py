"""The fund houses' risk-profile indicator, normalised to 1-5.

One exception to "normalised" is worth reading before the rest: a seven-step
scale is CONVERTED here, and that is arithmetic rather than a lookup. See
`_SEVEN_STEP_TO_FIVE`.

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

import re
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
    # Satrix labels its five steps by investor temperament rather than by the
    # amount of risk: CONSERVATIVE / CAUTIOUS / MODERATE / MODERATE-AGGRESSIVE /
    # AGGRESSIVE. Note that "conservative" here is the LOWEST step, the opposite
    # end from what the same word means as a user's own risk tolerance. Missing
    # these read four Satrix funds as publishing no indicator at all when they
    # publish one plainly.
    "conservative": 1,
    "cautious": 2,
    "moderate to aggressive": 4,
    "moderately aggressive": 4,
    "low": 1,
    "very low": 1,
    "low to moderate": 2,
    "low to medium": 2,
    "low to mod": 2,       # abbreviated scale, seen on FundRock sheets
    "moderately low": 2,
    "moderate": 3,
    "medium": 3,
    "mod": 3,
    "moderate to high": 4,
    "medium to high": 4,
    "mod to high": 4,
    "moderately high": 4,
    "high": 5,
    "very high": 5,
    "aggressive": 5,
}

# ── a seven-step scale, converted ───────────────────────────────────────────
# Ninety One prints a SEVEN-step scale as numbered boxes, 1 to 7, with the
# applicable step outlined and no words anywhere near it. Nine of ten sheets in
# the September 2026 batch appeared to publish no indicator when searched as
# text; looking at the pages showed most of them do, this one included.
#
# **This mapping is arithmetic of ours, not a word the manager printed**, which
# makes it the one place in this module that computes rather than looks up. It
# is here on an explicit decision (2026-09-09) rather than by drift, and the
# honest mitigation is that `risk_indicator_raw` keeps what the sheet showed —
# "4 of 7" — so the page quotes the manager and only the ceiling comparison uses
# the converted number.
#
# Converted by position rather than proportionally rounded, so the ends stay the
# ends: a fund at the top of a seven-step scale must not land mid-scale on a
# five-step one.
_SEVEN_STEP_TO_FIVE: dict[int, int] = {1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 5}

#: "4 of 7", "4/7", "4 out of 7". Matched before the separator collapsing below,
#: which would otherwise turn "4/7" into "4 to 7" and lose it.
_OUT_OF_SEVEN = re.compile(r"^(\d)\s*(?:/|of|out of)\s*7$")

#: "2 of 5", "2/5". A FIVE-step scale needs no conversion at all — this scale
#: has five steps, so position N is level N. Recognised because a manager may
#: draw the steps and label only the ends: Curate labels boxes 1, 3 and 5 "Low
#: risk", "Medium" and "High risk", so a fund on step 2 has a published rating
#: and no printed word for it.
#:
#: Deliberately anchored to 5 and 7 rather than any denominator. Coronation
#: prints "6/10" beside the word "Moderate"; the word is the rating there, and
#: running its position through a table would invent a step it never published.
_OUT_OF_FIVE = re.compile(r"^([1-5])\s*(?:/|of|out of)\s*5$")


def from_seven_step(step: Any) -> int | None:
    """A step on a seven-step scale, as a level on ours. None if out of range."""
    try:
        position = int(step)
    except (TypeError, ValueError):
        return None
    return _SEVEN_STEP_TO_FIVE.get(position)


# Words that decorate a label without changing it. Sheets print "Moderate - High
# Risk" as a heading and abbreviate the scale itself to "Mod-High"; both are the
# same rating and neither should fall through as unreadable.
_DECORATION = ("risk profile", "risk", "profile")

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
    text = " ".join(text.split())
    # Strip a trailing "risk" or "risk profile": "Moderate - High Risk" is the
    # same rating as "Moderate to High".
    for decoration in _DECORATION:
        if text.endswith(" " + decoration):
            text = text[: -(len(decoration) + 1)].strip()
            break
    return text


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

    # Before collapsing, because "/" becomes " to " below.
    flat = " ".join(value.strip().casefold().split())
    seven = _OUT_OF_SEVEN.match(flat)
    if seven:
        return from_seven_step(seven.group(1))
    five = _OUT_OF_FIVE.match(flat)
    if five:
        level = int(five.group(1))
        return level if level in RISK_SCALE else None

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
