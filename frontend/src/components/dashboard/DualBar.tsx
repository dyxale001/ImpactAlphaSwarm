/**
 * Sentiment tone + quant position.
 *
 * The two halves are deliberately drawn DIFFERENTLY, because they are different
 * kinds of measurement:
 *
 *  - Sentiment is a measured tone on a 0-100 scale, so a proportional bar is a
 *    fair depiction of it.
 *  - Quant is NOT a 0-100 quality score. When the peer percentile is available it
 *    is drawn as a position MARKER on a neutral track — matching
 *    QuantMetricsPanel, which avoided fill bars precisely because a filled bar
 *    reads as "score out of 100". The old version rendered the legacy composite
 *    `raw_quant_score` as a fill bar labelled "Quantitative Score", with a tooltip
 *    claiming it evaluated "the underlying mathematical strength of the asset" —
 *    a quality verdict, and the covert buy-o-meter the transparency pivot removes.
 *
 * Legacy rows (no percentile) keep the old bar so nothing breaks; that is why
 * `quantitativeScore` is still accepted.
 */
export default function DualBar({
  sentimentScore,
  quantitativeScore,
  quantPercentile = null,
  onDark = false,
}: {
  sentimentScore: number;
  quantitativeScore: number;
  /** Mean peer percentile (0-100) from the disclosed sub-dimensions. When given,
   *  the quant half becomes a position marker instead of a score bar. */
  quantPercentile?: number | null;
  /** Render on a dark (forest) surface: lime labels/fills, light text, tinted tracks. */
  onDark?: boolean;
}) {
  const hasPercentile =
    quantPercentile !== null && !Number.isNaN(quantPercentile as number);
  const markerPos = hasPercentile
    ? Math.max(2, Math.min(98, quantPercentile as number))
    : 0;

  const labelTone = onDark ? "text-brand-accent" : "text-primary";
  const valueTone = onDark ? "text-brand-bg" : "text-foreground";
  const trackTone = onDark ? "bg-white/15" : "bg-background";
  const fillTone = onDark ? "bg-brand-accent" : "bg-primary";

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="relative group inline-block">
            <span
              className={`text-[10px] uppercase tracking-widest font-semibold ${labelTone}`}
            >
              Sentiment Score
            </span>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 mt-2 w-64 z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                A measure of market mood from trusted news articles and social
                posts. Higher means the tone of that coverage is more positive — it
                describes what is being said, not what will happen.
              </div>
            </div>
          </span>
          <span className={`font-mono font-semibold ${valueTone}`}>
            {sentimentScore}%
          </span>
        </div>
        <div className={`h-1.5 w-full rounded-full overflow-hidden ${trackTone}`}>
          <div
            className={`h-full ${fillTone}`}
            style={{ width: `${sentimentScore}%` }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="relative group inline-block">
            <span
              className={`text-[10px] uppercase tracking-widest font-semibold ${labelTone}`}
            >
              {hasPercentile ? "Quant Position vs Peers" : "Quantitative Score"}
            </span>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 mt-2 w-64 z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                {hasPercentile
                  ? "Where this asset's price measurements (momentum, risk-adjusted return, stability) sit relative to the other assets analysed in the same run. A factual position among today's candidates — not a rating, and not a forecast."
                  : "A data-driven reading from technical indicators. Shown for runs recorded before the disclosed per-metric breakdown was available."}
              </div>
            </div>
          </span>
          <span className={`font-mono font-semibold ${valueTone}`}>
            {hasPercentile
              ? `${Math.round(quantPercentile as number)}th pctile`
              : `${quantitativeScore}%`}
          </span>
        </div>
        {hasPercentile ? (
          // Marker on a neutral track: a position, not a filled quantity.
          <div className={`relative h-1.5 w-full rounded-full ${trackTone}`}>
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 shadow-sm ${
                onDark
                  ? "bg-brand-accent border-brand-primary"
                  : "bg-brand-primary border-brand-surface"
              }`}
              style={{ left: `${markerPos}%` }}
            />
          </div>
        ) : (
          <div className={`h-1.5 w-full rounded-full overflow-hidden ${trackTone}`}>
            <div
              className={`h-full ${fillTone}`}
              style={{ width: `${quantitativeScore}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
