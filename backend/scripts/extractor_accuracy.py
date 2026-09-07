"""Measure a reader against the hand-transcribed seed.

    venv/bin/python scripts/extractor_accuracy.py backend
    venv/bin/python scripts/extractor_accuracy.py backend --reader llm

The 19 seeded funds were read off their managers' documents by a person, one
field at a time. That makes them a golden set: re-reading the same sheets and
diffing per field says how far a reader can be trusted, as a number rather than
an impression.

**The seed is never rewritten from reader output.** If it were, the benchmark
would become a record of what the reader already does and the score would
approach 100% while meaning nothing. Two of the known `benchmark` disagreements
are cases where the reader is MORE faithful than the hand transcription, and
they stay as disagreements for that reason.

## Two numbers, and the first one is the one to quote

This script used to print one figure — agreement over the fields the reader
*attempted* — and that number was used to argue that regex templates beat a
model at 94.6% to 80%. It is not a like-for-like comparison, and the argument
was wrong. A refusal is a field the admin still has to read off the PDF
themselves, so from the only position that matters, the person doing the work, a
refusal and a miss cost the same.

So the headline now counts refusals in the denominator, and both readers are
scored that way. The old number is still printed underneath, labelled as what it
is: how often the reader was right *when it committed to an answer*. That second
number is a real and different property — it says whether a refusal can be
trusted to mean "I could not read this" rather than "I gave up here" — but it is
not accuracy and must not be quoted as accuracy.

Downloads are cached under scripts/curation/.cache, so a re-run costs nothing.
Model readings are cached against each document's sha256 by the reader itself,
so `--reader llm` costs money once per sheet and nothing after that.
"""

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else Path.cwd()
sys.path.insert(0, str(BACKEND))

# `--reader llm` needs the API key, and every run needs the fetch to work, so
# the environment is loaded here rather than assumed. Nothing else in this
# script's import graph calls load_dotenv — `api.py` does, and this does not
# import it.
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from src.funds.extract import build_readers, extract_text  # noqa: E402
from src.funds.extract.fetch import FetchError, fetch, normalise  # noqa: E402

CACHE = BACKEND / "scripts" / "curation" / ".cache" / "accuracy"

# Seed column -> read field. Only fields both sides carry are scored; anything
# else would be measuring the seed's shape, not the reader. A column blank in the
# seed is skipped per fund, so widening this list cannot inflate the score — it
# only scores what a person actually transcribed.
COMPARED = {
    "as_of": "as_of",
    "isin": "isin",
    "ter": "ter",
    "tc": "tc",
    "tic": "tic",
    "benchmark": "benchmark",
    "risk_indicator_raw": "risk_indicator_raw",
    # The common core added in migration 025. Populated for four funds, which is
    # every fund whose document is readable locally.
    "nav_cpu": "nav_cpu",
    "nav_date": "nav_date",
    "fee_period": "fee_period",
    "inception_date": "inception_date",
    "annual_management_fee": "annual_management_fee",
    "return_high_12m": "return_high_12m",
    "return_low_12m": "return_low_12m",
    "return_extremes_basis": "return_extremes_basis",
    "portfolio_manager": "portfolio_manager",
    "fund_size_zar": "fund_size_zar",
    "distribution_frequency": "distribution_frequency",
}


def cached(url: str) -> bytes | None:
    CACHE.mkdir(parents=True, exist_ok=True)
    key = normalise(url).rsplit("/", 1)[-1][-80:] or "sheet"
    path = CACHE / f"{key}.pdf"
    if path.exists() and path.read_bytes()[:4] == b"%PDF":
        return path.read_bytes()
    try:
        content = fetch(url).content
    except FetchError as exc:
        print(f"  !! {url}: {exc}")
        return None
    path.write_bytes(content)
    return content


