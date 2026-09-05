"""Read Satrix fact sheets so their figures can be transcribed into the seed.

Satrix keys its Minimum Disclosure Documents by JSE code at a stable URL, so a
batch is one request per fund with no index page to scrape first.

Two things this exists to get right:

*The risk profile is a graphic.* Satrix draws a five-step scale and fills in the
step that applies; the text layer contains all five words whatever the rating.
Text-matching it therefore reads either nothing or the wrong step - which is
exactly what happened, and is why the Satrix 40 ETF was first recorded as
publishing no rating when its sheet plainly says AGGRESSIVE. The block is
cropped to an image here and read by eye.

*Satrix words its scale by temperament, not by risk:* CONSERVATIVE, CAUTIOUS,
MODERATE, MODERATE-AGGRESSIVE, AGGRESSIVE. "Conservative" is the LOWEST step -
the opposite end from what the same word means as a user's risk tolerance.
``src/funds/risk_scale.py`` maps them.

    python satrix_mdd.py STX40 STXILB STXPRO

Anything it cannot find prints as MISSING. A fund whose ISIN or ASISA category
cannot be read off its own sheet is dropped rather than guessed at.

Needs requirements-dev.txt (pypdf, pymupdf).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pymupdf
from pypdf import PdfReader

CACHE = Path(__file__).resolve().parent / ".cache" / "satrix"

PATTERNS = {
    "as_of": r"Minimum Disclosure Document\s*\n\s*(\d{1,2} \w+ 20\d\d)",
    "isin": r"ISIN Code\s*([A-Z]{2}[A-Z0-9]{9}\d)",
    "jse_code": r"JSE Code\s*([A-Z0-9]+)",
    "asisa": r"ASISA Classification\s*(.{4,60}?)(?:\n[A-Z]{2,}|\nInception|\nIncome|$)",
    "benchmark": r"\nBenchmark\s*([^\n]{2,70})",
    # Where a fee has been cut the sheet prints two TER rows: the historic one
    # and one marked effective from a date. The TIC row already reflects the
    # effective TER, so that is the internally consistent pair to transcribe.
    "ter_effective": r"Effective \d{2} \w{3} 20\d\d\s*\n?\s*([\d.]+)",
    "ter": r"Total Expense Ratio \(TER\)\s*([\d.]+)",
    "tc": r"Transaction cost \(TC\)\s*([\d.]+)",
    "tic": r"Total Investment Charge \(TIC\)\s*([\d.]+)",
    "distribution": r"Distribution Frequency\s*([^\n]{2,40})",
    "inception": r"Inception Date\s*(\d{1,2} \w+ 20\d\d)",
}


def fetch(code: str) -> Path | None:
    """Download this fund's current sheet, or reuse the cached copy."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{code}.pdf"
    if path.exists() and path.read_bytes()[:4] == b"%PDF":
        return path
    subprocess.run(["curl", "-sL", "-m", "60", "-o", str(path),
                    f"https://satrix.co.za/fund/mdd/{code}"], check=False, timeout=120)
    # Some hosts answer a bad path with 200 and an HTML error page, so the magic
    # bytes rather than the status code decide whether this is a fact sheet.
    if path.exists() and path.read_bytes()[:4] == b"%PDF":
        return path
    print(f"  !! {code}: no fact sheet at the code-keyed URL")
    return None


def render_risk(code: str, path: Path) -> None:
    """Crop the RISK PROFILE block so the marked step can be read by eye."""
    page = pymupdf.open(str(path))[0]
    found = page.search_for("RISK PROFILE")
    if not found:
        print("  risk block     NOT FOUND on page 1 - read the sheet by hand")
        return
    anchor = found[0]
    clip = pymupdf.Rect(anchor.x0 - 10, anchor.y0 - 5,
                        min(anchor.x0 + 320, page.rect.x1), anchor.y0 + 120)
    out = path.with_name(f"{code}_risk.png")
    page.get_pixmap(clip=clip, dpi=200).save(str(out))
    print(f"  risk image     {out}")


def main() -> None:
    codes = sys.argv[1:]
    if not codes:
        raise SystemExit(__doc__)
    for code in codes:
        print(f"\n=== {code}")
        path = fetch(code)
        if not path:
            continue
        text = "\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)
        text = re.sub(r"[ \t]+", " ", text)
        for field, pattern in PATTERNS.items():
            found = re.search(pattern, text, re.I | re.S)
            print(f"  {field:14s} {' '.join(found.group(1).split()) if found else 'MISSING'}")
        render_risk(code, path)


if __name__ == "__main__":
    main()
