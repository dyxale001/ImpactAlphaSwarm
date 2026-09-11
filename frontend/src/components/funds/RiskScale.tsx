import { RISK_SCALE_TITLE } from "../../utils/fundsCopy";

/**
 * The fund manager's own risk profile indicator, on its five-step scale.
 *
 * Rendered as the manager's scale rather than as a score of ours, because that
 * is exactly what it is: every fact sheet carries this indicator, and the whole
 * matching rule is that a fund's own label must sit at or below the level the
 * user's answers imply. A number we invented would look identical here, which is
 * why the wording says who published it.
 *
 * A fund whose manager publishes no indicator gets the note instead of a
 * greyed-out scale. Absent is a fact about the manager, not a gap in the fund.
 *
 * `onDark` exists because this now leads the fund page's forest hero as well as
 * sitting on white cards. The filled pips are lime on both grounds — that is
 * the accent doing its job — but the empty ones are `brand-border/40`, a 14%
 * black that simply is not there over forest-700, which would turn a 3-of-5
 * scale into three floating dashes with no scale behind them.
 */
export default function RiskScale({
  level,
  label,
  note,
  compact = false,
  onDark = false,
}: {
  level: number | null;
  label: string | null;
  note?: string | null;
  compact?: boolean;
  /** Rendered on the forest hero rather than on a white card. */
  onDark?: boolean;
}) {
  if (level === null) {
    return note ? (
      <p
        className={`text-xs leading-relaxed ${
          onDark ? "text-lime-100/80" : "text-brand-secondary/80"
        }`}
      >
        {note}
      </p>
    ) : null;
  }

  const steps = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col gap-1.5">
      {!compact && (
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
            onDark ? "text-lime-100/60" : "text-brand-secondary/70"
          }`}
        >
          {RISK_SCALE_TITLE}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1" role="img" aria-label={`Risk level ${level} of 5`}>
          {steps.map((step) => (
            <span
              key={step}
              className={`h-1.5 w-5 rounded-full ${
                step <= level
                  ? "bg-brand-accent"
                  : onDark
                    ? "bg-white/25"
                    : "bg-brand-border/40"
              }`}
            />
          ))}
        </div>
        {label && (
          <span
            className={`text-xs font-semibold ${onDark ? "text-lime-100" : "text-brand-primary"}`}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
