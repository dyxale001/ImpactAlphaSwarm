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
 * ## Why a row and not a tile
 *
 * It used to be a full two-column card between the page header and the first
 * fund, so a reader met a panel about their answers before any fund. The answers
 * are short labelled values, and as chips they fit one line on a laptop. The
 * figure that actually decides the list, the highest published risk label shown,
 * is the one dark chip, so it is found first.
 *
 * The applied rating gets a chip of its own only when it differs from the
 * answered one, with the sentence saying which rule lowered it. Unchanged, it
 * would be the same word twice.
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

  return (
    <section
      aria-label={MATCH_INPUTS_TITLE}
      className="soft-card flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4"
    >
      <h2 className="flex items-center gap-2 text-[13px] font-bold text-brand-primary">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-lime-700" />
        {MATCH_INPUTS_TITLE}
      </h2>

      <dl className="flex min-w-0 flex-[1_1_32rem] flex-wrap gap-2">
        <Chip label={MATCH_ANSWERED_LABEL} value={bracket.risk_tolerance} />
        <Chip label={MATCH_INPUT_HORIZON_LABEL} value={horizon} />
        <Chip label={MATCH_INPUT_PURPOSE_LABEL} value={purpose} />
        {narrowed && <Chip label={MATCH_APPLIED_LABEL} value={bracket.effective} dark />}
        <Chip label={MATCH_INPUT_CEILING_LABEL} value={ceiling} dark />
      </dl>

      <Link
        to={settingsPath("profile")}
        className="text-xs font-bold text-brand-primary underline decoration-brand-primary/35 underline-offset-[3px] transition-colors hover:decoration-brand-primary"
      >
        {MATCH_INPUTS_ACTION}
      </Link>

      <p className="basis-full text-xs leading-relaxed text-forest-500">
        {MATCH_INPUTS_LEAD}
        {because ? ` ${because}` : ""}
      </p>
    </section>
  );
}

/** One answer as a labelled chip. An unanswered question is not a zero: it is
 *  the reason the list is wider than it could be, so it is stated rather than
 *  hidden. `dark` marks what the matcher derived, rather than what was answered. */
function Chip({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string | null;
  dark?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 ${
        dark ? "bg-brand-primary" : "bg-forest-50"
      }`}
    >
      <dt className={`text-[11px] ${dark ? "text-lime-100/70" : "text-forest-500"}`}>{label}</dt>
      <dd
        className={`text-xs font-bold ${
          value
            ? dark
              ? "text-brand-accent"
              : "text-brand-primary"
            : dark
              ? "text-lime-100/70"
              : "text-forest-500"
        }`}
      >
        {value ?? MATCH_INPUT_UNANSWERED}
      </dd>
    </div>
  );
}
