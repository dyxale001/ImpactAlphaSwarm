import { settingsPath } from "../../utils/settingsTabs";
import { Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import type { CatalogueBracket } from "../../services/api/fundCatalogue";
import { BAND_WORDS, PURPOSE_WORDS, type GoalPurpose, type HorizonBand } from "../../utils/goals";
import {
  MATCH_ANSWERED_LABEL,
  MATCH_APPLIED_LABEL,
  MATCH_INPUTS_ACTION,
  MATCH_INPUTS_LEAD,
  MATCH_INPUTS_TITLE,
  MATCH_CALLOUT_HEADLINE,
  MATCH_CALLOUT_HEADLINE_NO_CEILING,
  MATCH_INPUT_HORIZON_LABEL,
  MATCH_INPUT_PURPOSE_LABEL,
  MATCH_INPUT_UNANSWERED,
  MATCH_NARROWED_BY_HORIZON,
  MATCH_NARROWED_BY_PURPOSE,
} from "../../utils/fundsCopy";

/**
 * The answers the matched list is filtered on, as one row above the funds.
 *
 * "Why these funds" is the question the matched tab has to answer. Every value
 * comes off the bracket the SERVER returns, computed by the same matcher that
 * chose the funds — deriving them in the browser would eventually disagree with
 * the list they claim to explain.
 *
 * ## Why one callout
 *
 * It used to be a full card, then a row of answer chips. The figure that actually
 * decides the list, the highest published risk label shown, is now the headline,
 * and the answers behind it sit on one line beneath, so the reason for the list is
 * read first and the inputs second.
 *
 * The applied rating is listed only when it differs from the answered one, with
 * the sentence saying which rule lowered it. Unchanged, it would be the same word
 * twice.
 *
 * `ceiling` sits apart from the answers because it is derived rather than
 * answered, and it moves independently of the applied bracket — `HorizonRule`
 * caps the category set and leaves the ceiling where the risk answers put it,
 * while an emergency fund lowers both.
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
      : MATCH_NARROWED_BY_HORIZON.replace("{answered}", bracket.risk_tolerance);

  const ceiling = bracket.ceiling_label
    ? `${bracket.ceiling_label} (${bracket.ceiling} of 5)`
    : null;

  const answers = [
    { label: MATCH_ANSWERED_LABEL, value: bracket.risk_tolerance },
    { label: MATCH_INPUT_HORIZON_LABEL, value: horizon },
    { label: MATCH_INPUT_PURPOSE_LABEL, value: purpose },
    ...(narrowed ? [{ label: MATCH_APPLIED_LABEL, value: bracket.effective }] : []),
  ];

  return (
    // One callout: the figure that decides the list as its headline, the answers
    // behind it on one line, and the way to change them.
    <section aria-label={MATCH_INPUTS_TITLE} className="as-card flex flex-wrap items-start gap-x-5 gap-y-3 p-4 sm:p-5">
      <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-forest-700" aria-hidden="true" />
      <div className="min-w-0 flex-[1_1_28rem] space-y-1">
        <h2 className="text-sm font-bold text-forest-900">
          {ceiling ? MATCH_CALLOUT_HEADLINE.replace("{ceiling}", ceiling) : MATCH_CALLOUT_HEADLINE_NO_CEILING}
        </h2>
        <dl className="flex flex-col gap-y-1 text-xs text-brand-muted-fg sm:flex-row sm:flex-wrap sm:gap-x-3">
          {answers.map((answer, i) => (
            <div key={answer.label} className="inline-flex items-baseline gap-1">
              {i > 0 && <span aria-hidden="true" className="mr-2 hidden text-forest-900/25 sm:inline">·</span>}
              <dt>{answer.label}:</dt>
              <dd className={answer.value ? "font-semibold text-forest-900" : ""}>
                {answer.value ?? MATCH_INPUT_UNANSWERED}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-relaxed text-brand-muted-fg">
          {MATCH_INPUTS_LEAD}
          {because ? ` ${because}` : ""}
        </p>
      </div>
      <Link to={settingsPath("profile")} className="as-btn as-btn-sm as-btn-secondary shrink-0">
        {MATCH_INPUTS_ACTION}
      </Link>
    </section>
  );
}
