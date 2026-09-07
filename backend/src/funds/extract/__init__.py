"""Reading a fund's figures off the document its manager published.

Pre-fills the admin form; never writes to the catalogue. A person still approves
every figure, and this only decides what they are looking at when they do.

The rule the package is built around is in `base.py`: a field a reader cannot
read comes back as **unresolved with a reason**, never as a guess. A pre-filled
wrong value gets nodded through; a blank has to be answered.

Two kinds of reader sit behind one seam. A `FactsheetTemplate` matches patterns
in the text layer, one module per management company. `llm.LlmFactsheetReader`
opens the document itself and needs no pattern written first — it is behind
`FUND_LLM_EXTRACT_ENABLED` and, when on, supersedes the Satrix template whose
five refusals it handles better. `registry.py` holds the arrangement and the
reasoning for it.

    from src.funds.extract import extract_from_url
    extraction = extract_from_url("https://satrix.co.za/fund/mdd/STX40")
    extraction.fields       # what was read
    extraction.evidence     # the text each value came from
    extraction.unresolved   # what the reviewer must supply, and why
"""

from __future__ import annotations

from .base import Extraction, ExtractError, FactsheetTemplate, Reading, Unresolved
from .crops import Crop, crop_specs_for, crops_from_pdf
from .fetch import FetchError, fetch
from .registry import TEMPLATES, build_readers, readable_hosts, template_for

__all__ = [
    "Crop",
    "ExtractError",
    "Extraction",
    "FactsheetTemplate",
    "FetchError",
    "crop_specs_for",
    "crops_from_pdf",
    "Reading",
    "TEMPLATES",
    "Unresolved",
    "build_readers",
    "extract_from_url",
    "extract_text",
    "read_and_crop",
    "fetch",
    "readable_hosts",
    "template_for",
]


def extract_text(pdf: bytes) -> str:
    """The text layer of a fact sheet.

    Imported here rather than at module scope so the app can import this package
    without pypdf installed: extraction is a dev/admin dependency, and the API
    that serves the catalogue does not open PDFs.
    """
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def extract_from_url(url: str) -> Extraction:
    """Fetch a fact sheet and read it with whichever reader claims the host.

    Both the document and its text layer are handed to the reader. A
    pattern-matching template uses only the text; a model-based one needs the
    bytes, because the figures a text layer loses are the ones printed as a
    graphic — which is most of what a pattern has to refuse.

    Raises FetchError when the document cannot be had; a document that is
    fetched but unreadable is not an error — it comes back with everything
    unresolved, which tells the reviewer to type it in.
    """
    template = template_for(url)
    if template is None:
        raise FetchError(f"No template reads {url}")
    fetched = fetch(url)
    return template.read(fetched.content, extract_text(fetched.content), fetched.url)


def read_and_crop(url: str) -> tuple[Extraction, tuple[Crop, ...]]:
    """One fetch, one reading, and pictures of the blocks worth a person's eyes.

    Together rather than as two endpoints because they come off the same
    download, and because the crops are only useful next to the reading: the
    fields a reader refuses are exactly the ones the crops cover.

    A sheet that cannot be rendered still returns its reading. The crops are an
    aid, and losing them should degrade the form rather than break it.
    """
    template = template_for(url)
    if template is None:
        raise FetchError(f"No template reads {url}")

    fetched = fetch(url)
    extraction = template.read(fetched.content, extract_text(fetched.content), fetched.url)
    try:
        crops = crops_from_pdf(fetched.content)
    except Exception:  # noqa: BLE001 - a rendering failure must not lose the reading
        crops = ()
    return extraction, crops
