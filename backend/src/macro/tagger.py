"""Probabilities in, tags out. Pure, so the rule that decides what a user sees is the
easiest thing in the feature to test.

The rule: an article must pass the relevance gate before it can carry any tag. Past
the gate it is tagged Market-wide if that probability clears the threshold, and with
every universe whose own probability does. Nothing is ranked against anything else;
each question stands alone, which is why one article can carry two universes, or none.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .config import MACRO_GATE_THRESHOLD, MACRO_TAG_THRESHOLD
from .universes import MARKET_WIDE


@dataclass(frozen=True)
class Scores:
    """Jev's answers for one article. Universe names as keys, never question ids."""

    gate: float
    market_wide: float
    universes: dict[str, float] = field(default_factory=dict)


def tags_for(
    scores: Optional[Scores],
    *,
    tag_threshold: float = MACRO_TAG_THRESHOLD,
    gate_threshold: float = MACRO_GATE_THRESHOLD,
) -> list[str]:
    """The tags an article earns, Market-wide first, then universes in their given order.

    ``None`` (an article Jev could not score) earns nothing rather than being guessed at.
    """
    if scores is None or scores.gate < gate_threshold:
        return []
    tags = [MARKET_WIDE] if scores.market_wide >= tag_threshold else []
    tags.extend(u for u, p in scores.universes.items() if p >= tag_threshold)
    return tags
