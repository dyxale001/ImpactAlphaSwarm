"""The availability boundary, read from the list EasyEquities publishes.

The catalogue is bounded to funds a user can actually buy (decision 6). For
JSE-listed instruments that boundary is checkable rather than assumed:
EasyEquities publishes its whole instrument list as one workbook, with an ISIN
and a ticker per row. Before seeding an ETF, look it up here.

That check has already earned its keep — the Satrix SA Bond ETF (STXGOV) reads
like an obvious inclusion and is not on the list, so it was seeded and then
removed.

There is no equivalent file for unit trusts; that side of the boundary still
rests on their fund pages, one at a time.

    python easyequities_instruments.py                 # summary
    python easyequities_instruments.py ZAE000027108    # look up ISINs/names

The workbook is one sheet with shared strings and no formulas, so it is read
with the standard library rather than adding a spreadsheet dependency.
"""
from __future__ import annotations

import html
import re
import subprocess
import sys
import zipfile
from pathlib import Path

URL = "https://www.easyequities.co.za/hubfs/Equity/EasyEquitiesInstruments.xlsx"
CACHE = Path(__file__).resolve().parent / ".cache" / "EasyEquitiesInstruments.xlsx"


def download(force: bool = False) -> Path:
    """Fetch the workbook, reusing the cached copy unless asked not to."""
    if CACHE.exists() and CACHE.stat().st_size > 10_000 and not force:
        return CACHE
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sL", "-m", "90", "-A", "Mozilla/5.0", "-o", str(CACHE), URL],
                   check=True, timeout=180)
    if not zipfile.is_zipfile(CACHE):
        raise SystemExit(f"{URL} did not return a workbook - the published path may have moved")
    return CACHE


def rows(path: Path) -> list[dict[str, str]]:
    """Every row as a {column heading: value} mapping."""
    book = zipfile.ZipFile(path)
    shared = [html.unescape(re.sub(r"<[^>]+>", "", m.group(1)))
              for m in re.finditer(r"<si>(.*?)</si>",
                                   book.read("xl/sharedStrings.xml").decode("utf-8"), re.S)]

    raw: list[dict[str, str]] = []
    sheet = book.read("xl/worksheets/sheet1.xml").decode("utf-8")
    for row in re.finditer(r"<row[^>]*>(.*?)</row>", sheet, re.S):
        cells: dict[str, str] = {}
        for cell in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(.*?)</c>', row.group(1), re.S):
            column, attrs, body = cell.group(1), cell.group(2), cell.group(3)
            value = re.search(r"<v>(.*?)</v>", body, re.S)
            if not value:
                continue
            text = value.group(1)
            cells[column] = html.unescape(shared[int(text)] if 't="s"' in attrs else text)
        raw.append(cells)

    if not raw:
        return []
    columns = sorted({c for r in raw for c in r}, key=lambda c: (len(c), c))
    headings = {c: raw[0].get(c, c) for c in columns}
    return [{headings[c]: r.get(c, "") for c in columns} for r in raw[1:]]


def main() -> None:
    listed = rows(download())
    exchanges: dict[str, int] = {}
    for row in listed:
        exchanges[row.get("Exchange", "")] = exchanges.get(row.get("Exchange", ""), 0) + 1
    print(f"{len(listed)} instruments")
    for exchange, count in sorted(exchanges.items(), key=lambda kv: -kv[1]):
        print(f"  {count:5d}  {exchange or '(blank)'}")

    for needle in sys.argv[1:]:
        matches = [r for r in listed if needle.lower() in " ".join(r.values()).lower()]
        print(f"\n--- {needle}: {len(matches)} match(es) ---")
        for row in matches:
            print(f"  {row.get('ISIN Code',''):16s} {row.get('Ticker',''):9s} "
                  f"{row.get('Exchange',''):10s} {row.get('Instrument Name','')}")
        if not matches:
            print("  NOT on the list - outside the boundary, do not seed it")


if __name__ == "__main__":
    main()
