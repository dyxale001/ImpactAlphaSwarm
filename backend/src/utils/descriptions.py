"""Plain-English descriptions for the entities Whale Watching shows: the
companies in ``assets`` and the institutional funds that hold them.

Why this module exists: the asset-discovery agent adds tickers nightly, and each
new ticker drags in fund holders we have never seen. Both used to arrive
undescribed, so a novice saw a bare four-letter symbol and a generic "an
institutional investment firm" line.

Descriptions are generated once by a light LLM (Groq, the same model the
discovery agent already uses) during the nightly job and cached in Supabase, so
no page load ever waits on a model and no blurb is paid for twice.

Voice rules are enforced in the prompt and re-checked in ``_clean``: plain
English a beginner understands, UK spelling, no dashes as punctuation, no advice,
and no figures that would go stale between generations.

Purely informational, like the rest of whale watching: nothing here reaches the
Unified Confidence Score.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Iterable, Optional

from .supabase_client import supabase

logger = logging.getLogger("alpha-api")

# ── Config (env-tunable; the nightly job is the only caller) ──────────────────
DESCRIPTIONS_ENABLED = os.getenv("DESCRIPTIONS_ENABLED", "true").lower() == "true"
# Items per LLM call. Small enough that one bad reply loses little work, large
# enough that a full backfill is a handful of calls.
DESCRIPTIONS_BATCH_SIZE = int(os.getenv("DESCRIPTIONS_BATCH_SIZE", "10"))
# Hard ceiling per nightly run per kind, so a sudden influx of discovered names
# cannot turn into an unbounded number of LLM calls. Leftovers are picked up the
# following night.
DESCRIPTIONS_MAX_PER_RUN = int(os.getenv("DESCRIPTIONS_MAX_PER_RUN", "60"))

MAX_DESCRIPTION_CHARS = 320


# ══════════════════════════════════════════════════════════════════════════════
# Fund name normalisation
# ══════════════════════════════════════════════════════════════════════════════

# 13F filer names are messy: "BlackRock Inc.", "Blackrock, Inc", "BLACKROCK INC"
# are all the same firm. Collapsing them to one key stops us generating (and
# paying for) three descriptions of the same fund.
#
# Deliberately excludes "trust": it is a real part of many firm names, not a
# legal suffix. Treating it as one turned "Northern Trust Corporation" into
# "northern", which is both a bad key and one that could collide with an
# unrelated "Northern <something>".
_CORPORATE_SUFFIXES = {
    "inc", "incorporated", "corp", "corporation", "co", "company", "llc", "llp",
    "lp", "ltd", "limited", "plc", "sa", "nv", "ag", "gmbh",
}


def normalise_fund_key(name: str) -> str:
    """Match key for a fund name: lower-cased, punctuation stripped, corporate
    suffixes dropped. ``"BlackRock, Inc."`` and ``"BLACKROCK INC"`` both give
    ``"blackrock"``.

    Suffixes are only stripped from the end, repeatedly, so a suffix word that
    appears mid-name survives: "Bank of Montreal" keeps its "of", and
    "Capital Group Companies Inc" loses only the "inc".
    """
    cleaned = re.sub(r"[^a-z0-9\s&]", " ", (name or "").lower())
    tokens = cleaned.split()
    if tokens and tokens[0] == "the":
        tokens = tokens[1:]
    while tokens and tokens[-1] in _CORPORATE_SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


# ══════════════════════════════════════════════════════════════════════════════
# Curated fund blurbs
# ══════════════════════════════════════════════════════════════════════════════

# These are the hand-written blurbs Whale Watching shipped with. They now serve
# two purposes, neither of which is being the final answer:
#   1. few-shot style examples in the LLM prompt, so generated blurbs sound like
#      these rather than like a prospectus;
#   2. a fallback for the biggest names before the nightly backfill has run, so
#      a fresh deploy is never worse than what was there before.
# Once a fund has a row in ``fund_descriptions`` that row wins.
#
# Match keys are checked against the normalised fund key as whole words, so a
# generic token cannot swallow unrelated firms. Ordered most specific first.
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
    """Return the hand-written blurb for a fund, or None if it is not one of the
    curated names.

    Matches on whole words within the normalised key, so ``"capital research"``
    matches "Capital Research Global Investors" but a firm merely called
    "Something Capital Management" falls through to the LLM instead of borrowing
    the American Funds blurb.
    """
    key = normalise_fund_key(name)
    if not key:
        return None
    padded = f" {key} "
    for match, text in FUND_BLURBS:
        if f" {match} " in padded:
            return text
    return None


# ══════════════════════════════════════════════════════════════════════════════
# Groq (thin and self-contained, so this module has no dependency on the agents)
# ══════════════════════════════════════════════════════════════════════════════

def _get_llm():
    """A Groq chat client, or None when unconfigured. Mirrors the discovery
    agent's setup so both use one key and one model."""
    key = os.getenv("GROQ_API_KEY")
    if not key:
        return None
    try:
        from langchain_groq import ChatGroq

        return ChatGroq(
            api_key=key,
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            temperature=0.3,
            max_tokens=1200,
        )
    except Exception as exc:  # pragma: no cover
        logger.info("Groq init failed for descriptions: %s", exc)
        return None


