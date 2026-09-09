"""Print the fact-sheet reading rules as a prompt to paste into a chat.

    venv/bin/python scripts/factsheet_prompt.py               # the whole form
    venv/bin/python scripts/factsheet_prompt.py --sheet-only  # a later sheet
    venv/bin/python scripts/factsheet_prompt.py --research    # may look things up
    venv/bin/python scripts/factsheet_prompt.py | xclip -selection clipboard

For adding a fund by hand: attach the PDF to a Claude conversation, paste this,
and type the answers into the admin form. It asks for **every field on the
add-a-fund form** — what identifies the fund as well as its first fact sheet,
because those are one screen and one save.

`--sheet-only` drops the identity half, which is what recording a later monthly
sheet against a fund that already exists needs. Every rule in here was added
because a real sheet broke something, so the list is worth keeping even though
nothing in the app reads a sheet any more.

The rules used to be generated from the in-app reader's own prompt, so a lesson
learned the hard way could not end up in one and not the other. That reader has
been removed — funds are entered by hand — and the rules are written out below
instead, exactly as it rendered them.

## What this route does NOT give you, and it is the whole difference

The removed reader had to quote the line it read each value from, and that quote
was checked against the PDF's own text layer; a value whose quote was not on the
page was thrown away. A chat cannot do that check, so the answers arrive with no
mechanical grounding at all.

That is not theoretical. On the first live run against a real Allan Gray sheet
the reader reported `min_lump_sum = 46000`, quoting "Maximum lump sum per
investor account R46 000" — the fund is tax-free, so SARS caps contributions and
the sheet prints a *maximum*. The number was real and the meaning was inverted.
That path refused it once the rule was written; a chat will hand it to you
looking exactly as confident as everything else.

**So: keep the sheet open beside the answer, and check anything that reads like
a threshold, a fee column, or a date.** The rules below tell the model to quote
its line for every value; that quote is what you check against.
"""

from __future__ import annotations

import sys
from pathlib import Path


# The reading rules, as the removed in-app reader rendered them. Copied
# verbatim rather than reworded: each numbered rule is a specific sheet that
# once produced a confident wrong answer, and rule 5b is the arithmetic check
# that caught a Satrix fee the printed column got wrong.
#
# The tool-calling line the reader ended on is gone — it was an instruction to
# call a function, which is meaningless in a chat.
RULES = """You transcribe South African fund fact sheets (Minimum Disclosure Documents) for a catalogue that shows every figure next to the document it came from. A person checks your reading before it is saved.

Your job is transcription, not analysis. Rules, in order of importance:

1. NEVER GUESS. If a field is not printed on the sheet, or you are not certain which of two printed values it is, leave it out of the answers and put it in the NOT STATED list at the end, with a one-sentence reason a person can act on. A blank field gets answered by a human; a plausible wrong value gets approved.

2. QUOTE THE LINE. Every value needs the line it came from, after the arrow, copied exactly as the sheet prints it - long enough to locate on the page, no longer than a line or two. I check the value against that quote, so a quote that paraphrases the sheet to look tidy defeats the only check there is.

3. REFUSE WHAT IS ONLY A PICTURE. Many managers draw the risk profile as a five-step scale with the applicable step shaded, and draw the asset allocation as a pie or bar chart. If a value exists only as a graphic — with no line of text stating it — refuse it. Do not read a risk rating off a scale whose every label is printed regardless of the rating.

4. COMPUTE NOTHING. Do not annualise, total, average, or infer. Do not derive a category from an objective. The single exception is stated in the field list: the NAV is recorded in cents, so a price printed in rand is multiplied by 100.

5. FEES COME FROM ONE COLUMN. Many sheets print the expense ratio, transaction cost, total investment charge and management fee twice, under 1-Year and 3-Year headings, and the figures differ. Take the 1-YEAR column and set `fee_period` to '1y'. If the sheet prints only one unlabelled figure, take it and set `fee_period` to the period the sheet's own notes describe — and if the notes do not say, refuse `fee_period` rather than assuming.

5a. A STATED FEE REDUCTION BEATS THE PRINTED COLUMN. Where a sheet carries a note like "The Total Expense Ratio (TER) was reduced to 0.25% effective 01 October 2025", the historic column is out of date and the reduced figure is the one in force. Take the reduced figure and quote the note.

5b. CHECK YOUR FEES AGAINST THE SHEET'S OWN TOTAL. The total investment charge is the expense ratio plus the transaction cost, and all three are printed. If the TER and TC you picked do not add up to the printed TIC, you have taken a figure from the wrong row or the wrong column — go back and look again. This is not a calculation to report, it is a way to catch yourself.

6. THE BEST AND WORST YEAR ARE NOT ONE STATISTIC. Some sheets publish the highest and lowest ANNUAL ROLLING return over separate one-year periods; others publish the highest and lowest CALENDAR YEAR since inception. Read the heading and set `return_extremes_basis` accordingly. If you cannot tell which, refuse all three fields."""

