"""Read a fact sheet from the command line.

    venv/bin/python scripts/curation/read_factsheet.py https://satrix.co.za/fund/mdd/STX40
    venv/bin/python scripts/curation/read_factsheet.py --hosts

A thin wrapper over `src/funds/extract`, which is what the admin form uses. The
patterns live there and only there: when this was two standalone scripts with
their own copies, the two could drift, and the figures a curator saw at the
terminal would stop being the figures a reviewer saw in the form.

Fields the template declines are printed as REFUSED with the reason. That is not
a failure — for a manager who draws the risk rating rather than printing it,
refusing is the correct and only safe answer.
"""

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

from src.funds.extract import FetchError, extract_from_url, readable_hosts  # noqa: E402


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0

    if argv[0] == "--hosts":
        print("Managers this can read:")
        for host in readable_hosts():
            print(f"  {host}")
        return 0

    exit_code = 0
    for url in argv:
        print(f"\n=== {url}")
        try:
            extraction = extract_from_url(url)
        except FetchError as exc:
            print(f"  !! {exc}")
            exit_code = 1
            continue

        print(f"  [{extraction.template}]")
        for field, value in extraction.fields.items():
            print(f"  {field:26s} {value}")
        for unresolved in extraction.unresolved:
            print(f"  {unresolved.field:26s} REFUSED — {unresolved.reason}")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
