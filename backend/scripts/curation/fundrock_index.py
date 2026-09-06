"""List the fact sheets FundRock publishes, to find candidates worth seeding.

    venv/bin/python scripts/curation/fundrock_index.py income cautious
    venv/bin/python scripts/curation/fundrock_index.py            # everything

Discovery, not extraction — a separate job from reading a sheet, which is what
`read_factsheet.py` does. FundRock issues for around thirty boutique managers
from one index page, so this is where most of the catalogue's candidates come
from: roughly 580 fund classes, each with a direct link and a sheet date.

Two things worth knowing before trusting the list:

*Not every fund here uses FundRock's template.* Anchor issues its own, and its
sheet carries no ISIN at all. Those cannot be read automatically and are dropped
rather than guessed at, so expect a hit rate rather than a sweep.

*The links carry literal spaces*, which these hosts answer with 200 and an HTML
page rather than a 404. `read_factsheet.py` encodes them and checks the bytes.
"""

import html
import re
import subprocess
import sys
from pathlib import Path

INDEX = "https://www.bcis.co.za/boutique-collective-investments/funds"
CACHE = Path(__file__).resolve().parent / ".cache" / "fundrock" / "index.html"


def listing() -> list[tuple[str, str, str]]:
    """Every (fund name, sheet url, sheet date) the index page offers."""
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    if not CACHE.exists():
        subprocess.run(["curl", "-sL", "-m", "90", "-o", str(CACHE), INDEX], check=True, timeout=180)
    text = CACHE.read_text(encoding="utf-8", errors="replace")

    found, seen = [], set()
    for link in re.finditer(
        r'href="(?P<url>[^"]*?/funds/[^"]*?\.pdf)"[^>]*>(?P<name>[^<]{4,120})<', text, re.I
    ):
        name = html.unescape(link.group("name")).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        window = text[link.end() : link.end() + 400]
        dated = re.search(r"(\d{1,2} [A-Z][a-z]+ 20\d\d)", window)
        found.append((name, html.unescape(link.group("url")).strip(), dated.group(1) if dated else "?"))
    return found


def main(argv: list[str]) -> int:
    wanted = [a.lower() for a in argv]
    funds = listing()
    print(f"{len(funds)} fund classes on the index page\n")
    for name, url, date in funds:
        if not wanted or any(word in name.lower() for word in wanted):
            print(f"{date:16s} {name}\n{'':16s} {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
