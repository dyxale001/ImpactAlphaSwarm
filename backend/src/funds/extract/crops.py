"""Cutting the part of the page a figure came from, so review can be looking.

## The problem this solves

Two of the fields on a fact sheet are not text. The risk profile is a five-step
scale with the applicable step shaded, and the asset allocation is a pie or bar
chart. Both are refused by every reader here — a pattern cannot see them, and the
model-based reader's quote check refuses them too, because a graphic has no line
of text to quote. So they arrive at the form blank with a reason, and the reason
is "open the PDF and read it yourself".

That instruction is the actual cost of the design. Recording one sheet means
finding a fee block inside a two-page PDF, on the right page, and reading a
figure out of a two-column table. This turns that into looking at a picture of
the block beside the field.

## The rule that makes it worth having

**A crop must include the headings that give its numbers meaning.**

The first version of this cut the Satrix fee table on the row label and produced
an image of `0.25 0.25` — two identical figures, no `1-Year 3-Year` above them,
and nothing for a reviewer to choose between. On the Property sheet the same crop
showed `0.33 0.32`, which is worse: it looks like a decision and is not one.

Review that manufactures confidence is worse than no review, so every band here
reaches **above** its anchor far enough to carry the header row, and spans the
full page width rather than guessing at a column boundary. More context than
needed is a cost; less is a wrong answer nodded through.

Measured, not assumed: on the Satrix ILBI sheet the label "Total Expense Ratio"
sits at y≈559 and its `1-Year` header at y≈530 — twenty-nine points higher, so
`above` is set well past that.

## What it is not

Not extraction. Nothing here reads a value, and no crop becomes a field. It
renders pixels for a person to read, which is why it can safely handle exactly
the fields a reader must refuse.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Optional

# Rendering scale. 2x gives a legible crop of nine-point type without making the
# response large — a fee table comes out around 30KB.
ZOOM = 2.0

# How far a band may reach beyond the page before it is simply clipped.
PAGE_MARGIN = 2.0


@dataclass(frozen=True)
class CropSpec:
    """Where on a sheet to look, and how much of it to take.

    `anchors` are tried in order and the first found wins, because managers label
    the same block differently — Satrix prints "FEE DETAILS", FundRock prints
    "FEE STRUCTURE", and the row labels differ again.

    `above` is the field that matters. It is not padding: it is the distance
    that has to carry a table's column headings into the picture.
    """

    field: str
    label: str
    anchors: tuple[str, ...]
    above: float
    below: float
    #: Why a person is being shown this, in the words the form puts under it.
    note: str = ""


#: The regions worth cutting: the two that are only ever graphics, and the two
#: that are tabular enough that reading them off a PDF by eye is where a mistake
#: gets made.
#:
#: Ordered as the form shows them, most-refused first.
CROP_SPECS: tuple[CropSpec, ...] = (
    CropSpec(
        field="risk_indicator_raw",
        label="Risk profile",
        anchors=("RISK PROFILE", "Risk Profile", "RISK INDICATOR"),
        # The scale is drawn below its heading, and the words sit under the bar.
        above=14,
        below=95,
        note=(
            "No reader can take this: the scale is drawn, and every step's label is in "
            "the text whatever the rating. Read which step is shaded."
        ),
    ),
    CropSpec(
        field="asset_allocation",
        label="What it holds",
        anchors=(
            "PORTFOLIO ALLOCATION",
            "PORTFOLIO HOLDINGS",
            "ASSET ALLOCATION",
            "Asset Allocation",
        ),
        above=14,
        # 300, not 210. At 210 the Satrix 40 chart was cut off below its tenth
        # bar, and the ten visible figures summed to 99.98 — so a reviewer could
        # not tell whether that was the whole allocation or whether an eleventh
        # category lay under the crop. The axis has to be in the picture: the
        # header rule is that a crop must carry what makes its numbers mean
        # something, and downward that means the end of the list.
        below=300,
        note=(
            "A chart, so the percentages have no line of text to quote. Where the labels "
            "and the values are drawn as two separate lists, pairing them by eye is the "
            "only way to get it right."
        ),
    ),
    CropSpec(
        field="ter",
        label="Fees",
        anchors=(
            "Total Expense Ratio",
            "TOTAL EXPENSE RATIO",
            "FEE DETAILS",
            "FEE STRUCTURE",
        ),
        # 90 points, because the header row sat 29 above the label on the sheet
        # this was measured on and a manager who adds a title line needs more.
        above=90,
        below=70,
        note=(
            "Check which column these came from. Where a sheet prints 1-Year and 3-Year, "
            "the catalogue records the 1-Year figures and says so."
        ),
    ),
    CropSpec(
        field="return_high_12m",
        label="Strongest and weakest year",
        anchors=(
            "HIGHEST AND LOWEST",
            "Highest and Lowest",
            "Highest Annual Rolling Return",
        ),
        above=40,
        below=70,
        note=(
            "The heading says how these were measured — rolling twelve-month periods or "
            "calendar years. A negative figure is printed in brackets."
        ),
    ),
)


@dataclass(frozen=True)
class Crop:
    """One rendered region of one page."""

    field: str
    label: str
    note: str
    page: int
    anchor: str
    png: bytes

    def as_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "label": self.label,
            "note": self.note,
            "page": self.page,
            "anchor": self.anchor,
            # Inlined rather than served from a URL: these are one-shot review
            # aids for a document nobody has stored yet, so there is nothing to
            # serve them from and nothing worth keeping afterwards.
            "png_base64": base64.standard_b64encode(self.png).decode("ascii"),
        }


def crop_specs_for(unresolved: frozenset[str] | set[str] | None = None) -> tuple[CropSpec, ...]:
    """The regions worth cutting, given what a reader could not read.

    Passing the unresolved set narrows it to the fields actually blank on the
    form. Passing nothing returns all of them, which is the right default for a
    person recording a sheet by hand — the fee block is worth seeing even when a
    reader read it, because checking a figure against the page is the review.
    """
    if unresolved is None:
        return CROP_SPECS
    return tuple(spec for spec in CROP_SPECS if spec.field in unresolved)


def crops_from_pdf(
    pdf: bytes,
    specs: tuple[CropSpec, ...] = CROP_SPECS,
    zoom: float = ZOOM,
) -> tuple[Crop, ...]:
    """Render each region that can be found. Skips what cannot, silently.

    Silently because a missing crop is not a failure: many sheets carry no
    allocation chart at all, and the form's job is to show the crops that exist
    rather than to explain the absence of a picture. What a reader could not read
    is already explained, in words, by its `unresolved` reason.

    Import is inside the function, matching the rest of this package: the served
    API never opens a PDF, so `pymupdf` stays a dev/admin dependency.
    """
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - dependency guard
        return ()

    found: list[Crop] = []
    try:
        document = pymupdf.open(stream=pdf, filetype="pdf")
    except Exception:  # noqa: BLE001 - a corrupt PDF is not worth a traceback here
        return ()

    try:
        matrix = pymupdf.Matrix(zoom, zoom)
        for spec in specs:
            placed = _locate(document, spec)
            if placed is None:
                continue
            page_number, rect, anchor = placed
            page = document[page_number]
            try:
                pixmap = page.get_pixmap(matrix=matrix, clip=rect)
                png = pixmap.tobytes("png")
            except Exception:  # noqa: BLE001
                continue
            found.append(
                Crop(
                    field=spec.field,
                    label=spec.label,
                    note=spec.note,
                    page=page_number + 1,
                    anchor=anchor,
                    png=png,
                )
            )
    finally:
        document.close()

    return tuple(found)


def _locate(document: Any, spec: CropSpec) -> Optional[tuple[int, Any, str]]:
    """The page, the band to cut, and which anchor found it.

    Full page width on purpose. A band that guessed at the table's right edge
    would sometimes cut the 3-Year column off, and a reviewer looking at one
    column of a two-column table cannot tell that is what they are looking at.
    """
    import pymupdf

    for anchor in spec.anchors:
        for page_number, page in enumerate(document):
            hits = page.search_for(anchor)
            if not hits:
                continue
            hit = hits[0]
            bounds = page.rect
            rect = pymupdf.Rect(
                bounds.x0 + PAGE_MARGIN,
                max(bounds.y0, hit.y0 - spec.above),
                bounds.x1 - PAGE_MARGIN,
                min(bounds.y1, hit.y1 + spec.below),
            )
            if rect.is_empty or rect.height < 10:
                continue
            return page_number, rect, anchor
    return None
