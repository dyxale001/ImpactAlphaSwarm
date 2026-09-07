"""Tests for the model-based fact-sheet reader.

No network and no key: every test drives the reader with a fake client, so what
is under test is our half — the quote verification, the coercion, the cache, and
the flag isolation. The model's own accuracy is measured separately by
`scripts/extractor_accuracy.py`, against real documents, because that is a
measurement and not an assertion.

The claim these tests exist to defend is narrow and it is the whole design:

    a value the document does not contain must not reach the form

The reader is asked to quote the line it read every value from, and each quote is
checked against the PDF's own text layer. That check is what turns the evidence
beside a form field from a claim into a fact, and it is the only guard that
catches the failure that actually matters — a figure that is plausible, tidily
formatted, and not on the sheet.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from src.funds.extract import build_readers  # noqa: E402
from src.funds.extract.llm import (  # noqa: E402
    FIELDS,
    VERBATIM,
    LlmExtractError,
    LlmFactsheetReader,
    _coerce,
    _comparable,
    cached_reading,
    store_reading,
)

# A stand-in for a sheet's text layer. Short, and every quote below is either in
# it verbatim or deliberately is not.
SHEET_TEXT = """
Satrix ILBI ETF
Minimum Disclosure Document
31 July 2026
1-Year 3-Year
Annual Management Fee 0.18 0.20
Total Expense Ratio (TER) 0.25 0.25
Inception Date 24 February 2017
ISIN Code ZAE000240123
ASISA Classification South African - Interest Bearing - Variable Term
ILB
Portfolio Value R362 million
NAV Price R9.23
Highest Annual Rolling Return 18.51
Lowest Annual Rolling Return (4.49)
CONSERVATIVE CAUTIOUS MODERATE MODERATE- AGGRESSIVE AGGRESSIVE
"""

PDF = b"%PDF-1.4 pretend"


class FakeBlock:
    def __init__(self, payload):
        self.type = "tool_use"
        self.input = payload


class FakeResponse:
    def __init__(self, payload):
        self.content = [FakeBlock(payload)]


class FakeClient:
    """Records what it was asked and answers with a canned tool call."""

    def __init__(self, payload, error: Exception | None = None):
        self.payload = payload
        self.error = error
        self.calls: list[dict] = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return FakeResponse(self.payload)


def reader(payload, tmp_path, error: Exception | None = None) -> LlmFactsheetReader:
    return LlmFactsheetReader(client=FakeClient(payload, error), cache_dir=str(tmp_path))


def read(payload, tmp_path):
    return reader(payload, tmp_path).read(PDF, SHEET_TEXT, "https://satrix.co.za/fund/mdd/STXILB")


class TestTheQuoteMustBeInTheDocument:
    """INVARIANT: a reading whose quote is not on the sheet never reaches the form.

    This is the guard the whole reader is built around, so it is tested from
    both sides: a real quote passes, an invented one is refused with the quote
    shown so a person can see what was claimed.
    """

    def test_a_value_quoting_a_real_line_is_kept(self, tmp_path):
        extraction = read(
            {
                "readings": [
                    {"field": "ter", "value": 0.25, "quote": "Total Expense Ratio (TER) 0.25 0.25"}
                ],
                "unresolved": [],
            },
            tmp_path,
        )
        assert extraction.fields["ter"] == 0.25
        assert "Total Expense Ratio" in extraction.evidence["ter"]

    def test_a_value_quoting_a_line_that_is_not_there_is_refused(self, tmp_path):
        """The failure that matters: plausible, well-formatted, and not on the sheet."""
        extraction = read(
            {
                "readings": [
                    {"field": "ter", "value": 1.15, "quote": "Total Expense Ratio (TER) 1.15"}
                ],
                "unresolved": [],
            },
            tmp_path,
        )
        assert "ter" not in extraction.fields
        reason = next(u.reason for u in extraction.unresolved if u.field == "ter")
        assert "not in the document" in reason
        # The claimed quote is shown, so the reviewer can see what was asserted.
        assert "1.15" in reason

    def test_whitespace_and_case_do_not_matter(self, tmp_path):
        """A text layer breaks lines and doubles spaces unpredictably."""
        extraction = read(
            {
                "readings": [
                    {
                        "field": "inception_date",
                        "value": "2017-02-24",
                        "quote": "inception   date  24 FEBRUARY 2017",
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        )
        assert extraction.fields["inception_date"] == "2017-02-24"

    def test_a_quote_too_short_to_check_is_refused(self, tmp_path):
        """'0.25' appears all over a fee table; it locates nothing."""
        extraction = read(
            {"readings": [{"field": "ter", "value": 0.25, "quote": "0.25"}], "unresolved": []},
            tmp_path,
        )
        assert "ter" not in extraction.fields
        assert any("enough of the line" in u.reason for u in extraction.unresolved)

    def test_a_correct_reading_of_a_graphic_is_still_refused(self, tmp_path):
        """The honest cost of the guard, and it fails in the safe direction.

        Satrix's risk rating is a filled step on a drawn scale. A model can see
        which step is shaded, and be right — but there is no line of text to
        quote, so the reading is refused. The alternative is trusting an
        unverifiable claim about the one field whose being wrong put
        AGGRESSIVE-rated Satrix 40 into this catalogue as unrated.
        """
        extraction = read(
            {
                "readings": [
                    {
                        "field": "risk_narrative",
                        "value": "Cautious",
                        "quote": "the second step of five is shaded",
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        )
        assert "risk_narrative" not in extraction.fields


class TestWordsBrokenAcrossALineStillMatch:
    """REGRESSION GUARD: two live false refusals, both on the same sentence.

    The Satrix ILBI sheet sets its note as "...based on 10 non-\noverlapping one
    year periods...". Collapsing the newline leaves "non- overlapping", and a
    reader quoting that line writes it whichever way reads naturally: the first
    live run quoted "non-overlapping", the second quoted "nonoverlapping". Both
    were correct about the page and both were thrown away with a reason saying
    the line was not in the document.

    The field lost each time was `return_extremes_basis`, which is the one that
    stops a fund's rolling-year extreme being shown beside another's calendar
    year — so the refusal cost a real column, twice.
    """

    HAYPHENATED = (
        "The highest and lowest annualised performance numbers are based on 10 non-\n"
        "overlapping one year periods or the number from inception"
    )

    @pytest.mark.parametrize(
        "quoted",
        [
            "based on 10 non-overlapping one year periods",
            "based on 10 nonoverlapping one year periods",
            "based on 10 non- overlapping one year periods",
        ],
    )
    def test_every_way_a_reader_writes_a_broken_word_is_found(self, quoted, tmp_path):
        extraction = reader(
            {
                "readings": [
                    {
                        "field": "return_extremes_basis",
                        "value": "rolling_12m",
                        "quote": quoted,
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, self.HAYPHENATED, "https://satrix.co.za/x")
        assert extraction.fields["return_extremes_basis"] == "rolling_12m"

    def test_a_hyphen_used_as_a_separator_is_left_alone(self):
        """"Moderate - High Risk" and "1-Year" are labels, not broken words."""
        assert _comparable("Moderate - High Risk") == "moderate - high risk"
        assert _comparable("1-Year 3-Year") == "1-year 3-year"

    def test_it_still_cannot_match_text_that_is_not_there(self):
        """The repair must not become a fuzzy match."""
        assert _comparable("calendar year performance") not in _comparable(self.HAYPHENATED)


class TestAShortValueMustBeWrittenInItsLine:
    """INVARIANT: a verbatim field's value appears in the line it was read from.

    Verifying the quote proves the line is on the sheet. It does not prove the
    value is a reading of THAT line, and the gap showed up live: the reader
    returned `distribution_frequency` = "Semi-annual" quoting "Date of Income
    Declaration: 30 June/31 December". Real quote, reasonable inference, and the
    word is nowhere on the document.

    Only short verbatim fields are policed. The prose fields are out on purpose —
    quoting the first sentence of a four-sentence risk narrative is correct
    behaviour — and numbers are out because a stated conversion is intended.
    """

    def test_a_value_written_in_its_quote_is_kept(self, tmp_path):
        line = "Portfolio Managers The Satrix Investment Team"
        extraction = reader(
            {
                "readings": [
                    {
                        "field": "portfolio_manager",
                        "value": "The Satrix Investment Team",
                        "quote": line,
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, line, "https://satrix.co.za/x")
        assert extraction.fields["portfolio_manager"] == "The Satrix Investment Team"

    def test_a_value_that_describes_the_line_rather_than_quoting_it_is_refused(self, tmp_path):
        extraction = reader(
            {
                "readings": [
                    {
                        "field": "benchmark",
                        "value": "A property index",
                        "quote": "Benchmark FTSE/JSE All Property Index (J803)",
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(
            PDF,
            "Benchmark FTSE/JSE All Property Index (J803)",
            "https://satrix.co.za/x",
        )
        assert "benchmark" not in extraction.fields
        assert any("not written in the line" in u.reason for u in extraction.unresolved)

    def test_prose_may_quote_only_its_first_sentence(self, tmp_path):
        """A four-sentence narrative with a one-sentence quote is correct."""
        text = "This portfolio holds more equity exposure than a medium risk portfolio."
        extraction = reader(
            {
                "readings": [
                    {
                        "field": "risk_narrative",
                        "value": text + " In turn the expected volatility is higher.",
                        "quote": text,
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, text, "https://x")
        assert extraction.fields["risk_narrative"].startswith("This portfolio holds")

    def test_a_number_may_be_converted_from_how_it_is_printed(self, tmp_path):
        """"Portfolio Value R362 million" really is 362000000."""
        extraction = reader(
            {
                "readings": [
                    {
                        "field": "fund_size_zar",
                        "value": 362000000,
                        "quote": "Portfolio Value R362 million",
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, "Portfolio Value R362 million", "https://x")
        assert extraction.fields["fund_size_zar"] == 362000000.0

    def test_the_frequency_field_is_not_policed_this_way(self):
        """It was, for one run, and the reasoning cut both ways.

        FundRock prints declaration DATES and no frequency word, so the rule
        forced the reader to return "31 Mar/30 Jun/30 Sep/31 Dec" and the page
        rendered "Pays income: 31 Mar/30 Jun/30 Sep/31 Dec". Four printed
        quarter-end dates are not ambiguous the way a drawn risk scale is:
        "Quarterly" is a faithful reading, and the evidence quote shows what it
        was read from.
        """
        assert "distribution_frequency" not in VERBATIM
        assert "benchmark" in VERBATIM


class TestTheRiskRating:
    """REGRESSION GUARD: the reader must be ASKED for the matching field.

    It was not, for the whole of the first live run. `risk_indicator_raw` is what
    the bracket ceiling compares against, and switching a manager from a written
    template to this reader would have silently dropped it — the FundRock
    template reads it as text, and the model was never asked.
    """

    def test_it_is_one_of_the_fields_asked_for(self):
        assert "risk_indicator_raw" in FIELDS

    def test_the_ask_says_to_refuse_a_drawn_scale(self):
        described = FIELDS["risk_indicator_raw"].lower()
        assert "refuse" in described
        assert "shading" in described or "scale" in described

    def test_a_rating_printed_as_text_is_read(self, tmp_path):
        extraction = reader(
            {
                "readings": [
                    {
                        "field": "risk_indicator_raw",
                        "value": "Moderate - High Risk",
                        "quote": "RISK PROFILE Moderate - High Risk",
                    }
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, "RISK PROFILE Moderate - High Risk", "https://x")
        assert extraction.fields["risk_indicator_raw"] == "Moderate - High Risk"

    def test_the_level_is_not_asked_for(self):
        """The 1-5 level is normalised from the words by `risk_scale`.

        Asking a reader for both would let a level arrive that disagrees with the
        label beside it — which is exactly what `RiskLabelValidator` exists to
        catch, and it cannot catch it if the same source supplied both.
        """
        assert "risk_indicator_1to5" not in FIELDS


class TestTheNarrativeIsNotTheObjectiveAgain:
    """REGRESSION GUARD: they are shown as two quotations on one page.

    The Satrix sheets draw their risk profile and print no narrative, and on the
    first live run the reader filled the gap with the investment objective. Not a
    lie — the text is on the sheet — but it presents one statement as two.
    """

    def test_a_narrative_identical_to_the_objective_is_dropped(self, tmp_path):
        shared = "This fund aims to provide stable income in conjunction with capital values."
        extraction = reader(
            {
                "readings": [
                    {"field": "objective", "value": shared, "quote": shared},
                    {"field": "risk_narrative", "value": shared, "quote": shared},
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, shared, "https://x")
        assert extraction.fields["objective"] == shared
        assert "risk_narrative" not in extraction.fields

    def test_and_it_says_why_rather_than_leaving_a_blank(self, tmp_path):
        """A dropped reading with no reason is an empty box with nothing beside it."""
        shared = "This fund aims to provide stable income in conjunction with capital values."
        extraction = reader(
            {
                "readings": [
                    {"field": "objective", "value": shared, "quote": shared},
                    {"field": "risk_narrative", "value": shared, "quote": shared},
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, shared, "https://x")
        reason = next(u.reason for u in extraction.unresolved if u.field == "risk_narrative")
        assert "copy of the investment objective" in reason

    def test_a_genuine_narrative_survives(self, tmp_path):
        text = "RISK PROFILE This portfolio holds more equity exposure than a medium risk fund."
        extraction = reader(
            {
                "readings": [
                    {"field": "objective", "value": "A specialist multi-managed fund.", "quote": "A specialist multi-managed fund."},
                    {"field": "risk_narrative", "value": "This portfolio holds more equity exposure than a medium risk fund.", "quote": text},
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, text + " A specialist multi-managed fund.", "https://x")
        assert extraction.fields["risk_narrative"].startswith("This portfolio holds")


class TestTypesettersPunctuation:
    """REGRESSION GUARD: a curly apostrophe is not a different sentence.

    The Allan Gray sheet sets "The Fund's benchmark is..." with a curly
    apostrophe; the reader quoted it with a straight one, the quote check failed,
    and a correct `benchmark` reading was discarded as "not in the document".
    Same class as the hyphenated line break: the words match, the glyphs do not.
    """

    @pytest.mark.parametrize(
        "sheet,quoted",
        [
            ("The Fund\u2019s benchmark is the average", "The Fund's benchmark is the average"),
            ("The Fund's benchmark is the average", "The Fund\u2019s benchmark is the average"),
            ("South African \u2013 Multi Asset", "South African - Multi Asset"),
            ("\u201cthe Management Company\u201d is", '"the Management Company" is'),
            ("R1\u00a0234 per month minimum", "R1 234 per month minimum"),
        ],
    )
    def test_the_same_words_match_whichever_glyphs_were_used(self, sheet, quoted, tmp_path):
        extraction = reader(
            {
                "readings": [
                    {"field": "objective", "value": "The Fund aims to grow", "quote": quoted}
                ],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, sheet, "https://resources.easyequities.co.za/x.pdf")
        # Found, therefore not refused for being absent.
        assert not any(
            "not in the document" in u.reason
            for u in extraction.unresolved
            if u.field == "objective"
        )


class TestAMaximumIsNotAMinimum:
    """REGRESSION GUARD, and the nastiest failure found so far.

    The Allan Gray Tax-Free Balanced Fund is capped by SARS, so its sheet prints
    "Maximum lump sum per investor account R46 000" and "Maximum debit order*
    R 3 833.33". The reader filed both under `min_`, and EVERY OTHER GUARD PASSED
    IT: the quote was really on the page, the number was really in the quote, the
    type was right. Only the meaning was inverted.

    What it would have done: shown a beginner a R46 000 minimum on a fund whose
    actual barrier to entry is nothing — the opposite of the fact, excluding
    exactly the reader this catalogue exists for.
    """

    @pytest.mark.parametrize(
        "field,line",
        [
            ("min_lump_sum", "Maximum lump sum per investor account R46 000"),
            ("min_debit_order", "Maximum debit order* R 3 833.33"),
        ],
    )
    def test_a_cap_is_refused_with_the_reason(self, field, line, tmp_path):
        extraction = reader(
            {
                "readings": [{"field": field, "value": 46000, "quote": line}],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, line, "https://resources.easyequities.co.za/x.pdf")
        assert field not in extraction.fields
        reason = next(u.reason for u in extraction.unresolved if u.field == field)
        assert "states a maximum" in reason

    def test_a_real_minimum_is_still_read(self, tmp_path):
        line = "Minimum lump sum investment R20 000"
        extraction = reader(
            {
                "readings": [{"field": "min_lump_sum", "value": 20000, "quote": line}],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, line, "https://x")
        assert extraction.fields["min_lump_sum"] == 20000.0

    def test_a_line_stating_both_is_allowed_through(self, tmp_path):
        """Some sheets print a minimum and a maximum on one line; the field's own
        word being present means the reader had something to choose from."""
        line = "Minimum R500 per month, maximum R3 000 per month"
        extraction = reader(
            {
                "readings": [{"field": "min_debit_order", "value": 500, "quote": line}],
                "unresolved": [],
            },
            tmp_path,
        ).read(PDF, line, "https://x")
        assert extraction.fields["min_debit_order"] == 500.0

    def test_the_ask_warns_about_it_too(self, tmp_path):
        """A code guard catches it; the prompt is what stops it happening."""
        assert "MAXIMUM" in FIELDS["min_lump_sum"]
        assert "SARS" in FIELDS["min_lump_sum"]


class TestReachingAManagerWithNoTemplate:
    """The case this reader was built for, and the one that pays for it.

    EasyEquities re-hosts the Minimum Disclosure Documents of many management
    companies at one predictable path, so one host reaches Allan Gray,
    Coronation, Ninety One and the rest with no pattern per manager. A template
    each would have been eight modules.
    """

    def test_the_rehost_is_claimed_when_the_flag_is_on(self):
        url = "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"
        assert any(r.matches(url) for r in build_readers(llm_enabled=True))

    def test_and_not_when_it_is_off(self):
        """Reading an arbitrary manager needs the model; there is no pattern."""
        url = "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf"
        assert not any(r.matches(url) for r in build_readers(llm_enabled=False))

    def test_a_host_nobody_confirmed_is_still_refused(self):
        for url in (
            "https://www.coronation.com/sheet.pdf",
            "https://169.254.169.254/latest/meta-data",
            "https://evil.example.com/resources.easyequities.co.za/x.pdf",
        ):
            assert not any(r.matches(url) for r in build_readers(llm_enabled=True)), url


class TestEveryFieldIsAccountedFor:
    """INVARIANT: the form learns the state of every field, not just the good ones.

    A field nobody mentioned is not the same as a field the sheet does not
    print, and both are different from a field that was read. If a silent gap
    were possible the form would show an empty box with no reason next to it,
    which is the one presentation that invites a guess.
    """

    def test_a_field_the_reader_ignored_comes_back_unresolved(self, tmp_path):
        extraction = read({"readings": [], "unresolved": []}, tmp_path)
        assert {u.field for u in extraction.unresolved} == set(FIELDS)
        assert all("not reported" in u.reason for u in extraction.unresolved)

    def test_a_declared_refusal_keeps_its_reason(self, tmp_path):
        extraction = read(
            {
                "readings": [],
                "unresolved": [
                    {"field": "isin", "reason": "the sheet does not print an ISIN"}
                ],
            },
            tmp_path,
        )
        reason = next(u.reason for u in extraction.unresolved if u.field == "isin")
        assert reason == "the sheet does not print an ISIN"

    def test_a_field_claimed_twice_is_taken_once(self, tmp_path):
        extraction = read(
            {
                "readings": [
                    {"field": "ter", "value": 0.25, "quote": "Total Expense Ratio (TER) 0.25"},
                    {"field": "ter", "value": 9.99, "quote": "Total Expense Ratio (TER) 0.25"},
                ],
                "unresolved": [],
            },
            tmp_path,
        )
        assert extraction.fields["ter"] == 0.25
        assert sum(1 for u in extraction.unresolved if u.field == "ter") == 0

    def test_a_field_this_form_does_not_show_is_dropped(self, tmp_path):
        """An invented field name cannot become a form field."""
        extraction = read(
            {
                "readings": [
                    {"field": "sharpe_ratio", "value": 1.2, "quote": "Minimum Disclosure Document"}
                ],
                "unresolved": [],
            },
            tmp_path,
        )
        assert "sharpe_ratio" not in extraction.fields

    def test_a_malformed_entry_does_not_break_the_reading(self, tmp_path):
        extraction = read(
            {
                "readings": ["not an object", {"field": "ter", "value": 0.25, "quote": "Total Expense Ratio (TER) 0.25"}],
                "unresolved": [None],
            },
            tmp_path,
        )
        assert extraction.fields["ter"] == 0.25


class TestCoercion:
    """INVARIANT: a value is typed for its column, or refused with a reason."""

    @pytest.mark.parametrize(
        "field,raw,expected",
        [
            ("ter", "0.25%", 0.25),
            ("ter", 0.25, 0.25),
            ("fund_size_zar", "362 000 000", 362000000.0),
            ("nav_cpu", "R923", 923.0),
            # A negative annual return is printed in brackets. The prompt asks
            # for a minus sign, but a reader that copied the sheet's own
            # notation is still right about the figure.
            ("return_low_12m", "(4.49)", -4.49),
            ("return_low_12m", -4.49, -4.49),
            ("regulation_28", "Yes", True),
            ("regulation_28", False, False),
            ("fee_period", "1y", "1y"),
            ("return_extremes_basis", "calendar_year", "calendar_year"),
            ("as_of", "31 July 2026", "2026-07-31"),
            ("inception_date", "24 February 2017", "2017-02-24"),
            ("portfolio_manager", "  The Satrix   Investment Team ", "The Satrix Investment Team"),
        ],
    )
    def test_accepted(self, field, raw, expected):
        value, problem = _coerce(field, raw)
        assert problem is None, problem
        assert value == expected

    @pytest.mark.parametrize(
        "field,raw",
        [
            ("ter", "not a number"),
            ("ter", True),  # a bool is not a fee
            ("ter", None),
            ("fee_period", "ytd"),
            ("return_extremes_basis", "rolling"),
            ("regulation_28", "maybe"),
            ("as_of", "July 2026"),
            ("asisa_category", "Global - Bond - Whatever"),
        ],
    )
    def test_refused_with_a_reason(self, field, raw):
        value, problem = _coerce(field, raw)
        assert value is None
        assert problem

    def test_a_wrapped_asisa_category_is_snapped_onto_the_published_name(self):
        """The bug that prompted the fifteenth category, from the reader's side."""
        value, problem = _coerce(
            "asisa_category", "South African - Interest Bearing - Variable Term ILB"
        )
        assert problem is None
        assert value == "South African - Interest Bearing - Variable Term ILB"

    def test_an_abbreviated_category_resolves_to_the_published_wording(self):
        value, problem = _coerce("asisa_category", "SA Multi Asset High Equity")
        assert problem is None
        assert value == "South African - Multi Asset - High Equity"


