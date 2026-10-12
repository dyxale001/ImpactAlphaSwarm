// Two facts about where an asset sits, written as one line: the universe it belongs to
// and the exchange it trades on, with a neon green bar between them ("Technology |
// Nasdaq"). Shown under the ticker on the asset page, and on the dashboard's cards,
// rows and top pick hero, so a reader meets them before opening the full analysis.
//
// The bar is the brand's lime and is decoration only, so it is hidden from screen
// readers, which read the two facts as "Technology, Nasdaq". `onDark` is for the forest
// hero panel, where the words switch to the light text the rest of the hero uses and
// the bar is the neon lime-500. On a light card that neon all but vanishes against
// white, so there the bar takes lime-700, the deepest step of the same ramp.
//
// Either fact is left out when it is unknown, and the bar goes with it: an asset with
// no universe yet, or an exchange the lookup could not find. Nothing is better than a
// guess.
export function ListingLine({
  universe,
  exchange,
  onDark = false,
  className = "",
}: {
  universe: string | null | undefined;
  exchange: string | null | undefined;
  onDark?: boolean;
  /** Spacing from the surrounding layout, e.g. "mb-3". */
  className?: string;
}) {
  const sector = (universe ?? "").trim();
  if (!sector && !exchange) return null;

  return (
    <p
      className={`flex flex-wrap items-center gap-x-2 text-xs font-semibold ${
        onDark ? "text-brand-bg" : "text-brand-fg"
      } ${className}`}
    >
      {sector && <span title={`Part of the ${sector} universe`}>{sector}</span>}
      {sector && exchange && (
        <>
          <span
            aria-hidden="true"
            className={`font-bold ${onDark ? "text-lime-500" : "text-lime-700"}`}
          >
            |
          </span>
          <span className="sr-only">, </span>
        </>
      )}
      {exchange && <span title={`Listed on the ${exchange}`}>{exchange}</span>}
    </p>
  );
}