def comparable(field: str, value) -> str:
    """Loose enough that formatting is not scored, strict enough to catch a wrong figure.

    Two things this must not do. `str(value or "")` turns a transaction cost of
    0.0 into an empty string, because 0.0 is falsy — every genuinely free fund
    would then read as a disagreement. And a risk label is scored by the rating
    it maps to rather than by its characters: the sheet says "Low Risk" where a
    transcriber wrote "Low", and both are level 1, so calling that a
    disagreement would measure transcription style instead of accuracy.
    """
    if value is None:
        return ""
    if field == "risk_indicator_raw":
        from src.funds.risk_scale import normalize

        return str(normalize(value))
    text = str(value).strip().lower()
    try:
        return f"{float(text.replace('%', '')):.4f}"
    except ValueError:
        return " ".join(text.replace("–", "-").split())


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Score a reader against the seed.")
    parser.add_argument("backend", nargs="?", default=".")
    parser.add_argument(
        "--reader",
        choices=("regex", "llm"),
        default="regex",
        help=(
            "regex: the per-manager templates. llm: the model-based reader, which "
            "takes the Satrix hosts. FundRock keeps its template either way, so "
            "the two runs differ only on the Satrix sheets."
        ),
    )
    args = parser.parse_args(argv)

    readers = build_readers(llm_enabled=args.reader == "llm")
    print(f"reader: {args.reader} -> {', '.join(r.name for r in readers)}")

    def reader_for(url: str):
        for reader in readers:
            if reader.matches(url):
                return reader
        return None

    data = BACKEND / "data" / "funds"
    snapshots = {r["isin"]: r for r in csv.DictReader(open(data / "snapshots.csv"))}
    funds = list(csv.DictReader(open(data / "funds.csv")))

    agree = Counter()
    differ: list[str] = []
    refused = Counter()
    missed = Counter()
    covered = skipped = 0

    for fund in funds:
        snapshot = snapshots.get(fund["isin"])
        url = (snapshot or {}).get("mdd_url") or ""
        template = reader_for(url) if url else None
        if not template:
            skipped += 1
            continue

        content = cached(url)
        if not content:
            skipped += 1
            continue

        # Both the bytes and the text layer: a pattern template ignores the
        # first, a model-based reader needs it.
        extraction = template.read(content, extract_text(content), url)
        unresolved = {u.field for u in extraction.unresolved}
        covered += 1

        for column, field in COMPARED.items():
            expected = (snapshot.get(column) or "").strip()
            if not expected:
                continue  # nothing transcribed, so nothing to score against
            if field in unresolved:
                refused[field] += 1
                continue
            got = extraction.fields.get(field)
            if got is None:
                missed[field] += 1
            elif comparable(field, got) == comparable(field, expected):
                agree[field] += 1
            else:
                differ.append(f"{fund['name'][:34]:36s} {field:20s} seed={expected!r} got={got!r}")

    right = sum(agree.values())
    wrong = len(differ)
    absent = sum(missed.values())
    declined = sum(refused.values())

    # The honest denominator: everything a person transcribed and therefore
    # everything the reader had a chance at. A refusal counts against it because
    # a refused field is still a field somebody has to read off the PDF.
    transcribed = right + wrong + absent + declined
    attempted = right + wrong + absent

    print(f"\n{covered} sheets read, {skipped} skipped (no reader or unreachable)")
    print(f"{transcribed} fields the seed has a transcription for\n")
    if transcribed:
        print(f"  READ CORRECTLY   {right:4d} / {transcribed}  ({right / transcribed:.1%})  <- the number to quote")
        print(f"    disagreed      {wrong:4d}")
        print(f"    not found      {absent:4d}")
        print(f"    refused        {declined:4d}  (honest, and still work for a person)")
    if attempted:
        print(
            f"\n  of the {attempted} it committed to an answer on: {right / attempted:.1%} right"
        )
        print("  (a property of how trustworthy its refusals are, NOT its accuracy)")

    if refused:
        print("\nRefused by field — each is a field an admin still has to type:")
        for field, count in refused.most_common():
            print(f"  {field:24s} {count}")
    if missed:
        print("\nNot found by field:")
        for field, count in missed.most_common():
            print(f"  {field:24s} {count}")
    if differ:
        print("\nDisagreements — each is either an extractor bug or a transcription error:")
        for line in differ:
            print(f"  {line}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
