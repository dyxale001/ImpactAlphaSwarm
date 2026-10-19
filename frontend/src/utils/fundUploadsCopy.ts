/** Every string the "My funds" tab, its review screen and an uploaded fund's
 *  page show. Kept together, like fundsCopy.ts, so the forbidden-term scan in
 *  fundUploads.test.ts reads all of it: an uploaded fund is still a fund page,
 *  and nothing on it may read as a proposal. */

export const MY_FUNDS_TAB = "My funds";

export const MY_FUNDS_TITLE = "Your uploaded funds";
export const MY_FUNDS_LEAD = "Upload a fund's fact sheet to see it laid out like the funds we cover.";
export const MY_FUNDS_PRIVATE_NOTE =
  "Uploaded funds stay private to your account, and the PDF isn't kept once it's been read.";

export const DROPZONE_TITLE = "Upload a fact sheet";
export const DROPZONE_HINT = "Drop a PDF here, or choose one. Fact sheets up to 10 MB.";
export const DROPZONE_CHOOSE = "Choose a PDF";
export const DROPZONE_READING_TITLE = "Reading your fact sheet";
export const DROPZONE_READING_HINT =
  "This usually takes under a minute. Every figure is checked against the line it was read from.";

export const FILE_NOT_PDF = "That file is not a PDF. Upload the fund's fact sheet as a PDF.";
export const FILE_TOO_LARGE = "That file is larger than 10 MB; a fact sheet is far smaller.";
export const FILE_EMPTY = "That file is empty.";

export const READ_FAILED = "The fact sheet could not be read just now. Please try again in a minute.";
export const SAVE_FAILED = "The fund could not be saved just now. Your checks are kept; please try again.";
export const LIST_FAILED = "Your uploaded funds could not be loaded.";
export const LIST_FAILED_BODY = "Refresh the page to try again. Nothing you saved has been lost.";
export const DELETE_FAILED = "The fund could not be removed just now. Please try again.";

export const LIST_EMPTY_TITLE = "No uploaded funds yet";
export const LIST_EMPTY_BODY =
  "Upload a fund's fact sheet above to keep its figures here beside the catalogue.";

// ── the review screen ──────────────────────────────────────────────────────

export const REVIEW_EYEBROW = "Check before saving";
export const REVIEW_LEAD =
  "AI read this fact sheet. Each figure shows the line it came from. Values it was unsure of are flagged first: " +
  "confirm each one, correct it, or clear it before the fund can be saved.";
export const REVIEW_EXISTING =
  "You already have {name}. Saving adds this sheet to it, and its newest sheet is what its page shows.";
export const REVIEW_CACHED = "This sheet was read before, so the same reading was used.";

export const REVIEW_FLAGGED_TITLE = "Check these";
export const REVIEW_FLAGGED_LEAD = "Each of these needs your decision. The reason it was flagged is under it.";
export const REVIEW_MISSING_TITLE = "Not found on the sheet";
export const REVIEW_MISSING_LEAD =
  "Fill in any you know, or leave them blank. The fund's name and the sheet's date are required.";
export const REVIEW_CONFIRMED_TITLE = "Read from the sheet";
export const REVIEW_CONFIRMED_LEAD =
  "Read with a matching line on the sheet. They are saved as shown; change any that look wrong.";
export const REVIEW_EXTRAS_TITLE = "About this fund";
export const REVIEW_VEHICLE_LABEL = "Type of fund";
export const REVIEW_VEHICLE_UNSET = "Not sure";
export const REVIEW_VEHICLE_UNIT_TRUST = "Unit trust";
export const REVIEW_VEHICLE_ETF = "Exchange-traded fund (ETF)";
export const REVIEW_FUND_HOUSE_LABEL = "Fund house";
export const REVIEW_FUND_HOUSE_HINT = "The manager's name, as you know it. Optional.";