class TestTheCacheIsTheDeterminismArgument:
    """INVARIANT: the same document gives the same answer, and costs once.

    This is not an optimisation. It is the property that regex templates had and
    a model does not, and without it a figure a person approved could silently
    change on the next load.
    """

    def test_a_second_read_of_the_same_document_asks_nothing(self, tmp_path):
        one = reader(
            {"readings": [{"field": "ter", "value": 0.25, "quote": "Total Expense Ratio (TER) 0.25"}], "unresolved": []},
            tmp_path,
        )
        first = one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        second = one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        assert first.fields == second.fields
        assert len(one._client.calls) == 1

    def test_a_different_document_is_read_again(self, tmp_path):
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        one.read(PDF + b" different", SHEET_TEXT, "https://satrix.co.za/x")
        assert len(one._client.calls) == 2

    def test_what_is_cached_is_the_raw_answer_not_our_interpretation(self, tmp_path):
        """So a change to verification can be re-applied without paying again."""
        payload = {
            "readings": [{"field": "ter", "value": 0.25, "quote": "Total Expense Ratio (TER) 0.25"}],
            "unresolved": [],
        }
        one = reader(payload, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        stored = list(Path(tmp_path).glob("*.json"))
        assert len(stored) == 1
        assert json.loads(stored[0].read_text()) == payload

    def test_an_unreadable_cache_entry_is_a_miss_not_a_failure(self, tmp_path):
        (tmp_path / "deadbeef.json").write_text("{ not json")
        assert cached_reading("deadbeef", str(tmp_path)) is None

    def test_a_cache_that_cannot_be_written_does_not_break_a_reading(self, tmp_path):
        # A file where the directory should be: writing must fail silently,
        # because a cache is a convenience and a reading is the job.
        blocked = tmp_path / "blocked"
        blocked.write_text("i am a file")
        store_reading("abc", {"readings": []}, str(blocked))
        one = reader({"readings": [], "unresolved": []}, str(blocked))
        assert one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x").unresolved


class TestTheRequest:
    """What is actually sent, since the prompt carries the rules that matter."""

    def test_the_document_is_sent_as_a_document_not_as_text(self, tmp_path):
        """The point of this reader: it sees the page, including the graphics."""
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        content = one._client.calls[0]["messages"][0]["content"]
        kinds = [block["type"] for block in content]
        assert "document" in kinds
        assert content[0]["source"]["media_type"] == "application/pdf"

    def test_one_tool_call_is_forced(self, tmp_path):
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        assert one._client.calls[0]["tool_choice"]["type"] == "tool"

    def test_the_fee_column_rule_is_in_the_prompt(self, tmp_path):
        """The measured instability was the two-column fee table, so the rule is stated."""
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        system = one._client.calls[0]["system"]
        assert "1-YEAR" in system
        assert "fee_period" in system

    def test_a_stated_fee_reduction_beats_the_printed_column(self, tmp_path):
        """REGRESSION GUARD, and it was a wrong FEE — the error that matters most.

        The Satrix MSCI World sheet prints "Total Expense Ratio (TER) 0.27 0.32"
        AND a note that the TER "was reduced to 0.25% effective 01 October 2025".
        Told only to take the 1-Year column, the reader took 0.27. The sheet's own
        Total Investment Charge row is 0.25 with a zero transaction cost, so 0.27
        cannot be right — and `FeeRelationValidator` would have flagged it.
        """
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        system = one._client.calls[0]["system"]
        assert "REDUCTION" in system
        assert "reduced" in system

    def test_the_prompt_offers_the_sheets_own_arithmetic_as_a_self_check(self, tmp_path):
        """TER + TC = TIC, all three printed. Not a figure to report — a way to
        catch having read the wrong row."""
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        system = one._client.calls[0]["system"]
        assert "add up to the printed TIC" in system

    def test_the_extremes_basis_rule_is_in_the_prompt(self, tmp_path):
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        system = one._client.calls[0]["system"]
        assert "CALENDAR YEAR" in system
        assert "ROLLING" in system

    def test_the_graphic_refusal_rule_is_in_the_prompt(self, tmp_path):
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        assert "ONLY A PICTURE" in one._client.calls[0]["system"]

    def test_every_asked_field_is_described(self, tmp_path):
        """A field in the schema and missing from the instructions is a silent gap."""
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        instruction = one._client.calls[0]["messages"][0]["content"][1]["text"]
        for field in FIELDS:
            assert field in instruction

    def test_the_known_categories_are_offered(self, tmp_path):
        one = reader({"readings": [], "unresolved": []}, tmp_path)
        one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        instruction = one._client.calls[0]["messages"][0]["content"][1]["text"]
        assert "South African - Interest Bearing - Variable Term ILB" in instruction


class TestFailingSafely:
    def test_a_transport_failure_says_so(self, tmp_path):
        one = reader({}, tmp_path, error=RuntimeError("connection reset"))
        with pytest.raises(LlmExtractError) as caught:
            one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        assert "connection reset" in str(caught.value)

    def test_a_missing_key_is_reported_as_configuration(self, monkeypatch, tmp_path):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        one = LlmFactsheetReader(cache_dir=str(tmp_path))
        with pytest.raises(LlmExtractError) as caught:
            one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        assert "ANTHROPIC_API_KEY" in str(caught.value)

    def test_an_organisation_key_is_told_which_two_things_to_change(self, tmp_path):
        """The first error this reader hit against a real key.

        An `sk-ant-api03-…` key created at the organisation level rather than
        inside a workspace is refused with a 400 saying the request must name a
        workspace. That message is accurate and still leaves a reader guessing
        which of two things to change, so it is translated.
        """
        raw = RuntimeError(
            "Error code: 400 - {'message': 'This API key is not scoped to a "
            "workspace, so this request must include the anthropic-workspace-id "
            "header with the ID of the workspace to use.'}"
        )
        one = reader({}, tmp_path, error=raw)
        with pytest.raises(LlmExtractError) as caught:
            one.read(PDF, SHEET_TEXT, "https://satrix.co.za/x")
        message = str(caught.value)
        assert "ANTHROPIC_WORKSPACE_ID" in message
        assert "created inside a workspace" in message
        # And it still says what to do meanwhile, because the form is waiting.
        assert "by hand" in message

    def test_the_text_only_seam_refuses_everything_rather_than_returning_nothing(self):
        """An empty extraction would read as 'the sheet says nothing'."""
        extraction = LlmFactsheetReader().extract(SHEET_TEXT, "https://satrix.co.za/x")
        assert extraction.readings == ()
        assert {u.field for u in extraction.unresolved} == set(FIELDS)


class TestFlagIsolation:
    """INVARIANT: with the flag off, this module is not even imported.

    The dependency is dev-only and the deployed API never opens a PDF, so the
    served app must not need `anthropic` installed. A regression here is
    invisible until a deploy fails.
    """

    def test_the_flag_decides_which_readers_exist(self):
        assert [r.name for r in build_readers(llm_enabled=False)] == ["fundrock", "satrix"]
        assert [r.name for r in build_readers(llm_enabled=True)] == ["fundrock", "llm"]

    def test_building_the_readers_with_the_flag_off_imports_no_anthropic(self):
        code = (
            "import sys; sys.path.insert(0, '.');"
            "from src.funds.extract.registry import build_readers;"
            "readers = build_readers(llm_enabled=False);"
            "assert [r.name for r in readers] == ['fundrock', 'satrix'];"
            "assert 'anthropic' not in sys.modules, sorted(m for m in sys.modules if 'anth' in m);"
            "assert 'src.funds.extract.llm' not in sys.modules;"
            "print('clean')"
        )
        import subprocess

        result = subprocess.run(
            [sys.executable, "-c", code], cwd=BACKEND_ROOT, capture_output=True, text=True
        )
        assert result.returncode == 0, result.stderr
        assert "clean" in result.stdout

    def test_the_flag_may_widen_the_allowlist_but_only_to_declared_hosts(self):
        """Turning the reader on must not turn the server into a general fetcher.

        This test used to assert the allowlist could not widen at all, which was
        true only while the model reader claimed nothing a template did not.
        It claims `resources.easyequities.co.za` now — deliberately, because that
        one host re-hosts many managers' sheets and is the whole point of a
        reader that needs no pattern.

        So the invariant is the one that always mattered: every host reachable
        with the flag on is a host some reader DECLARES. Widening is an edit to
        a `hosts` tuple that a person makes and a diff shows, never a side
        effect of flipping a flag.
        """
        declared = {h for r in build_readers(llm_enabled=True) for h in r.hosts}
        off = {h for r in build_readers(llm_enabled=False) for h in r.hosts}

        assert off <= declared, "turning the reader on must not drop a host"
        gained = declared - off
        assert gained == {"resources.easyequities.co.za"}, gained

    def test_no_reader_claims_a_host_it_did_not_declare(self):
        """The allowlist is a list of hostnames, not a substring search.

        It was a substring search until 2026-09-07 — `host in url.lower()` over
        the whole address — so `evil.example.com/resources.easyequities.co.za/x`
        and `satrix.co.za.attacker.net` both matched. Since this same list is
        what `fetch.check_allowed` trusts, that was the difference between "hosts
        whose sheets we can read" and "anywhere, if the string appears in the
        URL".
        """
        for url in (
            "https://evil.example.com/resources.easyequities.co.za/x.pdf",
            "https://satrix.co.za.attacker.net/x.pdf",
            "https://evil.example.com/?ref=satrix.co.za",
            "https://bcis.co.za.example.net/x.pdf",
            "https://169.254.169.254/latest/meta-data",
            "https://localhost/x.pdf",
        ):
            assert not any(r.matches(url) for r in build_readers(llm_enabled=True)), url

    def test_a_declared_host_and_its_subdomains_are_claimed(self):
        for url in (
            "https://satrix.co.za/fund/mdd/STX40",
            "https://www.satrix.co.za/fund/mdd/STX40",
            "https://resources.easyequities.co.za/Unit%20Trusts/AGTBC.pdf",
        ):
            assert any(r.matches(url) for r in build_readers(llm_enabled=True)), url

    def test_the_reader_claims_satrix_and_not_a_manager_nobody_confirmed(self):
        one = LlmFactsheetReader()
        assert one.matches("https://satrix.co.za/fund/mdd/STX40")
        assert not one.matches("https://www.coronation.com/some/sheet.pdf")
        assert not one.matches("https://169.254.169.254/latest/meta-data")