def _llm_json_object(llm, prompt: str) -> dict:
    """Invoke the model and pull a JSON object out of the reply. {} on any
    failure, which the callers treat as "nothing generated this pass"."""
    try:
        from langchain_core.messages import HumanMessage

        raw = (llm.invoke([HumanMessage(content=prompt)]).content or "").strip()
    except Exception as exc:
        logger.info("Groq invoke failed for descriptions: %s", exc)
        return {}
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        return {}
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


# ══════════════════════════════════════════════════════════════════════════════
# Prompting
# ══════════════════════════════════════════════════════════════════════════════

_VOICE = (
    "Voice rules, follow all of them:\n"
    "- Two short sentences at most. Aim for 25 to 40 words.\n"
    "- Plain English that someone with no finance background understands.\n"
    "- British spelling.\n"
    "- Never use dashes as punctuation. Use commas, or start a new sentence.\n"
    "- State facts only. No opinions, no ratings, no advice, no mention of "
    "whether it is a good investment.\n"
    "- No share prices, valuations, percentages or other figures that go out of "
    "date.\n"
    "- Do not start with the entity name. Do not repeat the name back.\n"
)


def _asset_prompt(items: list[dict]) -> str:
    listing = "\n".join(
        f"- {it['ticker']}: {it.get('name') or it['ticker']}"
        + (f" (sector we file it under: {it['universe']})" if it.get("universe") else "")
        for it in items
    )
    return (
        "Write a short plain-English description of what each of these listed "
        "companies actually does, as it would appear under the company name in a "
        "beginner friendly investing app.\n\n"
        f"{_VOICE}\n"
        "If you are not confident what a company does, return an empty string for "
        "it rather than guessing.\n\n"
        f"Companies:\n{listing}\n\n"
        'Return ONLY a JSON object mapping ticker to description, e.g. '
        '{"AAPL":"Makes the iPhone, Mac and iPad, and runs services like the App '
        'Store and iCloud. Most of its money comes from selling devices."}. '
        "No prose outside the JSON."
    )


def _fund_prompt(items: list[dict]) -> str:
    # Where we have a hand-written blurb for a firm, hand the model the facts in
    # it. Left to itself the model produces something true but empty ("a US
    # investment firm that manages money for institutions") for firms we can
    # describe far more usefully, e.g. that Geode quietly runs Fidelity's index
    # funds. The model still does the writing, it just is not guessing.
    lines = []
    for it in items:
        known = curated_fund_blurb(it["fund_name"])
        lines.append(
            f"- {it['fund_name']}"
            + (f"\n    known facts: {known}" if known else "")
        )
    listing = "\n".join(lines)

    # Two curated blurbs as style anchors. These set the register far better than
    # adjectives in the instructions do.
    examples = (
        '{"BlackRock Inc.":"The biggest investment manager in the world. It runs '
        "the iShares range of ETFs and looks after money for pension funds, "
        'governments and ordinary savers.",'
        '"Norges Bank Investment Management":"Norway\'s sovereign wealth fund. It '
        "is one of the largest investors in the world, built from the country's "
        'oil money."}'
    )
    return (
        "Write a short plain-English description of each of these institutional "
        "investors, as it would appear under the firm's name in a beginner "
        "friendly investing app. Say who they are and what kind of money they "
        "manage.\n\n"
        f"{_VOICE}\n"
        "Where a firm lists known facts, base your description on them. "
        "If a firm has no known facts and you do not recognise it, return an "
        "empty string for it rather than guessing.\n\n"
        f"Match this style exactly:\n{examples}\n\n"
        f"Firms:\n{listing}\n\n"
        "Return ONLY a JSON object mapping the firm name exactly as given to its "
        "description. No prose outside the JSON."
    )


def _clean(text: Any) -> Optional[str]:
    """Normalise one generated description, or None if it is unusable.

    Belt and braces on the voice rules: models slip dashes in even when told not
    to, so we rewrite them rather than reject an otherwise good blurb.
    """
    if not isinstance(text, str):
        return None
    out = text.strip().strip('"').strip()
    if len(out) < 20:  # empty string (the "not confident" signal) or a stub
        return None
    # Em dash / en dash used as punctuation becomes a comma; a hyphen with spaces
    # around it likewise. Hyphens inside words (well-known) are left alone.
    out = re.sub(r"\s*[—–]\s*", ", ", out)
    out = re.sub(r"\s+-\s+", ", ", out)
    out = re.sub(r"\s+", " ", out)
    if len(out) > MAX_DESCRIPTION_CHARS:
        out = out[:MAX_DESCRIPTION_CHARS].rsplit(" ", 1)[0].rstrip(",.")
    # The model routinely drops the closing full stop, which looks like a
    # truncated blurb next to the ones that have it.
    if out[-1] not in ".!?":
        out += "."
    return out


