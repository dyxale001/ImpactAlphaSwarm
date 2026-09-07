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
    LlmExtractError,
    LlmFactsheetReader,
    _coerce,
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

    def test_the_fetch_allowlist_does_not_widen_when_the_flag_flips(self):
        """Turning the reader on must not turn the server into a general fetcher.

        The model reader declares hosts the same way a template does, so the
        allowlist and the set of readable managers stay one list. A new manager
        is a host added on purpose, not a side effect of a flag.
        """
        off = {h for r in build_readers(llm_enabled=False) for h in r.hosts}
        on = {h for r in build_readers(llm_enabled=True) for h in r.hosts}
        assert on <= off

    def test_the_reader_claims_satrix_and_not_a_manager_nobody_confirmed(self):
        one = LlmFactsheetReader()
        assert one.matches("https://satrix.co.za/fund/mdd/STX40")
        assert not one.matches("https://www.coronation.com/some/sheet.pdf")
        assert not one.matches("https://169.254.169.254/latest/meta-data")
