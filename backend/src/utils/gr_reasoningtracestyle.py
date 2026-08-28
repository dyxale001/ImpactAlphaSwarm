"""House style for the prose the LLM writes.
"""

from __future__ import annotations

import re


class HouseStyle:
    """Rewrites one piece of generated prose into the house voice."""

    # Dash characters the model reaches for as punctuation: em, en, horizontal bar,
    # figure dash. A dash joining a compound word is handled separately below.
    _DASH_PUNCTUATION = re.compile(r"\s*[—–―‒]\s*")
    # A hyphen with space on both sides is doing the same job as an em dash.
    _SPACED_HYPHEN = re.compile(r"\s+-{1,2}\s+")
    _LEADING_DASH = re.compile(r"^\s*[-—–―‒]+\s+")
    _DOUBLED_COMMA = re.compile(r",\s*,")
    _COMMA_AFTER_STOP = re.compile(r"([;:,])\s*,\s*")
    _COMMA_BEFORE_STOP = re.compile(r"\s*,\s*([.!?])")
    _WHITESPACE = re.compile(r"\s+")

    # Unicode hyphens that join a compound word are legitimate, but the model reaches
    # for U+2010/U+2011 over a plain one, which is invisible in review and renders
    # inconsistently. Fold them to ASCII rather than treating them as punctuation.
    _UNICODE_HYPHENS = {"‐": "-", "‑": "-"}

    def apply(self, text: str) -> str:
        """Return ``text`` with dash punctuation removed.

        Safe on anything: a non-string or an empty string comes back as "".
        """
        if not isinstance(text, str):
            return ""
        out = text.strip().strip('"').strip()
        if not out:
            return ""
        out = self._strip_dashes(out)
        return self._WHITESPACE.sub(" ", out).strip()

    def _strip_dashes(self, text: str) -> str:
        out = self._LEADING_DASH.sub("", text)
        for char, plain in self._UNICODE_HYPHENS.items():
            out = out.replace(char, plain)
        out = self._DASH_PUNCTUATION.sub(", ", out)
        out = self._SPACED_HYPHEN.sub(", ", out)
        # The substitutions above are blind to what preceded the dash, so tidy the
        # two ways that lands wrong: after punctuation that already separates, and
        # immediately before a full stop.
        out = self._DOUBLED_COMMA.sub(",", out)
        out = self._COMMA_AFTER_STOP.sub(r"\1 ", out)
        out = self._COMMA_BEFORE_STOP.sub(r"\1", out)
        return out


HOUSE_STYLE = HouseStyle()
