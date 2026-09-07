"""Which reader reads which manager's sheets.

A list rather than a factory keyed on a string, because the caller has a URL and
not a manager name — the whole point of pasting a link is that nobody has to
know which template applies.

Adding a manager whose layout needs a pattern is a module and one line here.
Adding one the model can read is one host in `llm.LlmFactsheetReader.hosts`, with
no pattern at all. That second unit of work is the point of Phase 2.

## The flag decides the order, not the membership

`FUND_LLM_EXTRACT_ENABLED` off is today's behaviour exactly: FundRock's template
and Satrix's, both regex, no `anthropic` import, no request off the machine.

Flag on, the model-based reader takes the Satrix hosts and Satrix's template
steps aside. Superseded rather than deleted, for two reasons. The file documents
*why* five fields are unreadable by pattern on those sheets, which is the most
expensive lesson in this package. And with the flag off it is still the reader
that runs, so deleting it would mean the feature regresses when switched off —
which is not what "default off" should mean.

**FundRock's template is kept in both modes on purpose.** It is written, free,
covers most of the catalogue, and a disagreement between it and the model on the
same document is a signal worth being able to see.
"""

from __future__ import annotations

from typing import Optional

from ..config import FUND_LLM_EXTRACT_ENABLED
from .base import FactsheetTemplate
from .fundrock import FundRockTemplate
from .satrix import SatrixTemplate


def build_readers(llm_enabled: bool = FUND_LLM_EXTRACT_ENABLED) -> tuple[FactsheetTemplate, ...]:
    """The readers in priority order, for a given flag state.

    Takes the flag as an argument rather than reading it, so a test can prove
    both arrangements without touching the environment — and so the import of
    `llm` genuinely does not happen when the flag is off, which is what keeps
    `anthropic` out of the served app.
    """
    if not llm_enabled:
        return (FundRockTemplate(), SatrixTemplate())

    from .llm import LlmFactsheetReader

    # FundRock first: a manager with a written template keeps it, and the model
    # picks up everything else it claims.
    return (FundRockTemplate(), LlmFactsheetReader())


TEMPLATES: tuple[FactsheetTemplate, ...] = build_readers()


def template_for(url: str) -> Optional[FactsheetTemplate]:
    """The reader for a URL, or None when nothing here claims it."""
    for template in TEMPLATES:
        if template.matches(url):
            return template
    return None


def readable_hosts() -> tuple[str, ...]:
    """Every host a reader claims. Doubles as the fetch allowlist.

    The two being one list is deliberate: a host that can be downloaded from is
    a host whose sheets something here can read, so the allowlist and the useful
    set cannot drift apart. It also means switching the model reader on does not
    widen what the server will fetch — the model reader declares hosts the same
    way a template does.
    """
    return tuple(sorted({host for t in TEMPLATES for host in t.hosts}))
