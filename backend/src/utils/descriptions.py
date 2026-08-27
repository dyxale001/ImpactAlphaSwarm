"""Plain-English descriptions for the entities Whale Watching shows: the
companies in ``assets`` and the institutional funds that hold them.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Optional

from .supabase_client import supabase

logger = logging.getLogger("alpha-api")

# Config
DESCRIPTIONS_ENABLED = os.getenv("DESCRIPTIONS_ENABLED", "true").lower() == "true"
DESCRIPTIONS_MAX_PER_RUN = int(os.getenv("DESCRIPTIONS_MAX_PER_RUN", "60"))

MAX_DESCRIPTION_CHARS = 320


# Fund name normalisation

_CORPORATE_SUFFIXES = {
    "inc", "incorporated", "corp", "corporation", "co", "company", "llc", "llp",
    "lp", "ltd", "limited", "plc", "sa", "nv", "ag", "gmbh",
}


def normalise_fund_key(name: str) -> str:

    cleaned = re.sub(r"[^a-z0-9\s&]", " ", (name or "").lower())
    tokens = cleaned.split()
    if tokens and tokens[0] == "the":
        tokens = tokens[1:]
    while tokens and tokens[-1] in _CORPORATE_SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


# Curated fund blurbs

FUND_BLURBS: list[tuple[str, str]] = [
    ("blackrock", "The biggest investment manager in the world. It runs the iShares range of ETFs and looks after money for pension funds, governments and ordinary savers."),
    ("vanguard", "Owned by its own funds rather than outside shareholders, and famous for making cheap index funds popular. One of the largest investment managers around."),
    ("state street", "It launched the first American ETF, the SPDR fund known as SPY, and is a big index manager and custodian bank."),
    ("geode", "A quiet index manager that runs many of Fidelity's index funds behind the scenes."),
    ("fmr", "The parent company of Fidelity, a large privately owned manager of mutual funds, share dealing and pensions."),
    ("fidelity", "A large privately owned investment manager offering mutual funds, share dealing and pensions."),
    ("morgan stanley", "A global investment bank. Its fund management arm invests for big institutions and wealthy clients."),
    ("jpmorgan", "The fund management side of America's biggest bank."),
    ("jp morgan", "The fund management side of America's biggest bank."),
    ("goldman sachs", "The fund management side of the Wall Street bank Goldman Sachs."),
    ("berkshire hathaway", "Warren Buffett's holding company, known for backing a small number of companies and holding them for many years."),
    ("norges bank", "Norway's sovereign wealth fund. It is one of the largest investors in the world, built from the country's oil money."),
    # T. Rowe Price files as "Price (T.Rowe) Associates", so match on the
    # distinctive middle rather than the brand order.
    ("t rowe", "A long established manager of actively run mutual funds and pension products."),
    ("capital world investors", "One of the oldest and biggest active managers, home to the American Funds range."),
    ("capital research", "One of the oldest and biggest active managers, home to the American Funds range."),
    ("capital international", "One of the oldest and biggest active managers, home to the American Funds range."),
    ("wellington management", "A large privately owned firm that manages money for institutions and other fund companies."),
    ("invesco", "A global manager best known for its QQQ fund, which tracks the Nasdaq 100 index."),
    ("northern trust", "A custody bank and investment manager serving institutions and wealthy families."),
    ("schwab", "A big broker whose fund arm runs cheap index funds and ETFs."),
    ("dimensional fund advisors", "A manager known as DFA that builds its funds around academic research on how markets behave."),
    ("bank of new york mellon", "BNY Mellon, one of the largest custodian banks and investment managers in the world."),
    ("mellon", "BNY Mellon, one of the largest custodian banks and investment managers in the world."),
    ("franklin resources", "Franklin Templeton, a global manager of mutual funds and ETFs across many markets."),
    ("franklin templeton", "Franklin Templeton, a global manager of mutual funds and ETFs across many markets."),
    ("ubs", "A Swiss bank and one of the biggest wealth managers in the world, looking after money for rich individuals and institutions."),
    ("deutsche bank", "The fund arm of Deutsche Bank, known as DWS, managing money across shares, bonds and property."),
    ("pacific investment management", "PIMCO, a specialist in bonds and one of the largest fixed income managers anywhere."),
    ("pimco", "A specialist in bonds and one of the largest fixed income managers anywhere."),
    ("allianz", "A giant German insurer whose fund arm invests the premiums it collects, and the parent of PIMCO."),
    ("wells fargo", "The fund arm of Wells Fargo, one of America's largest high street banks."),
    ("bank of america", "The fund and wealth arm of Bank of America, which also owns the Merrill brand."),
    ("merrill lynch", "The wealth and investment side of Bank of America, a long established American broker."),
    ("legal & general", "A large British insurer and one of the biggest managers of pension money in the UK, known as LGIM."),
    ("legal and general", "A large British insurer and one of the biggest managers of pension money in the UK, known as LGIM."),
    ("schroders", "One of Britain's oldest and largest investment managers, running funds for institutions and savers."),
    ("aberdeen", "A British manager, now called abrdn, offering funds across shares, bonds and property."),
    ("abrdn", "A British manager offering funds across shares, bonds and property, formerly Aberdeen."),
    ("nuveen", "The fund arm of American pensions giant TIAA, with a strong focus on income and real assets."),
    ("bridgewater associates", "The world's largest hedge fund, famous for trading on big economic trends."),
    ("citadel", "A large American hedge fund and market maker known for fast, computer driven trading."),
    ("renaissance technologies", "A secretive hedge fund that trades using heavy maths and statistics, run by former scientists."),
    ("royal bank of canada", "The fund arm of Canada's largest bank, known as RBC."),
    ("bank of montreal", "The fund arm of one of Canada's oldest banks, known as BMO."),
    ("macquarie", "An Australian bank and one of the world's biggest investors in infrastructure like roads and airports."),
]

FUND_BLURB_FALLBACK = (
    "An institutional investment firm that buys and holds shares in companies on "
    "behalf of its clients."
)


def curated_fund_blurb(name: str) -> Optional[str]:
    key = normalise_fund_key(name)
    if not key:
        return None
    padded = f" {key} "
    for match, text in FUND_BLURBS:
        if f" {match} " in padded:
            return text
    return None


def _clean(text: Any) -> Optional[str]:
    """Normalise one generated description, or None if it is unusable.
    """
    if not isinstance(text, str):
        return None
    out = text.strip().strip('"').strip()
    if len(out) < 20:
        return None
    # Dashes used as punctuation become commas.
    out = re.sub(r"\s*[—–―‒]\s*", ", ", out)
    out = re.sub(r"\s+-\s+", ", ", out)
    # Unicode hyphens joining a compound word are legitimate, but the model reaches
    # for U+2010/U+2011 rather than a plain one ("cloud‑based"), which is invisible
    # in review and renders inconsistently. Fold them down to ASCII.
    out = out.replace("‐", "-").replace("‑", "-")
    out = re.sub(r"\s+", " ", out)
    if len(out) > MAX_DESCRIPTION_CHARS:
        out = out[:MAX_DESCRIPTION_CHARS].rsplit(" ", 1)[0].rstrip(",.")
    if out[-1] not in ".!?":
        out += "."
    return out


# Company profiles (the market data provider, not the LLM)

class CompanyProfiles:
    """Company descriptions taken straight from the market data provider.

    yfinance returns the exchange's own business summary, so the text is factual by
    construction, costs nothing and spends no tokens. It is already a dependency
    here, used for prices and for the discovery volume gate.

    The trade is voice. The source is corporate prose rather than the plain English
    of ``_VOICE``, so this trims it to whole sentences and normalises the
    punctuation, but it cannot make it sound chatty. Accuracy is worth more, given
    the alternative was confident and wrong.
    """

    # Sentence enders that are really abbreviations, so a full stop after them does
    # not end the sentence. Without this, "Micron Technology, Inc. designs..." gets
    # cut after "Inc." and the description says nothing at all.
    _ABBREVIATIONS = (
        "inc", "corp", "co", "ltd", "llc", "llp", "lp", "plc", "sa", "nv", "ag",
        "gmbh", "s.a", "u.s", "u.k", "no", "vs", "est", "approx", "dr", "mr", "ms",
    )

    def fetch(self, ticker: str, name: Optional[str] = None) -> Optional[str]:
        """The company's business summary, trimmed and cleaned, or None."""
        summary = self._raw_summary(ticker)
        if not summary:
            return None
        text = " ".join(summary.split())
        text = self._strip_leading_name(text, name)
        text = self._first_sentences(text, MAX_DESCRIPTION_CHARS)
        return _clean(text)

    def _raw_summary(self, ticker: str) -> Optional[str]:
        try:
            import yfinance as yf

            info = yf.Ticker(ticker).info or {}
        except Exception as exc:
            logger.warning("yfinance profile fetch failed for %s: %s", ticker, exc)
            return None
        return (info.get("longBusinessSummary") or "").strip() or None

    def _strip_leading_name(self, text: str, name: Optional[str]) -> str:
        """Drop a leading company name, since the UI shows it directly above.

        Matching is token by token and must land on a word boundary. A plain prefix
        test is not safe here: "Corcept Therapeutics Inc" is a prefix of "Corcept
        Therapeutics Incorporated", so it ate the wrong characters and left the
        description starting "Orporated, a biopharmaceutical company".
        """
        if not name:
            return text
        wanted = [t.lower() for t in re.split(r"[^A-Za-z0-9&]+", name) if t]
        while wanted and wanted[-1] in _CORPORATE_SUFFIXES:
            wanted.pop()
        if not wanted:
            return text

        # Compare word by word. Whole words are the point: "Corcept Therapeutics
        # Inc" is a string prefix of "Corcept Therapeutics Incorporated", and
        # matching on that left a description starting "Orporated, a
        # biopharmaceutical company".
        words = [
            (m.group(0).lower(), m.start())
            for m in re.finditer(r"[A-Za-z0-9&]+", text)
        ]
        if len(words) <= len(wanted):
            return text
        for i, want in enumerate(wanted):
            if words[i][0] != want:
                return text

        # The summary carries its own legal suffix ("Micron Technology, Inc.
        # designs"), so step over any that follow the name.
        i = len(wanted)
        while i < len(words) and words[i][0] in _CORPORATE_SUFFIXES:
            i += 1
        if i >= len(words):
            return text

        rest = text[words[i][1]:]
        if len(rest) < 40:  # nothing meaningful left; keep the original
            return text
        # Re-case the new opening word, which was mid-sentence before.
        return rest[:1].upper() + rest[1:]

    def _first_sentences(self, text: str, limit: int) -> str:
        """Whole sentences up to ``limit`` characters, never a part of one."""
        out = ""
        for sentence in self._split_sentences(text):
            if out and len(out) + 1 + len(sentence) > limit:
                break
            out = f"{out} {sentence}".strip()
            if len(out) >= limit:
                break
        return out or text[:limit]

    def _split_sentences(self, text: str) -> list[str]:
        parts: list[str] = []
        current = ""
        for token in re.split(r"(?<=[.!?])\s+", text):
            current = f"{current} {token}".strip()
            word = current.rsplit(" ", 1)[-1].rstrip(".!?").lower()
            if word in self._ABBREVIATIONS:
                continue  # the full stop was an abbreviation, keep going
            parts.append(current)
            current = ""
        if current:
            parts.append(current)
        return parts