# The fields to ask for. The ASISA classification is deliberately absent: the
# list of categories is long enough to bury the rules above, and the admin form
# offers it as a dropdown anyway.
FIELDS = """THE FACT SHEET - the dated figures. Every one of these belongs to
the sheet's own as-at date, so they come from THIS document and no other. Where
the sheet is silent, say so rather than reaching for a figure you know:

- as_of: the sheet's own as-at date, as YYYY-MM-DD
- risk_indicator_raw: the risk rating in the sheet's OWN WORDS, and only if it is printed as text you can quote — e.g. FundRock prints 'RISK PROFILE Moderate - High Risk'. REFUSE it if the rating is shown by shading or colouring one step of a scale, because every step's label is printed whatever the rating and there is no line of text that states the answer
- risk_indicator_1to5: that same rating as a number on our scale: 1 Low, 2 Low to Moderate, 3 Moderate, 4 Moderate to High, 5 High. Give it ONLY where you gave risk_indicator_raw, and map the sheet's own words rather than your impression of the fund: 'Moderate - High Risk' is 4. A house that words its scale by temperament needs care, because Satrix runs CONSERVATIVE / CAUTIOUS / MODERATE / MODERATE-AGGRESSIVE / AGGRESSIVE where 'conservative' is the LOWEST step, the opposite of what the same word means as a saver's own risk tolerance
- benchmark: the benchmark index the fund measures itself against
- objective: the fund's stated objective, in the manager's own words
- ter: total expense ratio, as a percentage
- tc: transaction cost, as a percentage
- tic: total investment charge, as a percentage
- annual_management_fee: the manager's own annual fee (may be labelled 'Annual Management Fee' or 'Annual Service Fee'), as a percentage
- fee_period: '1y' or '3y' — which column the four fee figures above were taken from
- fund_size_zar: the fund's size in rand as a plain number. 'Portfolio Value R362 million' is 362000000
- nav_cpu: the net asset value per unit, IN CENTS. A sheet printing 'NAV Price R9.23' is 923; a sheet printing '183.63 cents' is 183.63
- nav_date: the date that NAV was struck, as YYYY-MM-DD
- inception_date: the date the fund launched, as YYYY-MM-DD
- distribution_frequency: how often the fund distributes income
- recommended_min_term_years: the minimum term in years, only if the sheet states a NUMBER
- min_lump_sum: the MINIMUM lump sum in rand, if stated. A tax-free fund prints a MAXIMUM instead, because SARS caps contributions — leave this out rather than recording a cap as a minimum
- min_debit_order: the MINIMUM monthly debit order in rand, if stated. As above: a maximum is not a minimum
- return_high_12m: the highest annual return the sheet publishes
- return_low_12m: the lowest annual return the sheet publishes. Printed in brackets when negative: (4.49) is -4.49
- return_extremes_basis: 'rolling_12m' if the heading says rolling or non-overlapping one-year periods; 'calendar_year' if it says calendar year
- risk_narrative: the manager's prose describing the fund's RISK, from the sheet's risk block, quoted. Only if that block is written as sentences. Leave it out if the risk profile is only a diagram, and never repeat the investment objective here — they are different fields and a reader is shown both
- horizon_words: the manager's wording about how long to hold the fund, quoted
- portfolio_manager: who manages the portfolio
- regulation_28: true or false, only if the sheet states Regulation 28 compliance"""

