"""How well does Gemini read our fact sheets, and what would a person have to check?

    venv/bin/python scripts/factsheet_accuracy.py --limit 3             # a cheap first look
    venv/bin/python scripts/factsheet_accuracy.py                       # every sheet, FUND_EXTRACT_MODEL
    venv/bin/python scripts/factsheet_accuracy.py --models gemini-3.8-flash gemini-3.5-flash-lite
    venv/bin/python scripts/factsheet_accuracy.py --thinking low        # does less thinking cost accuracy?

Runs ``src.funds.reading`` (the reader the upload feature will use) over every
fact sheet in data/funds/mdd and reports, per model:

  * how each field came out: confirmed, check (a person must look) or missing;
  * how often it agrees with what we already hold for that sheet, and above all
    how often a CONFIRMED field disagrees, because those are the values a person
    would not be pointed at;
  * a small trusted check against three sheets transcribed by hand;
  * whether it refuses three documents that are not fact sheets;
  * tokens and cost per sheet.

## Read this before reading the numbers

The 54 rows in data/funds/snapshots.csv were themselves transcribed by an AI
model (entered_by "Claude extraction 2026-10-12 (unreviewed)"). So "agrees with
the reference" means two models agree, which is good evidence but not proof, and
"differs" means one of them is wrong, not which. Every disagreement is written to
a CSV with Gemini's quote and page: mark the ``who_is_right`` column (gemini /
reference / neither) and the marked rows become an accuracy figure for both.

Only three sheets have values a person typed (commit 8bf4ae6, "hand
transcription 2026-09-09") and their PDF still on disk. They are the trusted
check, and three is too few to be more than a sanity check.

## Cost

Every answer is cached under data/funds/extract_cache, keyed by model, prompt
version, thinking setting and the PDF's hash, so re-running the comparison is
free; pass --fresh to ask again. Prices are the third-party listed rates per
million tokens, not confirmed against Google's page; override with --price.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

from src.funds.asisa import ASISA  # noqa: E402
from src.funds.reading import (  # noqa: E402
    FIELDS,
    NUMERIC,
    PROMPT_VERSION,
    GeminiFactsheetReader,
    ReadingError,
    SheetReading,
    comparable,
    pdf_text,
)
from src.funds.risk_scale import normalize as risk_level_of  # noqa: E402

DATA = BACKEND / "data" / "funds"
MDD = DATA / "mdd"
CACHE = DATA / "extract_cache"

#: Listed prices per million tokens (input, output), from third-party trackers on
#: 2026-10-12. Thinking tokens are billed as output.
PRICES: dict[str, tuple[float, float]] = {
    "gemini-3.8-flash": (0.75, 3.75),
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.5-flash-lite": (0.30, 2.50),
}

#: The three sheets with hand-typed values and their PDF still here.
HAND_ENTERED_COMMIT = "8bf4ae6"
HAND_ENTERED: dict[str, tuple[str, str]] = {
    "CSIB4-2026-07.pdf": ("ZAE000170403", "2026-07-31"),
    "DBFD-2026-07.pdf": ("ZAE000107504", "2026-07-31"),
    "CURATE-IncomePlus-2026-05.pdf": ("ZAE000068789", "2026-05-31"),
}

#: Fields compared as prose: the same words, give or take punctuation and a
#: model quoting a little more or less of the paragraph.
PROSE = {"objective", "risk_narrative", "horizon_words", "benchmark", "portfolio_manager",
         "fund_name", "distribution_frequency"}

#: Fields that identify the fund rather than describe it. Our values for these come
#: from the fund list, not the sheet, and many sheets never print them (no Allan
#: Gray sheet prints its ISIN or JSE code). They only count against the reader
#: when the sheet actually prints the value we hold.
IDENTITY = {"isin", "jse_code"}

#: Where a field's expected value lives, when not in the snapshot under its own name.
FROM_FUND_ROW = {"fund_name": "name", "isin": "isin", "jse_code": "jse_code", "asisa_category": "asisa_category"}


# ── the documents ───────────────────────────────────────────────────────────

def load_csv(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def sheets_with_reference() -> list[dict[str, Any]]:
    """Every snapshot row whose PDF is on disk, with its fund row beside it."""
    funds = {r["isin"]: r for r in load_csv((DATA / "funds.csv").read_text())}
    out = []
    for row in load_csv((DATA / "snapshots.csv").read_text()):
        pdf = MDD / row["isin"] / f"{row['as_of']}.pdf"
        if pdf.exists():
            out.append({"pdf": pdf, "snapshot": row, "fund": funds.get(row["isin"], {}), "kind": "reference"})
    return out


def sheets_hand_entered() -> list[dict[str, Any]]:
    """The trusted three, with the values a person typed, read from git."""
    try:
        snaps = load_csv(subprocess.run(
            ["git", "show", f"{HAND_ENTERED_COMMIT}:backend/data/funds/snapshots.csv"],
            cwd=BACKEND, capture_output=True, text=True, check=True).stdout)
        funds = load_csv(subprocess.run(
            ["git", "show", f"{HAND_ENTERED_COMMIT}:backend/data/funds/funds.csv"],
            cwd=BACKEND, capture_output=True, text=True, check=True).stdout)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  (could not read the hand-entered rows from git; skipping the trusted check)")
        return []
    by_key = {(r["isin"], r["as_of"]): r for r in snaps}
    fund_by_isin = {r["isin"]: r for r in funds}
    out = []
    for name, key in HAND_ENTERED.items():
        pdf = MDD / name
        if pdf.exists() and key in by_key:
            out.append({"pdf": pdf, "snapshot": by_key[key], "fund": fund_by_isin.get(key[0], {}), "kind": "hand"})
    return out


def negatives(directory: Path) -> list[dict[str, Any]]:
    """Three documents that are not fact sheets, made on the spot."""
    try:
        import pymupdf as fitz  # a dev requirement
    except ImportError:
        print("  (pymupdf is not installed; skipping the not-a-fact-sheet check)")
        return []
    pages = {
        "invoice.pdf": "TAX INVOICE\nInvoice no. 20391\nDate: 3 October 2026\nBill to: Thandiwe Mokoena\n"
                       "Plumbing call-out and repairs  R1 450.00\nVAT (15%)  R217.50\nTotal due  R1 667.50\n"
                       "Payment within 30 days to account 4081 223 901.",
        "article.pdf": "Rand firms as investors weigh rate outlook\nJohannesburg, 9 October 2026\n"
                       "The rand strengthened against the dollar on Thursday as traders weighed comments from the "
                       "Reserve Bank on the path of interest rates. Local bonds were little changed.",
        "statement.pdf": "Monthly bank statement\nAccount holder: S. Naidoo\nStatement period: 1 to 30 September 2026\n"
                         "Opening balance R12 304.55\nSalary R28 900.00\nRent -R9 500.00\nClosing balance R31 704.55",
    }
    directory.mkdir(parents=True, exist_ok=True)
    out = []
    for name, text in pages.items():
        path = directory / name
        if not path.exists():
            doc = fitz.open()
            doc.new_page().insert_text((56, 72), text, fontsize=11)
            doc.save(str(path))
        out.append({"pdf": path, "snapshot": {}, "fund": {}, "kind": "negative"})
    return out


# ── reading, with a cache ───────────────────────────────────────────────────

def cache_file(model: str, thinking: Optional[str], document: bytes) -> Path:
    digest = hashlib.sha256(document).hexdigest()[:24]
    return CACHE / model / f"v{PROMPT_VERSION}-{thinking or 'default'}-{digest}.json"


def read_one(reader: GeminiFactsheetReader, pdf: Path, fresh: bool) -> tuple[Optional[SheetReading], bool, Optional[str]]:
    """One sheet's reading, from the cache when there is one. Returns the
    reading, whether it cost a call, and an error message if it failed."""
    document = pdf.read_bytes()
    path = cache_file(reader.model, reader.thinking_level, document)
    if path.exists() and not fresh:
        saved = json.loads(path.read_text())
        return reader.read(document, payload=saved["payload"], tokens=saved["tokens"]), False, None
    try:
        payload, tokens = reader.ask(document)
    except ReadingError as e:
        return None, True, str(e)
    except Exception as e:  # one bad sheet must not end the run
        return None, True, f"{type(e).__name__}: {e}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"payload": payload, "tokens": tokens, "pdf": pdf.name}, indent=1))
    return reader.read(document, payload=payload, tokens=tokens), True, None


# ── comparing ───────────────────────────────────────────────────────────────

def expected(field: str, sheet: dict[str, Any]) -> Any:
    if field in FROM_FUND_ROW:
        raw = sheet["fund"].get(FROM_FUND_ROW[field])
    else:
        raw = sheet["snapshot"].get(field)
    if raw is None or str(raw).strip() == "":
        return None
    if field in NUMERIC:
        try:
            return float(raw)
        except ValueError:
            return None
    if field == "regulation_28":
        return str(raw).strip().lower() == "true"
    return str(raw).strip()


def _words(text: str) -> set[str]:
    return set(comparable(text).replace(",", " ").replace(".", " ").split())


def agrees(field: str, got: Any, want: Any) -> bool:
    if field in NUMERIC:
        try:
            a, b = float(got), float(want)
        except (TypeError, ValueError):
            return False
        return abs(a - b) <= max(0.006, abs(b) * 0.005)
    if field == "regulation_28":
        return bool(got) == bool(want)
    if field == "risk_indicator_raw":
        return risk_level_of(str(got)) is not None and risk_level_of(str(got)) == risk_level_of(str(want))
    if field == "asisa_category":
        a, b = ASISA.resolve(str(got)), ASISA.resolve(str(want))
        return a is not None and b is not None and a.name == b.name
    if field == "fund_name":
        return _fund_name(got) == _fund_name(want)
    g, w = comparable(got), comparable(want)
    if g == w:
        return True
    if field in PROSE:
        if g and w and (g in w or w in g):
            return True
        a, b = _words(str(got)), _words(str(want))
        return bool(a and b) and len(a & b) / len(a | b) >= 0.8
    return False


def _fund_name(text: Any) -> str:
    """A fund name with its class written one way: "(A)", "Class A" and "A Class" agree."""
    flat = re.sub(r"[^\w&]+", " ", comparable(text))
    return " ".join(word for word in flat.split() if word != "class")


def compare(reading: SheetReading, sheet: dict[str, Any]) -> list[dict[str, Any]]:
    """One row per field: its status, and how it compares with what we hold."""
    rows = []
    printed = re.sub(r"\s+", "", sheet.get("text", "")).casefold()
    for field in FIELDS:
        r = reading.get(field)
        want = expected(field, sheet)
        if field in IDENTITY and want is not None and re.sub(r"\s+", "", str(want)).casefold() not in printed:
            want = None
        if field == "risk_indicator_raw" and want is None and sheet["snapshot"].get("risk_indicator_1to5"):
            want = f"{sheet['snapshot']['risk_indicator_1to5']} of 5"
        got = r.value if r else None
        if got is None and want is None:
            outcome = "both_blank"
        elif got is None:
            outcome = "reference_only"
        elif want is None:
            outcome = "model_only"
        else:
            outcome = "agree" if agrees(field, got, want) else "differ"
        rows.append({
            "field": field,
            "status": r.status if r else "missing",
            "outcome": outcome,
            "model_value": got,
            "reference_value": want,
            "quote": r.quote if r else "",
            "page": r.page if r else "",
            "source": r.source if r else "",
            "reasons": "; ".join(r.reasons) if r else next((m.reason for m in reading.missing if m.field == field), ""),
        })
    return rows


# ── reporting ───────────────────────────────────────────────────────────────

def pct(part: int, whole: int) -> str:
    return f"{(100 * part / whole):5.1f}%" if whole else "   -  "


def report(model: str, results: list[dict[str, Any]], price: tuple[float, float] | None, out_dir: Path) -> None:
    sheets = [x for x in results if x["kind"] == "reference"]
    hand = [x for x in results if x["kind"] == "hand"]
    negs = [x for x in results if x["kind"] == "negative"]
    read = [x for x in sheets if x["reading"] is not None]
    failed = [x for x in results if x["error"]]

    print(f"\n{'=' * 78}\n{model}\n{'=' * 78}")
    print(f"sheets read {len(read)}/{len(sheets)}   errors {len(failed)}   "
          f"wrongly refused as not a fact sheet {sum(1 for x in read if not x['reading'].is_fact_sheet)}")
    if negs:
        refused = sum(1 for x in negs if x["reading"] is not None and not x["reading"].is_fact_sheet)
        print(f"not-a-fact-sheet documents refused {refused}/{len(negs)}")
    for x in failed:
        print(f"  error on {x['pdf'].name}: {x['error'][:110]}")

    rows = [dict(row, isin=x["snapshot"].get("isin", ""), sheet=x["pdf"].name,
                 fund=x["fund"].get("name", "")) for x in read if x["reading"].is_fact_sheet
            for row in compare(x["reading"], x)]
    if rows:
        status = Counter(r["status"] for r in rows)
        total = len(rows)
        print(f"\nfields {total}:  confirmed {pct(status['confirmed'], total)}   "
              f"check {pct(status['check'], total)}   missing {pct(status['missing'], total)}")
        for state in ("confirmed", "check"):
            mine = [r for r in rows if r["status"] == state and r["outcome"] in ("agree", "differ")]
            agree = sum(1 for r in mine if r["outcome"] == "agree")
            print(f"  {state:9} and comparable: {len(mine):4}   agree with reference {pct(agree, len(mine))}   "
                  f"differ {len(mine) - agree}")
        risky = [r for r in rows if r["status"] == "confirmed" and r["outcome"] == "differ"]
        print(f"\n  CONFIRMED BUT DIFFERS: {len(risky)}  <- values nobody would be pointed at; judge these first")

        print(f"\n{'field':28}{'confirmed':>10}{'check':>7}{'missing':>8}{'agree':>7}{'differ':>7}{'model only':>11}{'ref only':>9}")
        by_field: dict[str, Counter] = defaultdict(Counter)
        for r in rows:
            by_field[r["field"]][r["status"]] += 1
            by_field[r["field"]][r["outcome"]] += 1
        for field in FIELDS:
            c = by_field[field]
            print(f"{field:28}{c['confirmed']:>10}{c['check']:>7}{c['missing']:>8}{c['agree']:>7}"
                  f"{c['differ']:>7}{c['model_only']:>11}{c['reference_only']:>9}")

        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{model}-disagreements.csv"
        columns = ["sheet", "isin", "fund", "field", "status", "outcome", "model_value", "reference_value",
                   "quote", "page", "source", "reasons", "who_is_right"]
        with path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
            writer.writeheader()
            ordered = sorted((r for r in rows if r["outcome"] in ("differ", "model_only", "reference_only")),
                             key=lambda r: (r["status"] != "confirmed", r["outcome"] != "differ", r["sheet"], r["field"]))
            for r in ordered:
                writer.writerow(dict(r, who_is_right=""))
        print(f"\nfor you to judge: {path.relative_to(BACKEND)}  (confirmed-but-differs first)")

    if hand:
        print("\ntrusted check (hand-typed values):")
        for x in hand:
            if x["reading"] is None:
                print(f"  {x['pdf'].name}: not read ({x['error']})")
                continue
            hand_rows = [r for r in compare(x["reading"], x) if r["outcome"] in ("agree", "differ")]
            agree = sum(1 for r in hand_rows if r["outcome"] == "agree")
            print(f"  {x['pdf'].name:32} agree {agree}/{len(hand_rows)}")
            for r in hand_rows:
                if r["outcome"] == "differ":
                    print(f"      {r['field']:24} [{r['status']}] gemini {str(r['model_value'])[:34]!r}  hand {str(r['reference_value'])[:34]!r}")

    usage = [x["reading"] for x in results if x["reading"] is not None and x["reading"].input_tokens]
    if usage:
        n = len(usage)
        tin = sum(u.input_tokens for u in usage) / n
        tout = sum(u.output_tokens for u in usage) / n
        tthink = sum(u.thinking_tokens for u in usage) / n
        print(f"\ntokens per sheet (mean of {n}): input {tin:,.0f}   output {tout:,.0f}   thinking {tthink:,.0f}")
        if price:
            per = (tin * price[0] + (tout + tthink) * price[1]) / 1_000_000
            print(f"cost per sheet at ${price[0]}/${price[1]} per 1M: ${per:.4f}   "
                  f"(1,000 uploads ≈ ${per * 1000:,.2f})")
    paid = sum(1 for x in results if x["paid"])
    print(f"model calls made this run: {paid} (the rest came from the cache)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--models", nargs="+", default=[os.getenv("FUND_EXTRACT_MODEL", "gemini-3.8-flash")])
    parser.add_argument("--limit", type=int, default=None, help="only the first N sheets")
    parser.add_argument("--workers", type=int, default=4, help="sheets read at once")
    parser.add_argument("--thinking", choices=["low", "medium", "high"], default=None)
    parser.add_argument("--fresh", action="store_true", help="ignore the cache and ask again")
    parser.add_argument("--price", nargs=2, type=float, metavar=("IN", "OUT"),
                        help="price per 1M input and output tokens, for every model in this run")
    args = parser.parse_args()

    documents = sheets_with_reference()
    if args.limit:
        documents = documents[: args.limit]
    documents += sheets_hand_entered() + negatives(CACHE / "negatives")
    print(f"{len(documents)} documents: {sum(d['kind'] == 'reference' for d in documents)} sheets, "
          f"{sum(d['kind'] == 'hand' for d in documents)} hand-entered, "
          f"{sum(d['kind'] == 'negative' for d in documents)} not fact sheets")

    for model in args.models:
        reader = GeminiFactsheetReader(model=model, thinking_level=args.thinking)
        results: list[dict[str, Any]] = []
        started = time.monotonic()
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            futures = {pool.submit(read_one, reader, d["pdf"], args.fresh): d for d in documents}
            for done, future in enumerate(as_completed(futures), 1):
                d = futures[future]
                reading, paid, error = future.result()
                text = pdf_text(d["pdf"].read_bytes()) if d["kind"] != "negative" else ""
                results.append(dict(d, reading=reading, paid=paid, error=error, text=text))
                print(f"\r  {model}: {done}/{len(documents)} read", end="", flush=True)
        print(f"  ({time.monotonic() - started:.0f}s)")
        price = tuple(args.price) if args.price else PRICES.get(model)
        report(model, results, price, CACHE / "reports")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