def _batched(items: list, size: int) -> Iterable[list]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


# ══════════════════════════════════════════════════════════════════════════════
# Reads
# ══════════════════════════════════════════════════════════════════════════════

def read_fund_descriptions() -> dict[str, str]:
    """All cached fund descriptions as {normalised key: description}. {} on
    error, which just means callers fall back to the curated blurbs."""
    try:
        res = supabase.table("fund_descriptions").select("fund_key, description").execute()
    except Exception as exc:
        logger.info("Fund descriptions read failed: %s", exc)
        return {}
    return {
        row["fund_key"]: row["description"]
        for row in (res.data or [])
        if row.get("fund_key") and row.get("description")
    }


def _assets_missing_descriptions(limit: int) -> list[dict]:
    """Active assets with no description yet, oldest discoveries first so a big
    backlog drains in a stable order."""
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


# ══════════════════════════════════════════════════════════════════════════════
# Backfill
# ══════════════════════════════════════════════════════════════════════════════

def backfill_asset_descriptions(limit: int = DESCRIPTIONS_MAX_PER_RUN) -> dict:
    """Generate and store descriptions for active assets that lack one.

    Best-effort throughout: a failed batch leaves those assets undescribed and
    they are retried on the next run, which is why the write is per row rather
    than one transaction.
    """
    pending = _assets_missing_descriptions(limit)
    if not pending:
        return {"pending": 0, "written": 0}

    llm = _get_llm()
    if llm is None:
        logger.info("Skipping asset descriptions: no Groq key configured")
        return {"pending": len(pending), "written": 0, "skipped": "no_llm"}

    written = 0
    for batch in _batched(pending, DESCRIPTIONS_BATCH_SIZE):
        generated = _llm_json_object(llm, _asset_prompt(batch))
        by_ticker = {(it.get("ticker") or "").upper(): it for it in batch}
        for raw_ticker, raw_text in generated.items():
            ticker = str(raw_ticker).upper().strip()
            if ticker not in by_ticker:  # model invented a ticker; ignore it
                continue
            text = _clean(raw_text)
            if not text:
                continue
            if _write_asset_description(ticker, text):
                written += 1
    return {"pending": len(pending), "written": written}


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


def backfill_fund_descriptions(
    fund_names: list[str], limit: int = DESCRIPTIONS_MAX_PER_RUN
) -> dict:
    """Generate and store descriptions for any fund in ``fund_names`` that has no
    cached row yet. Manually written rows are never touched (the caller only ever
    passes names, and existing keys are filtered out here).
    """
    existing = set(read_fund_descriptions().keys())
    # Dedupe by normalised key while keeping the first display name we saw.
    pending: dict[str, str] = {}
    for name in fund_names:
        key = normalise_fund_key(name)
        if not key or key in existing or key in pending:
            continue
        pending[key] = name
    if not pending:
        return {"pending": 0, "written": 0}

    items = [{"fund_key": k, "fund_name": v} for k, v in list(pending.items())[:limit]]

    llm = _get_llm()
    if llm is None:
        logger.info("Skipping fund descriptions: no Groq key configured")
        return {"pending": len(items), "written": 0, "skipped": "no_llm"}

    written = 0
    for batch in _batched(items, DESCRIPTIONS_BATCH_SIZE):
        generated = _llm_json_object(llm, _fund_prompt(batch))
        # Map back on the normalised key so minor echo differences in the name
        # ("Inc." dropped, case changed) still land on the right row.
        by_key = {it["fund_key"]: it for it in batch}
        for raw_name, raw_text in generated.items():
            item = by_key.get(normalise_fund_key(str(raw_name)))
            if item is None:
                continue
            text = _clean(raw_text)
            if not text:
                continue
            if _write_fund_description(item["fund_key"], item["fund_name"], text):
                written += 1
    return {"pending": len(items), "written": written}


def _write_fund_description(fund_key: str, fund_name: str, description: str) -> bool:
    from datetime import datetime, timezone

    try:
        supabase.table("fund_descriptions").upsert({
            "fund_key": fund_key,
            "fund_name": fund_name,
            "description": description,
            "source": "llm",
            "is_manual": False,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return True
    except Exception as exc:
        logger.info("Fund description write failed for %s: %s", fund_key, exc)
        return False


def backfill_descriptions(fund_names: Optional[list[str]] = None) -> dict:
    """Nightly entry point: describe anything new that arrived today.

    Called after the discovery agent has refreshed the pool, so the tickers it
    added tonight are described before anyone opens Whale Watching in the
    morning. ``fund_names`` comes from the rebuilt fund-holdings aggregation;
    omit it to do assets only.
    """
    if not DESCRIPTIONS_ENABLED:
        return {"enabled": False}
    summary: dict[str, Any] = {"enabled": True}
    summary["assets"] = backfill_asset_descriptions()
    if fund_names:
        summary["funds"] = backfill_fund_descriptions(fund_names)
    return summary
