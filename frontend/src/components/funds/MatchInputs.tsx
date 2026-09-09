import { Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import type { CatalogueBracket } from "../../services/api/fundCatalogue";
import { BAND_WORDS, PURPOSE_WORDS, type GoalPurpose, type HorizonBand } from "../../utils/goals";
import {
  MATCH_INPUTS_ACTION,
  MATCH_INPUTS_LEAD,
  MATCH_INPUTS_NARROWED,
  MATCH_INPUTS_TITLE,
  MATCH_INPUT_CEILING_LABEL,
  MATCH_INPUT_HORIZON_LABEL,
  MATCH_INPUT_PURPOSE_LABEL,
  MATCH_INPUT_RISK_LABEL,
  MATCH_INPUT_UNANSWERED,
} from "../../utils/fundsCopy";

/**
 * The answers the match above is filtered on, shown under the header.
 *
 * "Why these funds" is the question this page has to be able to answer, and
 * until now the only trace of the inputs was a caption beside the section
 * heading. All four values come off the bracket the SERVER returns, computed by
 * the same matcher that chose the funds — deriving them in the browser would
 * eventually disagree with the list they claim to explain.
 *
 * The narrowing line is the part worth having. A reader whose risk answers
 * scored Aggressive, seeing three cautious funds, would reasonably think the
 * page was broken; the horizon or the purpose capped the bracket, and saying so
 * is cheaper than letting them guess.
 *
 * It speaks about the CATEGORIES rather than the ceiling, because those two
 * move independently: `HorizonRule` caps the category set and leaves the
 * ceiling where the risk answers put it, while an emergency fund lowers both.
 * The ceiling is its own labelled value in the grid for that reason.
 *
 * Wording is the reviewed vocabulary: every value here is something the user
 * answered or something their answers scored to, so this describes a filter and
 * never a proposal.
 */
export default function MatchInputs({ bracket }: { bracket: CatalogueBracket }) {
  const horizon = bracket.horizon_band
    ? BAND_WORDS[bracket.horizon_band as HorizonBand] ?? bracket.horizon_band
    : null;
  const purpose = bracket.purpose
    ? PURPOSE_WORDS[bracket.purpose as GoalPurpose] ?? bracket.purpose
    : null;

  // The bracket actually applied can sit below what the risk answers alone
  // scored to, because the horizon caps it and an emergency fund overrides it.
  const narrowed = bracket.effective !== bracket.risk_tolerance;

  return (
    <section className="soft-card space-y-3 p-5">
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

      <p className="max-w-3xl text-xs leading-relaxed text-brand-secondary/80">
        {MATCH_INPUTS_LEAD}
      </p>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-brand-border/40 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label={MATCH_INPUT_RISK_LABEL} value={bracket.risk_tolerance} />
        <Input label={MATCH_INPUT_HORIZON_LABEL} value={horizon} />
        <Input label={MATCH_INPUT_PURPOSE_LABEL} value={purpose} />
        <Input
          label={MATCH_INPUT_CEILING_LABEL}
          value={
            bracket.ceiling_label
              ? `${bracket.ceiling_label} (${bracket.ceiling} of 5)`
              : null
          }
          derived
        />
      </dl>

      {narrowed && (
        <p className="rounded-md bg-brand-bg/70 p-2.5 text-[11px] leading-relaxed text-brand-secondary">
          {MATCH_INPUTS_NARROWED.replace("{answered}", bracket.risk_tolerance).replace(
            "{effective}",
            bracket.effective,
          )}
        </p>
      )}
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
