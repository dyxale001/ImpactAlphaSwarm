"""Which template reads which manager's sheets.

A list rather than a factory keyed on a string, because the caller has a URL and
not a manager name — the whole point of pasting a link is that nobody has to
know which template applies.

Adding a manager is a module and one line here. That is the unit of work the
design intends: resolve one layout, and every fund that manager issues becomes
readable at once.
"""

from __future__ import annotations

from typing import Optional

from .base import FactsheetTemplate
from .fundrock import FundRockTemplate
from .satrix import SatrixTemplate

TEMPLATES: tuple[FactsheetTemplate, ...] = (
    FundRockTemplate(),
    SatrixTemplate(),
)


def template_for(url: str) -> Optional[FactsheetTemplate]:
    """The template for a URL, or None when no manager here claims it."""
    for template in TEMPLATES:
        if template.matches(url):
            return template
    return None


def readable_hosts() -> tuple[str, ...]:
    """Every host a template claims. Doubles as the fetch allowlist."""
    return tuple(sorted({host for t in TEMPLATES for host in t.hosts}))