# The four fields that are a list rather than a figure. Not part of the reader's
# FIELDS — it returns one value per field — but they are boxes on the same form,
# so a person recording a sheet by hand needs them asked for in the same pass.
# The "What identifies the fund" half of the form. Not on the old reader's list,
# which only ever filled a fact sheet: adding a fund was two screens then, and is
# one now, so a prompt that stops at the sheet leaves half the form empty.
#
# `asisa_geography` and `asisa_asset_class` are deliberately NOT asked for. The
# form fills both from whichever category is picked, off one record, so the three
# columns cannot disagree. Asking a model for them invites exactly that.
IDENTITY = """IDENTITY - what the fund IS. These are separate from the figures
below, and most are on the sheet's cover or in its small print:

  isin                 the twelve-character ISIN
  name                 the fund's name as the sheet prints it, share class
                       included: "Allan Gray Balanced Fund - Class A"
  fund_house           the brand a reader would recognise: "Allan Gray"
  manco                the management company in the legal small print, which
                       is often longer and different: "Allan Gray Unit Trust
                       Management (RF) Proprietary Limited"
  vehicle              exactly one of: unit_trust  |  etf
  asisa_category       one of the fifteen names listed at the bottom, copied
                       EXACTLY. The sheet usually prints an abbreviation ("SA
                       Multi Asset Income"); give me the full canonical name
  jse_code             the JSE or fund code. REQUIRED if vehicle is etf. A unit
                       trust may print one too, for dealing - that is not a
                       listing, so record it without changing the vehicle
  yahoo_symbol         ETFs ONLY, as ticker + ".JO": STX40.JO. Leave BLANK for a
                       unit trust - it is not traded, so it has no price feed
  mdd_page_url         the manager's own page for this fund, not the PDF link
  is_index_tracker     true or false: does the fund track an index
  tfsa_eligible        true or false, only if the sheet or the manager's page
                       says so. Leave blank rather than reasoning it out

  curation_rule        NOT from the sheet. One line on why this fund is in our
                       catalogue. The stated rule is that these are funds from
                       managers most South African investors will recognise and
                       that are available on EasyEquities, so say that in the
                       fund's own terms. Do NOT claim the availability was
                       verified - a person checks that on the platform."""


# What the form will refuse, stated so the answer can be checked before it is
# typed rather than after a 422. Every one of these is a real validator.
CHECKS = """BEFORE YOU ANSWER, check these. The form refuses a row that fails
any of them, and it lists every problem at once rather than the first:

  TER + TC = TIC          all three are printed. If yours do not add up you have
                          taken one from the wrong row or column. Go back
  risk words vs level     the 1-5 level must agree with the words you quoted:
                          1 Low - 2 Low to Moderate - 3 Moderate -
                          4 Moderate to High - 5 High. A sheet saying
                          "Moderate - High Risk" is 4, not 3 and not 5
  fee_period              required as soon as ANY fee is recorded
  return_extremes_basis   required if either the strongest or weakest year is
                          recorded. Refuse all three if the heading is unclear
  allocation totals       if you give an allocation it must account for the
                          whole fund, 95-105%. A partial breakdown is refused
  nav in cents            "R9.23" is 923. A rand figure left unconverted is a
                          hundredfold error that no range check can catch
  distributions           keyed YYYY-MM, cents per unit
  as_of                   must be a real, past, recent date. It is what dates
                          every other figure on the row
  etf vs unit_trust       an etf needs jse_code AND yahoo_symbol; a unit trust
                          must have NO yahoo_symbol"""


LISTS = """LISTS — give each under its own heading, one "label = number" per line:

  WHAT IT HOLDS      the asset allocation. Percentages must account for the
                     whole fund. Usually drawn as a pie or bar chart: read it
                     off the picture, and say so, because a chart's text layer
                     often lists the labels and the numbers as two separate
                     lists whose pairing is a guess.
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

ASK = """HOW TO ANSWER. Give me every field as one line, grouped under the
three headings above, in the order they are listed:

    field_name = value        <- the exact line on the sheet you read it from

Then, separately, list every field the sheet does not state, with a one-line
reason each. Do not fill a field in from general knowledge about the fund or
the manager: this is a transcription of one document.

A field you are unsure of goes in the second list, not the first. I am typing
these into a form one at a time, so a blank I have to go and look up costs me a
minute; a confident wrong number costs me a fund that misprices itself on a
page claiming the manager published it."""


def asisa_block() -> str:
    """The fifteen category names, generated rather than written out.

    Generated because the category is a closed vocabulary the form offers as a
    dropdown: a near-miss is not a typo but a different real category, and
    "Variable Term" against "Variable Term ILB" is the case that proves it. A
    list copied into this file would drift from `asisa.py` the first time one
    changed, and the drift would look like a model error.

    Last, on purpose. It is long enough to bury the rules above it, which is why
    the reader this replaced never sent it at all.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from src.funds.asisa import ASISA, ASISA_VERSION

    lines = [f"  {c.name}" for c in ASISA.categories]
    return (
        "ASISA CATEGORIES - copy one of these EXACTLY into asisa_category.\n"
        f"The standard is the {ASISA_VERSION} one. If the sheet names something\n"
        "that is not on this list, say so and quote it rather than picking the\n"
        "closest: a near-miss here is a different real category, not a typo.\n\n"
        + "\n".join(lines)
    )


def main() -> int:
    args = sys.argv[1:]
    research = "--research" in args
    sheet_only = "--sheet-only" in args

    parts = [RULES]
    if not sheet_only:
        parts.append(IDENTITY)
    parts.append(FIELDS)
    parts.append(LISTS)
    if research:
        parts.append(RESEARCH)
    parts.append(CHECKS)
    parts.append(ASK)
    if not sheet_only:
        parts.append(asisa_block())

    print("\n\n".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
