"""Tests for reading an uploaded fact sheet (src/funds/reading.py).

What is tested is the part that decides what a person must check: the quote
check, the rules carried over from the old reader, and the sorting into
confirmed, check and missing. Gemini is a fake; the PDFs are made on the spot.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds.reading import (  # noqa: E402
    FIELDS,
    GeminiFactsheetReader,
    coerce,
    instruction,
    quote_found,
    response_schema,
    review,
)

fitz = pytest.importorskip("fitz")

SHEET_TEXT = """Example Balanced Fund (A)  Minimum Disclosure Document  31 August 2026
ASISA category: South African - Multi Asset - High Equity
Benchmark: ASISA fund category average
Total expense ratio (TER) 1.15%
Transaction costs (TC) 0.18%
Total investment charge (TIC) 1.33%
Maximum lump sum per investor account R46 000"""


def reading(field, value, quote, **extra):
    return {"field": field, "value": value, "quote": quote, "page": 1,
            "source": extra.get("source", "text"), "certainty": extra.get("certainty", "sure"),
            **({"note": extra["note"]} if "note" in extra else {})}


def statuses(payload, text=SHEET_TEXT):
    readings, missing = review(payload, text)
    return {r.field: r for r in readings}, {m.field: m for m in missing}


class TestQuoteFound:
    def test_a_line_on_the_sheet_is_found(self):
        assert quote_found("Total expense ratio (TER) 1.15%", SHEET_TEXT)

    def test_a_line_not_on_the_sheet_is_not(self):
        assert not quote_found("Total expense ratio (TER) 0.99%", SHEET_TEXT)

    def test_a_text_layer_with_no_spaces_still_finds_a_spaced_quote(self):
        # The 10X S&P SA Top50 sheet's heading extracts as one run of letters.
        assert quote_found("10X S&P SA Top50 ETF", "header 10XS&PSATop50ETF\n31July2026")

    def test_curly_punctuation_and_line_breaks_do_not_matter(self):
        assert quote_found("The Fund's benchmark", "The Fund’s\nbenchmark is")
        assert quote_found("non-overlapping one year periods", "10 non-\noverlapping one year periods")

    def test_a_quote_too_short_to_locate_is_not_found(self):
        assert not quote_found("1.33", SHEET_TEXT)


class TestReview:
    def test_a_sure_quoted_reading_is_confirmed(self):
        got, _ = statuses({"readings": [reading("ter", "1.15%", "Total expense ratio (TER) 1.15%")]})
        assert got["ter"].status == "confirmed"
        assert got["ter"].value == 1.15

    def test_an_unsure_reading_must_be_checked_and_says_why(self):
        got, _ = statuses({"readings": [reading("tc", "0.18", "Transaction costs (TC) 0.18%",
                                                certainty="unsure", note="two columns printed")]})
        assert got["tc"].status == "check"
        assert "two columns printed" in got["tc"].reasons[0]

    def test_a_value_read_off_a_graphic_is_kept_but_checked(self):
        got, _ = statuses({"readings": [reading("risk_indicator_raw", "Moderate", "Low Moderate High",
                                                source="graphic")]})
        assert got["risk_indicator_raw"].status == "check"
        assert got["risk_indicator_raw"].value == "Moderate"
        assert "graphic" in got["risk_indicator_raw"].reasons[0]

    def test_a_quote_not_in_the_document_is_kept_but_checked(self):
        got, _ = statuses({"readings": [reading("tic", "1.40", "Total investment charge (TIC) 1.40%")]})
        assert got["tic"].status == "check"
        assert got["tic"].value == 1.4
        assert "not in the document" in got["tic"].reasons[0]

    def test_a_maximum_filed_as_a_minimum_is_caught(self):
        got, _ = statuses({"readings": [reading("min_lump_sum", "46000",
                                                "Maximum lump sum per investor account R46 000")]})
        assert got["min_lump_sum"].status == "check"
        assert any("maximum" in reason for reason in got["min_lump_sum"].reasons)

    def test_a_fee_read_from_a_line_with_two_figures_is_checked(self):
        text = SHEET_TEXT + "\nFund management fee 0.50% 0.58%"
        got, _ = statuses({"readings": [reading("annual_management_fee", "0.58",
                                                "Fund management fee 0.50% 0.58%")]}, text)
        assert got["annual_management_fee"].status == "check"
        assert "more than one figure" in got["annual_management_fee"].reasons[0]

    def test_a_performance_fee_read_as_the_management_fee_is_checked(self):
        text = SHEET_TEXT + "\nFee for benchmark performance 0.88"
        got, _ = statuses({"readings": [reading("annual_management_fee", "0.88",
                                                "Fee for benchmark performance 0.88")]}, text)
        assert got["annual_management_fee"].status == "check"
        assert "performance-related" in got["annual_management_fee"].reasons[0]

    def test_a_verbatim_field_must_be_written_in_its_quote(self):
        got, _ = statuses({"readings": [reading("benchmark", "Category mean",
                                                "Benchmark: ASISA fund category average")]})
        assert got["benchmark"].status == "check"

    def test_a_category_is_snapped_onto_the_published_name(self):
        got, _ = statuses({"readings": [reading("asisa_category", "South African - Multi Asset - High Equity",
                                                "ASISA category: South African - Multi Asset - High Equity")]})
        assert got["asisa_category"].status == "confirmed"

    def test_a_value_that_is_not_a_number_is_kept_as_text_and_checked(self):
        got, _ = statuses({"readings": [reading("ter", "about one percent", "Total expense ratio (TER) 1.15%")]})
        assert got["ter"].status == "check"
        assert got["ter"].value == "about one percent"

    def test_the_objective_repeated_as_the_risk_narrative_is_checked(self):
        text = SHEET_TEXT + "\nThe fund aims to grow capital over the long term."
        quote = "The fund aims to grow capital over the long term."
        got, _ = statuses({"readings": [reading("objective", quote, quote),
                                        reading("risk_narrative", quote, quote)]}, text)
        assert got["objective"].status == "confirmed"
        assert got["risk_narrative"].status == "check"

    def test_fields_the_sheet_does_not_state_are_missing_with_a_reason(self):
        _, missing = statuses({"readings": [], "unresolved": [{"field": "nav_cpu", "reason": "not printed"}]})
        assert missing["nav_cpu"].reason == "not printed"
        assert missing["isin"].reason == "not reported by the model"
        assert set(missing) == set(FIELDS)

    def test_an_unknown_field_or_a_repeat_is_ignored(self):
        got, _ = statuses({"readings": [reading("made_up", "1", "Total expense ratio (TER) 1.15%"),
                                        reading("ter", "1.15", "Total expense ratio (TER) 1.15%"),
                                        reading("ter", "9.99", "Total expense ratio (TER) 1.15%")]})
        assert "made_up" not in got and got["ter"].value == 1.15


class TestCoerce:
    def test_a_negative_return_in_brackets(self):
        assert coerce("return_low_12m", "(4.49)") == (-4.49, None)

    def test_a_rand_amount_with_spaces(self):
        assert coerce("min_debit_order", "R 1 000") == (1000.0, None)

    def test_a_date_in_words(self):
        assert coerce("as_of", "31 August 2026") == ("2026-08-31", None)

    def test_a_risk_label_off_the_scale_is_flagged(self):
        value, problem = coerce("risk_indicator_raw", "Spicy")
        assert value == "Spicy" and problem


class TestTheAsk:
    def test_the_schema_offers_every_field_and_nothing_else(self):
        names = response_schema()["properties"]["readings"]["items"]["properties"]["field"]["enum"]
        assert names == list(FIELDS)

    def test_the_instruction_lists_every_field(self):
        text = instruction()
        assert all(f"- {name}:" in text for name in FIELDS)


def pdf(text: str) -> bytes:
    doc = fitz.open()
    doc.new_page().insert_text((56, 72), text, fontsize=10)
    return doc.tobytes()


class FakeResponse:
    def __init__(self, payload):
        self.text = json.dumps(payload)
        self.usage_metadata = type("U", (), {"prompt_token_count": 1100, "candidates_token_count": 300,
                                             "thoughts_token_count": 250})()


class FakeClient:
    def __init__(self, payload):
        self.models = self
        self.payload = payload
        self.calls = 0

    def generate_content(self, model, contents, config):
        self.calls += 1
        return FakeResponse(self.payload)


class TestReader:
    def test_reads_a_pdf_end_to_end(self):
        client = FakeClient({"is_fact_sheet": True,
                             "readings": [reading("ter", "1.15", "Total expense ratio (TER) 1.15%")],
                             "unresolved": []})
        result = GeminiFactsheetReader(model="fake", client=client).read(pdf(SHEET_TEXT))
        assert result.is_fact_sheet
        assert result.get("ter").status == "confirmed"
        assert (result.input_tokens, result.output_tokens, result.thinking_tokens) == (1100, 300, 250)

    def test_a_document_that_is_not_a_fact_sheet_yields_nothing(self):
        client = FakeClient({"is_fact_sheet": False,
                             "readings": [reading("ter", "1.15", "Total expense ratio (TER) 1.15%")],
                             "unresolved": []})
        result = GeminiFactsheetReader(model="fake", client=client).read(pdf("TAX INVOICE no. 20391"))
        assert not result.is_fact_sheet
        assert result.readings == [] and result.missing == []

    def test_a_replayed_answer_costs_no_call(self):
        client = FakeClient({})
        payload = {"is_fact_sheet": True, "readings": [], "unresolved": []}
        GeminiFactsheetReader(model="fake", client=client).read(pdf(SHEET_TEXT), payload=payload, tokens={})
        assert client.calls == 0
