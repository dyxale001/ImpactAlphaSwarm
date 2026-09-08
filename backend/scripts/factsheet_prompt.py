"""Print the fact-sheet reading rules as a prompt to paste into a chat.

    venv/bin/python scripts/factsheet_prompt.py            # to read
    venv/bin/python scripts/factsheet_prompt.py | xclip -selection clipboard

For recording a sheet by hand: attach the PDF to a Claude conversation, paste
this, and type the answers into the admin form. It is the same rulebook the
in-app reader uses — generated from `FIELDS` and `SYSTEM` rather than written out
again, so a rule learned the hard way cannot end up in one and not the other.
Every rule in here was added because a real sheet broke something.

## What this route does NOT give you, and it is the whole difference

The in-app reader must quote the line it read each value from, and the quote is
then checked against the PDF's own text layer. A value whose quote is not on the
page is thrown away. A chat cannot do that check, so the answers arrive with no
mechanical grounding at all.

That is not theoretical. On the first live run against a real Allan Gray sheet
the reader reported `min_lump_sum = 46000`, quoting "Maximum lump sum per
investor account R46 000" — the fund is tax-free, so SARS caps contributions and
the sheet prints a *maximum*. The number was real and the meaning was inverted.
The in-app path now refuses it; a chat will hand it to you looking exactly as
confident as everything else.

**So: keep the sheet open beside the answer, and check anything that reads like
a threshold, a fee column, or a date.** The rules below tell the model to quote
its line for every value; that quote is what you check against.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from src.funds.extract.llm import SYSTEM, _instruction  # noqa: E402

# The tool-calling instruction is meaningless in a chat, and the ASISA list is
# long enough to bury the rules — the admin form offers those as a dropdown.
TOOL_LINE = "Call `record_factsheet` exactly once."

# The four fields that are a list rather than a figure. Not part of the reader's
# FIELDS — it returns one value per field — but they are boxes on the same form,
# so a person recording a sheet by hand needs them asked for in the same pass.
LISTS = """LISTS — give each under its own heading, one "label = number" per line:

  WHAT IT HOLDS      the asset allocation. Percentages must account for the
                     whole fund. If it is drawn as a chart with no figures in
                     the text, say so — do not read a picture.
  TOP HOLDINGS       the largest positions as listed. These do NOT add to 100;
                     they are the top of a longer list.
  PAST RETURNS       the ANNUALISED row, labelled 1y / 3y / 5y / 10y /
                     inception. Sheets print cumulative and annualised side by
                     side — say which one you took.
  PAID OUT           distributions, as "YYYY-MM = cents per unit". Skip a month
                     printed as a dash; keep one printed as 0.00, because a
                     declared nothing and no declaration are different things."""

# Optional: let the chat fill gaps from elsewhere, tagged so a person can see
# which values are the manager's own and which are not.
#
# The split is not squeamishness. An ISIN is a permanent identifier, so finding
# one the PDF omitted is retrieval. A fee, a NAV or a return is dated AND
# class-specific — the Allan Gray sheet is Class A and the platform lists others
# — and the fund page shows every figure under the sheet's as-at date, which
# asserts it came off that document. A researched figure silently breaks that.
RESEARCH = """WHEN A FIELD IS NOT ON THE SHEET, you may look it up — but tag
every value so I can see where it came from, and never blend the two:

    [SHEET]      quoted from the document, with the line
    [RESEARCHED] found elsewhere, with the URL and what that source says
    [NOT FOUND]  neither

WHAT YOU MAY RESEARCH — identifiers and things that do not change:
  ISIN · JSE code · fund name · manager brand · management company ·
  vehicle (unit trust / ETF) · inception date · whether it tracks an index ·
  whether it is tax-free eligible · the manager's fund page URL ·
  ASISA category IF the sheet omits it

WHAT YOU MUST NOT RESEARCH — leave these [NOT FOUND] if the sheet is silent:
  TER · transaction cost · TIC · management fee · fee period · NAV · NAV date ·
  fund size · returns · strongest/weakest year · risk rating · risk level ·
  allocation · top holdings · distributions · minimums

  Every one of those is DATED and CLASS-SPECIFIC. The sheet is one share class
  at one month end; a figure from a web page may be a different class or a
  different month, and it would be shown to users under this sheet's date as
  though the manager had published it. If the sheet does not state it, the honest
  answer is that we do not have it.

For anything researched, say plainly how confident you are that the source
describes THIS fund and THIS share class — same name is not the same class."""

ASK = """Give me each field as one line:

    field_name = value        <- the exact line on the sheet you read it from

Then, separately, list every field the sheet does not state, with a one-line
reason. Do not fill a field in from general knowledge about the fund or the
manager: this is a transcription of one document."""


def main() -> int:
    research = "--research" in sys.argv[1:]
    rules = SYSTEM.replace(TOOL_LINE, "").rstrip()
    fields = _instruction().split("For the ASISA classification")[0].rstrip()
    parts = [rules, fields, LISTS] + ([RESEARCH] if research else []) + [ASK]
    print("\n\n".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
