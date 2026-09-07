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

ASK = """Give me each field as one line:

    field_name = value        <- the exact line on the sheet you read it from

Then, separately, list every field the sheet does not state, with a one-line
reason. Do not fill a field in from general knowledge about the fund or the
manager: this is a transcription of one document."""


def main() -> int:
    rules = SYSTEM.replace(TOOL_LINE, "").rstrip()
    fields = _instruction().split("For the ASISA classification")[0].rstrip()
    print(f"{rules}\n\n{fields}\n\n{ASK}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