export const REVIEW_CONFIRM = "Looks right";
export const REVIEW_CONFIRMED_BADGE = "Confirmed";
export const REVIEW_CHANGED_BADGE = "Corrected";
export const REVIEW_CLEAR = "Clear";
export const REVIEW_CLEARED_BADGE = "Cleared";
export const REVIEW_UNDO = "Undo";
export const REVIEW_EDIT = "Edit";
export const REVIEW_DONE = "Done";
export const REVIEW_REQUIRED = "Required";
/** The status chip on a flagged value that still needs a decision. */
export const REVIEW_CHECK_BADGE = "Check this";
/** Under a large rand figure, how the typed number reads, so a wrong unit shows. */
export const REVIEW_READS_AS = "Reads as {value}";
export const REVIEW_SOURCE_CHIP = "Read by AI, checked by you";
export const REVIEW_SHEET_DATED = "Fact sheet dated {date}";
export const REVIEW_FROM_PAGE = "Page {page}";
export const REVIEW_FROM_GRAPHIC = "read off a chart or graphic";
export const REVIEW_NOT_ON_SHEET = "Not on the sheet";

export const REVIEW_SAVE = "Save to my funds";
export const REVIEW_SAVING = "Saving…";
export const REVIEW_CANCEL = "Discard";
export const REVIEW_CANCEL_CONFIRM = "Discard this reading? Nothing has been saved.";
export const REVIEW_PENDING_ONE = "1 flagged value still needs your decision.";
export const REVIEW_PENDING_MANY = "{count} flagged values still need your decision.";
export const REVIEW_REQUIRED_MISSING = "Add the {fields} to save.";
export const REVIEW_READY = "Every flagged value has been checked.";
export const REVIEW_SERVER_FLAGGED = "The server asks for a decision on this value.";

export const SAVED_TITLE = "Saved to your funds";
export const SAVED_WITH_NOTES = "Saved. A few figures are worth a second look:";

// ── the list and an uploaded fund's page ───────────────────────────────────

export const UPLOADED_BADGE = "Uploaded by you";
export const UPLOADED_AS_AT = "Fact sheet dated {date}";
export const UPLOADED_OPEN = "Open";

export const DETAIL_BACK = "Back to my funds";
export const DETAIL_NOT_FOUND_TITLE = "This fund is not in your list";
export const DETAIL_NOT_FOUND_BODY = "It may have been removed. Your uploaded funds are on the Funds page.";
export const DETAIL_LOAD_FAILED = "This fund could not be loaded.";
export const DETAIL_NOTICE =
  "Read from a fact sheet you uploaded, by AI, and checked by you. It is not part of the catalogue and was not " +
  "reviewed by anyone else; the fund's own fact sheet is the authoritative source.";
export const DETAIL_SOURCES_TITLE = "Where each figure came from";
export const DETAIL_SOURCES_LEAD =
  "Every saved figure, with the line it was read from and whether you accepted or typed it.";
export const DETAIL_DELETE = "Remove from my funds";
export const DETAIL_DELETE_CONFIRM = "Remove {name} and all its fact sheets from your funds? This cannot be undone.";
export const DETAIL_COLUMN_FIGURE = "Figure";
export const DETAIL_COLUMN_VALUE = "Saved value";
export const DETAIL_COLUMN_SOURCE = "Source";

export const SOURCE_READ = "Read from page {page}";
export const SOURCE_READ_NO_PAGE = "Read from the sheet";
export const SOURCE_READ_CHECKED = "Read from page {page}, flagged and confirmed by you";
export const SOURCE_READ_GRAPHIC = "Read off a graphic on page {page}, confirmed by you";
export const SOURCE_TYPED = "Typed by you; not on the sheet";
export const SOURCE_CORRECTED = "Corrected by you; AI read {value}";
export const SOURCE_CLEARED = "Left blank by you; AI read {value}";
export const SOURCE_DERIVED = "Placed on the 1 to 5 scale from the risk rating";

export const DETAIL_RISK_OFF_SCALE =
  "The sheet's own rating, “{raw}”, is not one this app places on its 1 to 5 scale.";
export const DETAIL_RISK_NONE = "The fact sheet you uploaded gives no risk rating.";
export const DETAIL_NOT_MATCHED =
  "Uploaded funds are never matched to a profile: only funds in the catalogue are.";
export const DETAIL_PROVENANCE_TITLE = "Where this came from";
export const DETAIL_PROVENANCE_UPLOADED =
  "Read by AI from a fact sheet you uploaded, then checked by you. The PDF itself was not kept; " +
  "each figure below shows the line it was read from.";

export const VALUE_YES = "Yes";
export const VALUE_NO = "No";
