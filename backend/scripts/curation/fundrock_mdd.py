"""Read FundRock fact sheets so their figures can be transcribed into the seed.

FundRock is the ManCo for a long list of boutique managers - 36ONE, Anchor,
Cartesian, Harvard House, PortfolioMetrix, Sesfikile and others - and issues
every one of their Minimum Disclosure Documents on a single template. One set of
patterns therefore covers around 580 fund classes, which is what makes a
per-ManCo reader worth writing at all.

    python fundrock_mdd.py "Cartesian Capital/Cartesian FR Money Market Fund (A) CABFA.pdf"
    python fundrock_mdd.py --index          # list what the index page offers

Two traps this handles:

*Soft 404s.* The index page carries literal spaces in its links, and the host
answers an unencoded space with 200 and an HTML page rather than 404. The path
is percent-encoded, and the magic bytes rather than the status code decide
whether a fact sheet came back.

*"JSE Code" does not mean listed.* FundRock prints a JSE code on unit trusts
too, so it cannot be used to tell a unit trust from an ETF; the seed uses the
presence of a Yahoo ``.JO`` price symbol instead.

Anything it cannot find prints as MISSING, and a fund whose ISIN or ASISA
category cannot be read off its own sheet is dropped rather than guessed at.

Needs requirements-dev.txt (pypdf).
"""
from __future__ import annotations

import html
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

from pypdf import PdfReader

BASE = "https://www.bcis.co.za/upload/factsheet_categories_folders/funds/"
INDEX = "https://www.bcis.co.za/boutique-collective-investments/funds"
CACHE = Path(__file__).resolve().parent / ".cache" / "fundrock"

PATTERNS = {
    "as_of": r"MINIMUM DISCLOSURE DOCUMENT \| (\d{1,2} [A-Z]+ 20\d\d)",
    "isin": r"ISIN Number:\s*([A-Z]{2}[A-Z0-9]{9}\d)",
    "jse_code": r"JSE Code:\s*([A-Z0-9]+)",
    "asisa": r"ASISA Category:\s*([^\n]{4,60})",
    "benchmark": r"Fund Benchmark:\s*([^\n]{2,70})",
    "ter": r"Total Expense Ratio \(TER\):[^\n]*?:\s*([\d.]+)%",
    "tc": r"Transaction Cost:[^\n]*?:\s*([\d.]+)%",
    "tic": r"Total Investment Charge:[^\n]*?:\s*([\d.]+)%",
    "minimum": r"Minimum Investment Amount:\s*([^\n]{1,40})",
    "size": r"Portfolio Value:\s*R\s*([\d  ]+)",
    # FundRock prints the rating as text as well as drawing it, and abbreviates
    # its own scale to Low-Mod / Mod / Mod-High. risk_scale.normalize reads both.
    "risk_raw": r"\n(Low|Low\s*-\s*Mod\w*|Moderate|Mod|Moderate\s*-\s*High|High)\s*Risk\b",
    "distribution": r"Date of Income Payment:\s*([^\n]{2,60})",
    "objective": r"INVESTMENT OBJECTIVE\s*\n(.{20,400}?)\n(?:INVESTMENT POLICY|INVESTMENT STRATEGY)",
}


def _encoded(relative: str) -> str:
    return BASE + quote(relative)


def fetch(relative: str) -> Path | None:
    """Download one fact sheet by its path under the funds folder."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (re.sub(r"[^A-Za-z0-9]+", "_", relative)[-80:] + ".pdf")
    if path.exists() and path.read_bytes()[:4] == b"%PDF":
        return path
    subprocess.run(["curl", "-sL", "-m", "60", "-o", str(path), _encoded(relative)],
                   check=False, timeout=120)
    if path.exists() and path.read_bytes()[:4] == b"%PDF":
        return path
    print(f"  !! {relative}: not a PDF (soft 404?)")
    return None


def index() -> list[tuple[str, str, str]]:
    """Every (fund name, MDD url, sheet date) the index page lists."""
    CACHE.mkdir(parents=True, exist_ok=True)
    page = CACHE / "index.html"
    if not page.exists():
        subprocess.run(["curl", "-sL", "-m", "90", "-o", str(page), INDEX],
                       check=True, timeout=180)
    text = page.read_text(encoding="utf-8", errors="replace")
    listed, seen = [], set()
    for link in re.finditer(r'href="(?P<url>[^"]*?/funds/[^"]*?\.pdf)"[^>]*>(?P<name>[^<]{4,120})<',
                            text, re.I):
        name = html.unescape(link.group("name")).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        window = text[link.end(): link.end() + 400]
        dated = re.search(r"(\d{1,2} [A-Z][a-z]+ 20\d\d)", window)
        listed.append((name, html.unescape(link.group("url")).strip(),
                       dated.group(1) if dated else "?"))
    return listed


def main() -> None:
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    if args[0] == "--index":
        wanted = [a.lower() for a in args[1:]]
        listed = index()
        print(f"{len(listed)} fund classes on the index page\n")
        for name, url, date in listed:
            if not wanted or any(w in name.lower() for w in wanted):
                print(f"{date:16s} {name}\n{'':16s} {url}")
        return

    for relative in args:
        print(f"\n=== {relative}")
        path = fetch(relative)
        if not path:
            continue
        text = "\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)
        text = re.sub(r"[ \t]+", " ", text)
        for field, pattern in PATTERNS.items():
            found = re.search(pattern, text, re.I | re.S)
            print(f"  {field:14s} {' '.join(found.group(1).split()) if found else 'MISSING'}")
        term = re.search(r"Term\s*([\d\-+ ]*years[^\n]{0,80})", text, re.I)
        print(f"  term_scale     {' '.join(term.group(1).split()) if term else 'MISSING'}")


if __name__ == "__main__":
    main()
