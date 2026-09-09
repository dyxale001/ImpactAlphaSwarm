import { Link } from "react-router-dom";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import type { CatalogueBracket } from "../../services/api/fundCatalogue";
import { BAND_WORDS, PURPOSE_WORDS, type GoalPurpose, type HorizonBand } from "../../utils/goals";
import {
  MATCH_ANSWERED_LABEL,
  MATCH_APPLIED_LABEL,
  MATCH_APPLIED_UNCHANGED,
  MATCH_INPUTS_ACTION,
  MATCH_INPUTS_LEAD,
  MATCH_INPUTS_TITLE,
  MATCH_INPUT_CEILING_LABEL,
  MATCH_INPUT_HORIZON_LABEL,
  MATCH_INPUT_PURPOSE_LABEL,
  MATCH_INPUT_UNANSWERED,
  MATCH_NARROWED_BY_HORIZON,
  MATCH_NARROWED_BY_PURPOSE,
} from "../../utils/fundsCopy";

/**
 * The answers the match above is filtered on, with the APPLIED rating leading.
 *
 * "Why these funds" is the question this page has to answer, and until now the
 * only trace of the inputs was a caption beside the section heading. Every
 * value comes off the bracket the SERVER returns, computed by the same matcher
 * that chose the funds — deriving them in the browser would eventually
 * disagree with the list they claim to explain.
 *
 * ## Why it is laid out in two columns
 *
 * One consequence on the left, the answers behind it on the right. The first
 * version stacked four blocks down the card with a paragraph wedged between the
 * rating and the answers, which made it tall, put the explanation before the
 * thing it explained, and nested a panel inside a panel. Cause and effect now
 * sit side by side and the card is about half the height.
 *
 * The reason sentence deliberately does not repeat the horizon band or the
 * purpose: both are labelled values a few centimetres to the right, and saying
 * them twice was most of the wasted space.
 *
 * `ceiling` is ruled off from the two answers because it is derived rather than
 * answered, and it moves independently of the applied bracket — `HorizonRule`
 * caps the category set and leaves the ceiling where the risk answers put it,
 * while an emergency fund lowers both. Pairing it with the headline would
 * suggest they change together.
 */
export default function MatchInputs({ bracket }: { bracket: CatalogueBracket }) {
  const horizon = bracket.horizon_band
    ? BAND_WORDS[bracket.horizon_band as HorizonBand] ?? bracket.horizon_band
    : null;
  const purpose = bracket.purpose
    ? PURPOSE_WORDS[bracket.purpose as GoalPurpose] ?? bracket.purpose
    : null;

  const narrowed = bracket.effective !== bracket.risk_tolerance;

  // Only two rules can lower the applied bracket, so naming the cause is a
  // reading of the data rather than a guess. An emergency fund forces
  // Conservative outright; anything else that narrowed can only be the horizon.
  // `test_only_two_rules_can_change_the_applied_bracket` holds that pair
  // complete on the server, where the rules live.
  const because = !narrowed
    ? MATCH_APPLIED_UNCHANGED
    : bracket.purpose === "emergency_fund"
      ? MATCH_NARROWED_BY_PURPOSE.replace("{answered}", bracket.risk_tolerance)
      : MATCH_NARROWED_BY_HORIZON.replace("{answered}", bracket.risk_tolerance);

  return (
    <section className="soft-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-brand-primary">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-brand-accent" />
          {MATCH_INPUTS_TITLE}
        </h2>
        <Link
          to="/settings"
          className="text-[11px] font-semibold text-brand-primary hover:underline"
        >
          {MATCH_INPUTS_ACTION}
        </Link>
      </div>

      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-brand-secondary/75">
        {MATCH_INPUTS_LEAD}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-brand-border/40 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── The consequence ── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-accent">
            {MATCH_APPLIED_LABEL}
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {narrowed && (
              <>
                <span className="text-base font-semibold text-brand-secondary/45 line-through decoration-brand-secondary/35">
                  {bracket.risk_tolerance}
                </span>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 self-center text-brand-secondary/40"
                  aria-hidden="true"
                />
              </>
            )}
            <span className="text-2xl font-bold leading-none text-brand-primary lg:text-[28px]">
              {bracket.effective}
            </span>
          </div>
          {narrowed && (
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-brand-secondary/50">
              {MATCH_ANSWERED_LABEL}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-brand-secondary">{because}</p>
        </div>

        {/* ── The answers behind it ── */}
        <dl className="space-y-2 self-start lg:border-l lg:border-brand-border/40 lg:pl-8">
          <Row label={MATCH_INPUT_HORIZON_LABEL} value={horizon} />
          <Row label={MATCH_INPUT_PURPOSE_LABEL} value={purpose} />
          <div className="border-t border-brand-border/40 pt-2">
            <Row
              label={MATCH_INPUT_CEILING_LABEL}
              value={
                bracket.ceiling_label ? `${bracket.ceiling_label} (${bracket.ceiling} of 5)` : null
              }
              derived
            />
          </div>
        </dl>
      </div>
    </section>
  );
}

/** One answer on a line, label left and value right. An unanswered question is
 *  not a zero: it is the reason the list above is wider than it could be, so it
 *  is stated rather than hidden. */
function Row({
  label,
  value,
  derived = false,
}: {
  label: string;
  value: string | null;
  derived?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-secondary/60">
        {label}
      </dt>
      <dd
        className={`shrink-0 text-right text-xs font-semibold ${
          value ? (derived ? "text-brand-accent" : "text-brand-primary") : "text-brand-secondary/45"
        }`}
      >
        {value ?? MATCH_INPUT_UNANSWERED}
      </dd>
    </div>
  );
}
