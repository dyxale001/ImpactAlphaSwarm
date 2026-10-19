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
  MATCH_INPUT_CEILING_LABEL,
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
 * ## Why columns
 *
 * It used to be a row of answer chips, then one line of running text. As
 * labelled columns each answer is found where its label says, and the result
 * they produce, the highest published risk label shown, sits last on a panel of
 * its own, drawn on the same five steps as the fund cards.
 *
 * When the horizon or purpose lowered the rating, that column says "Applied to
 * this list" and the sentence underneath says which rule lowered it.
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
  ];

  return (
    // A title row, then the inputs as labelled columns with the result they produce,
    // the highest risk label shown, as the last column on a soft panel of its own.
    <section aria-label={MATCH_INPUTS_TITLE} className="as-card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-forest-900">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
          {MATCH_INPUTS_TITLE}
        </h2>
        <Link to={settingsPath("profile")} className="as-btn as-btn-sm as-btn-secondary">
          {MATCH_INPUTS_ACTION}
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {answers.map((answer) => (
          <div key={answer.label} className="flex flex-col gap-1 py-1">
            <dt className="text-xs text-brand-muted-fg">{answer.label}</dt>
            <dd className={`text-sm ${answer.value ? "font-bold text-forest-900" : "font-semibold text-forest-400"}`}>
              {answer.value ?? MATCH_INPUT_UNANSWERED}
            </dd>
          </div>
        ))}
        <div className="as-inset flex flex-col gap-1.5 px-3 py-2">
          <dt className="text-xs text-brand-muted-fg">
            {narrowed ? MATCH_APPLIED_LABEL : MATCH_INPUT_CEILING_LABEL}
          </dt>
          <dd>
            {bracket.ceiling != null && ceiling ? (
              // The fund cards' five steps, stretched across the panel with the
              // words underneath, so it fits a phone's half-width column.
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1" role="img" aria-label={`Risk level ${bracket.ceiling} of 5`}>
                  {[1, 2, 3, 4, 5].map((step) => (
                    <span
                      key={step}
                      className={`h-1.5 flex-1 rounded-full ${step <= bracket.ceiling! ? "bg-brand-accent" : "bg-forest-900/10"}`}
                    />
                  ))}
                </div>
                <span className="text-sm font-bold text-forest-900">{ceiling}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-forest-400">{MATCH_INPUT_UNANSWERED}</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="border-t border-forest-900/8 pt-3 text-xs leading-relaxed text-brand-muted-fg">
        {MATCH_INPUTS_LEAD}
        {because ? ` ${because}` : ""}
      </p>
    </section>
  );
}