# Reads

def read_fund_descriptions() -> dict[str, str]:
    """Hand-written fund rows, which override the curated list at serve time.

    Only ``is_manual`` rows are returned. The table also holds rows an earlier LLM
    back-fill wrote, and those sat in front of the curated blurbs: where a curated
    blurb existed the model was handed it and paraphrased it back, changing nothing,
    and where one did not it guessed, which is how American Century came to be
    described as an insurance company. They stay in the table but are not served.
    """
    try:
        res = (
            supabase.table("fund_descriptions")
            .select("fund_key, description")
            .eq("is_manual", True)
            .execute()
        )
    except Exception as exc:
        logger.info("Fund descriptions read failed: %s", exc)
        return {}
    return {
        row["fund_key"]: row["description"]
        for row in (res.data or [])
        if row.get("fund_key") and row.get("description")
    }


def _assets_missing_descriptions(limit: int) -> list[dict]:
    try:
        res = (
            supabase.table("assets")
            .select("ticker, name, universe")
            .is_("description", "null")
            .eq("is_active", True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as exc:
        logger.info("Assets-missing-description read failed: %s", exc)
        return []


# Backfill

def backfill_asset_descriptions(limit: int = DESCRIPTIONS_MAX_PER_RUN) -> dict:
    """Store descriptions for active assets that lack one, from the market data
    provider rather than the LLM.

    Best-effort throughout: a ticker with no published profile is left undescribed
    and picked up again on the next run, which is why the write is per row rather
    than one transaction.
    """
    pending = _assets_missing_descriptions(limit)
    if not pending:
        return {"pending": 0, "written": 0}

    profiles = CompanyProfiles()
    written = 0
    no_profile: list[str] = []
    for item in pending:
        ticker = (item.get("ticker") or "").upper().strip()
        if not ticker:
            continue
        text = profiles.fetch(ticker, item.get("name"))
        if not text:
            no_profile.append(ticker)
            continue
        if _write_asset_description(ticker, text):
            written += 1

    if no_profile:
        logger.warning(
            "No published profile for %d of %d pending assets: %s",
            len(no_profile),
            len(pending),
            ", ".join(no_profile),
        )
    return {
        "pending": len(pending),
        "written": written,
        "no_profile": len(no_profile),
        "source": "yfinance",
    }


def _write_asset_description(ticker: str, description: str) -> bool:
    from datetime import datetime, timezone

    try:
        supabase.table("assets").update({
            "description": description,
            "description_generated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("ticker", ticker).execute()
        return True
    except Exception as exc:
        logger.info("Asset description write failed for %s: %s", ticker, exc)
        return False


def backfill_descriptions() -> dict:
    """Nightly refresh. Only companies are stored: a fund's blurb is resolved at
    serve time from the curated list, so there is nothing to back-fill for it.
    """
    if not DESCRIPTIONS_ENABLED:
        return {"enabled": False}
    return {"enabled": True, "assets": backfill_asset_descriptions()}
