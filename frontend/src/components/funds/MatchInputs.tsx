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
 * The applied rating is the emphasis rather than the answered one, because
 * those two differ often enough to matter and the difference is the page's most
 * confusing moment: somebody who answered Aggressive, looking at three cautious
 * funds, would reasonably think it was broken.
 *
 * `ceiling` is shown as its own value and is deliberately NOT part of the
 * headline. It moves independently of the applied bracket: `HorizonRule` caps
 * the category set and leaves the ceiling where the risk answers put it, while
 * an emergency fund lowers both.
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
    ? null
    : bracket.purpose === "emergency_fund"
      ? MATCH_NARROWED_BY_PURPOSE.replace("{answered}", bracket.risk_tolerance)
      : MATCH_NARROWED_BY_HORIZON.replace("{answered}", bracket.risk_tolerance).replace(
          "{band}",
          horizon ?? "less time than the funds above ask for",
        );

  return (
    <section className="soft-card space-y-4 p-5">
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

      {/* ── The applied rating, and the drop when there is one ── */}
      <div className="rounded-lg bg-brand-bg/60 p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          {narrowed && (
            <>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-secondary/60">
                  {MATCH_ANSWERED_LABEL}
                </p>
                <p className="text-lg font-semibold leading-tight text-brand-secondary/50 line-through decoration-brand-secondary/40">
                  {bracket.risk_tolerance}
                </p>
              </div>
              <ArrowRight
                className="mb-1 h-4 w-4 shrink-0 text-brand-secondary/40"
                aria-hidden="true"
              />
            </>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-accent">
              {MATCH_APPLIED_LABEL}
            </p>
            <p className="text-2xl font-bold leading-tight text-brand-primary lg:text-3xl">
              {bracket.effective}
            </p>
          </div>
        </div>

        <p className="mt-2.5 max-w-3xl text-[11px] leading-relaxed text-brand-secondary">
          {because ?? MATCH_APPLIED_UNCHANGED}
        </p>
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-brand-secondary/80">
        {MATCH_INPUTS_LEAD}
      </p>

      {/* The two goal answers, and the ceiling they combine with. The risk
          answer is not repeated here — it is the headline above. */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-brand-border/40 pt-3 sm:grid-cols-3">
        <Input label={MATCH_INPUT_HORIZON_LABEL} value={horizon} />
        <Input label={MATCH_INPUT_PURPOSE_LABEL} value={purpose} />
        <Input
          label={MATCH_INPUT_CEILING_LABEL}
          value={
            bracket.ceiling_label ? `${bracket.ceiling_label} (${bracket.ceiling} of 5)` : null
          }
          derived
        />
      </dl>
    </section>
  );
}

/** One answer, or an honest blank. An unanswered question is not a zero: it is
 *  the reason the list above is wider than it could be. */
function Input({
  label,
  value,
  derived = false,
}: {
  label: string;
  value: string | null;
  derived?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-secondary/60">
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold ${
          value ? (derived ? "text-brand-accent" : "text-brand-primary") : "text-brand-secondary/50"
        }`}
      >
        {value ?? MATCH_INPUT_UNANSWERED}
      </dd>
    </div>
  );
}
