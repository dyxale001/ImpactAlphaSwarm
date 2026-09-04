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
 */
export default function RiskScale({
  level,
  label,
  note,
  compact = false,
}: {
  level: number | null;
  label: string | null;
  note?: string | null;
  compact?: boolean;
}) {
  if (level === null) {
    return note ? (
      <p className="text-xs leading-relaxed text-brand-secondary/80">{note}</p>
    ) : null;
  }

  const steps = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col gap-1.5">
      {!compact && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-secondary/70">
          {RISK_SCALE_TITLE}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1" role="img" aria-label={`Risk level ${level} of 5`}>
          {steps.map((step) => (
            <span
              key={step}
              className={`h-1.5 w-5 rounded-full ${
                step <= level ? "bg-brand-accent" : "bg-brand-border/40"
              }`}
            />
          ))}
        </div>
        {label && (
          <span className="text-xs font-semibold text-brand-primary">{label}</span>
        )}
      </div>
    </div>
  );
}
