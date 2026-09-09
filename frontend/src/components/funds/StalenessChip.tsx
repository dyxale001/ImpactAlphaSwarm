import {
  STALENESS_AGEING,
  STALENESS_CURRENT,
  STALENESS_STALE,
  factSheetAgeDays,
} from "../../utils/fundsCopy";

/** The thresholds the admin catalogue already grades sheets by.
 *
 *  Copied deliberately rather than fetched: they are in `admin_routes.py` as
 *  `SOFT_STALE_DAYS` and `STALE_DAYS`, and a public card cannot make a request
 *  to an admin endpoint to learn them. Ninety days is the floor a quarterly
 *  document has to clear; forty-five is one monthly cycle plus a fortnight,
 *  which is where a sheet has stopped being the current one without yet being
 *  old. If the backend's numbers move, these move with them.
 */
export const SOFT_STALE_DAYS = 45;
export const STALE_DAYS = 90;

/**
 * How old the figures beside it are, in one word.
 *
 * Every number on a fund card is a quotation from a monthly document, and a
 * date on its own does not tell a reader whether they are looking at this
 * month's figures or the ones from three quarters ago. Of the eleven funds live
 * when this was written, three were between 313 and 466 days old, and the card
 * presented all three exactly as it presented the current ones.
 *
 * The word describes the document, never the reader's next move: "out of date"
 * is a fact about a sheet, where "check for a newer one" would be this page
 * telling somebody what to do about a fund it is not licensed to advise on.
 *
 * `onDark` is not a colour preference. The light tones are 10-16% washes over
 * white, and a 16% amber over forest-700 is mud rather than a warning, so on
 * the fund page's hero the two flags go solid: the stale one becomes filled
 * danger with white on it, which is the loudest thing this chip ever says and
 * the right volume for a sheet nearly a year and a half old.
 *
 * Nothing renders when there is no usable date. A fund with no fact sheet on
 * file already says so where its figures would be, and a chip reading "out of
 * date" beside no figures would be describing a document that does not exist.
 */
export default function StalenessChip({
  asOf,
  today,
  onDark = false,
}: {
  asOf: string | null | undefined;
  /** Injectable so a test can pin "now" rather than move with the clock. */
  today?: Date;
  /** Rendered on the forest hero rather than on a white card. */
  onDark?: boolean;
}) {
  const age = factSheetAgeDays(asOf, today);
  if (age === null) return null;

  const [label, tone] =
    age > STALE_DAYS
      ? [STALENESS_STALE, onDark ? "bg-danger text-white" : "bg-danger/10 text-danger"]
      : age > SOFT_STALE_DAYS
        ? [
            STALENESS_AGEING,
            onDark ? "bg-warning/20 text-warning" : "bg-warning/15 text-warning-strong",
          ]
        : [
            STALENESS_CURRENT,
            onDark ? "bg-white/10 text-lime-100" : "bg-brand-bg text-forest-500",
          ];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] ${tone}`}
    >
      {label}
    </span>
  );
}
