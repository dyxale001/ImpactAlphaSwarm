"""Tests for the cropped-review images.

These are pixels for a person to read, so what can be asserted is narrower than
usual: that the right region of the right page is found, that a band reaches far
enough past its anchor to carry the headings its numbers need, and that nothing
here ever produces a *value*.

The last one is the important one. A crop is shown beside a field that a reader
refused, which is exactly the field where a confident wrong answer does damage.
So this module must stay a rendering step: if it ever started returning a
reading, that reading would arrive with no quote and no verification, through the
one path built for the fields nobody could check.

Built PDFs rather than fixtures, so the tests run without a network and without
committing a manager's document. The real sheets were used to *measure* the
bands — the numbers in `crops.py` come from where Satrix and FundRock actually
print their headings — and the synthetic pages here hold that behaviour in place.
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from src.funds.extract.crops import (  # noqa: E402
    CROP_SPECS,
    Crop,
    CropSpec,
    crop_specs_for,
    crops_from_pdf,
)

pymupdf = pytest.importorskip("pymupdf", reason="crops are a dev/admin dependency")


def sheet(lines: list[tuple[float, float, str]], pages: int = 1) -> bytes:
    """A PDF with text at given positions, so a band can be measured against it."""
    document = pymupdf.open()
    for index in range(pages):
        page = document.new_page(width=595, height=842)
        for x, y, text in lines:
            if index == 0:
                page.insert_text((x, y), text, fontsize=9)
    out = document.tobytes()
    document.close()
    return out


# The Satrix fee block, at the offsets it actually occupies: the "1-Year 3-Year"
# header sits 29 points above the "Total Expense Ratio" row label.
FEE_SHEET = sheet(
    [
        (16, 500, "FEE DETAILS (%) (incl. VAT)"),
        (215, 530, "1-Year   3-Year"),
        (16, 550, "Annual Management Fee   0.18   0.20"),
        (16, 559, "Total Expense Ratio (TER)   0.25   0.25"),
        (16, 575, "Transaction Cost (TC)   0.00   0.00"),
    ]
)


def only(crops: tuple[Crop, ...], field: str) -> Crop:
    found = [c for c in crops if c.field == field]
    assert found, f"no crop for {field}"
    return found[0]


def text_in(crop: Crop, pdf: bytes) -> str:
    """The text inside a crop's own rectangle, to check what it captured.

    Re-derived from the page rather than read out of the PNG: the assertion is
    about which region was chosen, and OCR would be testing a renderer.
    """
    document = pymupdf.open(stream=pdf, filetype="pdf")
    try:
        page = document[crop.page - 1]
        # Same band the crop used, recomputed from the spec under test.
        spec = next(s for s in CROP_SPECS if s.field == crop.field)
        hit = page.search_for(crop.anchor)[0]
        bounds = page.rect
        rect = pymupdf.Rect(
            bounds.x0 + 2,
            max(bounds.y0, hit.y0 - spec.above),
            bounds.x1 - 2,
            min(bounds.y1, hit.y1 + spec.below),
        )
        return page.get_text(clip=rect)
    finally:
        document.close()


class TestTheHeadingsMakeItIntoThePicture:
    """INVARIANT: a crop carries what makes its numbers mean something.

    REGRESSION GUARD. The first version cut the fee table on its row label and
    produced an image of `0.25 0.25` — two identical figures with no `1-Year
    3-Year` above them. On the Property sheet the same crop showed `0.33 0.32`,
    which looks like a decision and is not one. Review that manufactures
    confidence is worse than no review.
    """

    def test_the_fee_crop_includes_the_column_headers(self):
        crops = crops_from_pdf(FEE_SHEET)
        fees = only(crops, "ter")
        captured = text_in(fees, FEE_SHEET)
        assert "1-Year" in captured
        assert "3-Year" in captured
        # And the rows the headers are for.
        assert "Total Expense Ratio" in captured
        assert "Annual Management Fee" in captured

    def test_the_band_above_clears_the_measured_gap(self):
        """29 points on the sheet this was measured on, with room for a title line."""
        fee_spec = next(s for s in CROP_SPECS if s.field == "ter")
        assert fee_spec.above >= 40

    def test_the_allocation_band_reaches_past_a_ten_category_chart(self):
        """REGRESSION GUARD, the same rule pointing downward.

        At 210 the Satrix 40 allocation was cut below its tenth bar and the ten
        visible figures summed to 99.98 — so a reviewer could not tell whether
        that was the whole allocation or whether an eleventh lay under the crop.
        """
        allocation = next(s for s in CROP_SPECS if s.field == "asset_allocation")
        assert allocation.below >= 300

    def test_a_crop_spans_the_full_page_width(self):
        """A guessed column edge cuts the 3-Year column off some sheets.

        Asserted in pixels, from the image's own header. Reopening the PNG and
        reading `rect.width` gives 886.5 for this crop rather than 1182, because
        that is the width in points at 72dpi and the image is tagged 96 — a
        mismatch that looks like a failing crop and is a failing assertion.
        """
        crops = crops_from_pdf(FEE_SHEET)
        png = only(crops, "ter").png
        # IHDR: 8-byte signature, 4-byte length, "IHDR", then width big-endian.
        assert png[12:16] == b"IHDR"
        width = int.from_bytes(png[16:20], "big")
        assert width == pytest.approx((595 - 4) * 2, abs=4)


class TestFindingTheBlock:
    def test_it_reports_the_page_the_block_was_on(self):
        """A fact sheet is two pages and the allocation is usually on the second."""
        two_pages = pymupdf.open()
        two_pages.new_page(width=595, height=842)
        second = two_pages.new_page(width=595, height=842)
        second.insert_text((18, 108), "PORTFOLIO ALLOCATION (%)", fontsize=9)
        pdf = two_pages.tobytes()
        two_pages.close()

        crops = crops_from_pdf(pdf)
        assert only(crops, "asset_allocation").page == 2

    def test_anchors_are_tried_in_order_so_managers_can_differ(self):
        """FundRock prints "PORTFOLIO HOLDINGS" where Satrix prints "ALLOCATION"."""
        pdf = sheet([(60, 300, "PORTFOLIO HOLDINGS")])
        crops = crops_from_pdf(pdf)
        assert only(crops, "asset_allocation").anchor == "PORTFOLIO HOLDINGS"

    def test_a_block_that_is_not_there_is_skipped_not_faked(self):
        """Many tracker sheets print no allocation at all; absence is not an error."""
        crops = crops_from_pdf(sheet([(60, 300, "Nothing this recognises")]))
        assert crops == ()

    def test_a_document_that_is_not_a_pdf_yields_nothing(self):
        assert crops_from_pdf(b"this is not a pdf") == ()

    def test_an_empty_document_yields_nothing(self):
        assert crops_from_pdf(b"") == ()


class TestWhatTheFormReceives:
    def test_a_crop_carries_the_field_it_belongs_beside(self):
        crops = crops_from_pdf(FEE_SHEET)
        assert only(crops, "ter").field == "ter"

    def test_a_crop_carries_a_note_saying_why_it_is_being_shown(self):
        crops = crops_from_pdf(FEE_SHEET)
        note = only(crops, "ter").note
        assert "1-Year" in note or "column" in note

    def test_the_png_is_a_png_and_survives_base64(self):
        crops = crops_from_pdf(FEE_SHEET)
        payload = only(crops, "ter").as_dict()
        assert payload["png_base64"]
        assert base64.standard_b64decode(payload["png_base64"])[:4] == b"\x89PNG"

    def test_a_crop_never_carries_a_value(self):
        """INVARIANT: this module renders, it does not read.

        A crop is shown beside a field every reader refused, so a value arriving
        through here would arrive with no quote and no verification, on the one
        path built for figures nobody could check.
        """
        payload = only(crops_from_pdf(FEE_SHEET), "ter").as_dict()
        assert "value" not in payload
        assert "fields" not in payload
        assert set(payload) == {"field", "label", "note", "page", "anchor", "png_base64"}


class TestChoosingWhichCropsToRender:
    def test_by_default_every_region_is_offered(self):
        assert crop_specs_for() == CROP_SPECS

    def test_it_can_be_narrowed_to_what_a_reader_could_not_read(self):
        specs = crop_specs_for({"risk_indicator_raw"})
        assert [s.field for s in specs] == ["risk_indicator_raw"]

    def test_narrowing_to_nothing_renders_nothing(self):
        assert crop_specs_for(set()) == ()

    def test_the_two_graphic_fields_are_always_covered(self):
        """The risk scale and the allocation chart are why this exists."""
        fields = {s.field for s in CROP_SPECS}
        assert {"risk_indicator_raw", "asset_allocation"} <= fields

    def test_every_spec_has_at_least_one_anchor_and_a_note(self):
        for spec in CROP_SPECS:
            assert spec.anchors, spec.field
            assert spec.note, spec.field
            assert spec.above >= 0 and spec.below > 0, spec.field


class TestCustomSpecs:
    def test_a_caller_can_ask_for_its_own_region(self):
        pdf = sheet([(40, 400, "SOMETHING ELSE ENTIRELY")])
        spec = CropSpec(
            field="custom",
            label="Custom",
            anchors=("SOMETHING ELSE",),
            above=20,
            below=40,
            note="n",
        )
        crops = crops_from_pdf(pdf, (spec,))
        assert len(crops) == 1
        assert crops[0].field == "custom"
