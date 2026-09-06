"""Measure the extractor against the hand-transcribed seed.

    venv/bin/python scripts/extractor_accuracy.py backend

The 19 seeded funds were read off their managers' documents by a person, one
field at a time. That makes them a golden set: re-extracting the same sheets and
diffing per field says how far the templates can be trusted, as a number rather
than an impression.

Two rules keep the number honest.

**The seed is never rewritten from extractor output.** If it were, the benchmark
would become a record of what the extractor already does and the score would
approach 100% while meaning nothing.

**A refusal is not an error.** A field the template deliberately declines — the
Satrix risk rating, which is a graphic — is reported separately from a field it
read wrongly. Conflating them would make refusing look as bad as guessing, which
is the opposite of the incentive this design wants.

Downloads are cached under scripts/curation/.cache, so a re-run costs nothing.
"""

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else Path.cwd()
sys.path.insert(0, str(BACKEND))

from src.funds.extract import extract_text, template_for  # noqa: E402
from src.funds.extract.fetch import FetchError, fetch, normalise  # noqa: E402

CACHE = BACKEND / "scripts" / "curation" / ".cache" / "accuracy"

# Seed column -> extracted field. Only fields both sides carry are scored;
# anything else would be measuring the seed's shape, not the extractor.
COMPARED = {
    "as_of": "as_of",
    "isin": "isin",
    "ter": "ter",
    "tc": "tc",
    "tic": "tic",
    "benchmark": "benchmark",
    "risk_indicator_raw": "risk_indicator_raw",
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
    parser = argparse.ArgumentParser(description="Score the extractor against the seed.")
    parser.add_argument("backend", nargs="?", default=".")
    args = parser.parse_args(argv)

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
        template = template_for(url) if url else None
        if not template:
            skipped += 1
            continue

        content = cached(url)
        if not content:
            skipped += 1
            continue

        extraction = template.extract(extract_text(content), url)
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

    scored = sum(agree.values()) + len(differ) + sum(missed.values())
    print(f"\n{covered} sheets read, {skipped} skipped (no template or unreachable)")
    print(f"{scored} fields compared against the hand-transcribed seed")
    if scored:
        print(f"  agreed      {sum(agree.values()):4d}  ({sum(agree.values()) / scored:.1%})")
        print(f"  disagreed   {len(differ):4d}")
        print(f"  not found   {sum(missed.values()):4d}")
    print(f"  refused     {sum(refused.values()):4d}  (declined on purpose, not scored above)")

    if refused:
        print("\nDeclined by field:")
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
