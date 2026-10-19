import { settingsPath } from "../../../utils/settingsTabs";
import { Link } from "react-router-dom";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { useFundMatches } from "../../../hooks/useFundCatalogue";
import type { CatalogueBracket } from "../../../services/api/fundCatalogue";
import { BAND_WORDS, PURPOSE_WORDS, type GoalPurpose, type HorizonBand } from "../../../utils/goals";
import {
  COMPLETE_PROFILE_ACTION,
  COMPLETE_PROFILE_TITLE,
  FUND_BRACKET_ACTION,
  FUND_BRACKET_APPLIED_LABEL,
  FUND_BRACKET_CATEGORIES_LABEL,
  FUND_BRACKET_LOAD_FAILED,
  FUND_BRACKET_NO_PROFILE,
  FUND_BRACKET_PROVENANCE,
  FUND_BRACKET_TRACKER_ONLY,
  MATCH_INPUT_CEILING_LABEL,
  MATCH_INPUT_HORIZON_LABEL,
  MATCH_INPUT_PURPOSE_LABEL,
  MATCH_INPUT_UNANSWERED,
  MATCH_NARROWED_BY_HORIZON,
  MATCH_NARROWED_BY_PURPOSE,
  formatBracketCount,
} from "../../../utils/fundsCopy";
import { WidgetEmpty, WidgetHeaderLink, WidgetLoading } from "./widgetChrome";

/**
 * The funds section's one tile on the dashboard: "Your fund bracket".
 *
 * ## Why it shows a bracket and not funds
 *
 * The funds page lists funds because a reader arrived there asking for them,
 * under a heading that states the filter and beside the whole catalogue. The
 * dashboard is different: it is the first thing everyone sees, and a fund name
 * placed there unasked is the product choosing one. So this tile names the
 * RATING the answers score to, the ceiling that rating puts on a manager's own
 * published label, and the categories that are in play — the rule, not its
 * output — and links to the page that applies it. The design note fixed the
 * tile's shape this way before it was built.
 *
 * ## Where the values come from
 *
 * Every value is read off the same server bracket the funds page renders in
 * `MatchInputs`, from the matcher that chooses the funds. Nothing is derived
 * here from the profile, because a tile that worked the bracket out for itself
 * would one day disagree with the list it points at.
 *
 * ## The four states
 *
 * Loading, failed, no risk profile yet, and the bracket. The failed state says
 * what did not load and nothing else; the no-profile state says what the tile
 * will show once the questions are answered, which is a statement about the
 * tile rather than an instruction to the reader. When the horizon and purpose
 * are unanswered the bracket still shows — the risk answers alone are enough
 * to compute it — with the page's own "two more answers" line as the way in.
 */
export function FundBracketWidget({ size }: WidgetProps) {
  const { matches, bracket, profileFound, fallbackRiskOnly, isLoading, error } =
    useFundMatches();

  if (isLoading) return <WidgetLoading rows={3} />;
  if (error) return <WidgetEmpty message={FUND_BRACKET_LOAD_FAILED} grow />;
  if (!profileFound || !bracket) {
    return (
      <WidgetEmpty
        message={FUND_BRACKET_NO_PROFILE}
        grow
        action={
          <Link
            to={settingsPath("profile")}
            className="as-btn as-btn-sm as-btn-secondary"
          >
            {COMPLETE_PROFILE_ACTION}
          </Link>
        }
      />
    );
  }

  const narrowed = bracket.effective !== bracket.risk_tolerance;
  // Only two rules can lower the applied bracket, and the page names which. An
  // emergency fund forces Conservative outright; anything else that narrowed can
  // only be the horizon. `MatchInputs` makes the same reading from the same data.
  const narrowedBecause = !narrowed
    ? null
    : bracket.purpose === "emergency_fund"
      ? MATCH_NARROWED_BY_PURPOSE.replace("{answered}", bracket.risk_tolerance)
      : MATCH_NARROWED_BY_HORIZON.replace("{answered}", bracket.risk_tolerance);

  const wide = size === "wide";
  const small = size === "small";

  // The Settings risk card's ceiling box: the rating applied and the ceiling it
  // sets as five pips, with the answers beside it when the widget is wide.
  return (
    <div className="flex h-full flex-col gap-3">
      <WidgetHeaderLink to="/funds">{FUND_BRACKET_ACTION}</WidgetHeaderLink>
      <div className={wide ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-6" : "space-y-3"}>
        {/* ── The rating applied, and the ceiling it sets ── */}
        <div className="space-y-3">
          <div className="as-inset p-4">
            <p className="text-xs text-brand-muted-fg">{FUND_BRACKET_APPLIED_LABEL}</p>
            <p className="mt-1 text-xl font-bold tracking-[-0.01em] text-forest-900">{bracket.effective}</p>
            <p className="mt-3 text-xs text-brand-muted-fg">{MATCH_INPUT_CEILING_LABEL}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex gap-[3px]" role="img" aria-label={`${bracket.ceiling ?? 0} of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <i
                    key={n}
                    className={`h-1.5 w-[18px] rounded-full ${n <= (bracket.ceiling ?? 0) ? "bg-forest-700" : "bg-forest-100"}`}
                  />
                ))}
              </span>
              <b className="text-sm tabular-nums text-forest-900">{bracket.ceiling ?? 0} of 5</b>
              {bracket.ceiling_label && <span className="text-xs text-brand-muted-fg">{bracket.ceiling_label}</span>}
            </div>
          </div>
          {!small && narrowedBecause && (
            <p className="text-xs leading-relaxed text-brand-muted-fg">{narrowedBecause}</p>
          )}
          {wide && <Answers bracket={bracket} />}
        </div>

        {/* ── The categories in play ── */}
        {!small && (
          <div className={wide ? "border-l border-forest-900/8 pl-6" : "border-t border-forest-900/8 pt-3"}>
            <p className="text-xs font-semibold text-brand-muted-fg">{FUND_BRACKET_CATEGORIES_LABEL}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {bracket.categories.map((category) => {
                const trackersOnly = bracket.tracker_only.includes(category.code);
                return (
                  <li key={category.code} className="chip chip-line">
                    {category.name}
                    {trackersOnly && <span className="text-brand-muted-fg"> · {FUND_BRACKET_TRACKER_ONLY}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* ── The count, and the way to the list ── */}
      <div className="mt-auto space-y-1.5 border-t border-forest-900/8 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-semibold text-forest-900">{formatBracketCount(matches.length)}</p>
          {fallbackRiskOnly && (
            <Link
              to={settingsPath("profile")}
              className="text-xs font-bold text-forest-700 hover:underline"
            >
              {COMPLETE_PROFILE_TITLE}
            </Link>
          )}
        </div>
        {!small && (
          <p className="text-xs leading-relaxed text-brand-muted-fg">{FUND_BRACKET_PROVENANCE}</p>
        )}
      </div>
    </div>
  );
}

/** The two answers behind the bracket besides the risk score, shown only at
 *  the wide size where there is room to say what was answered. An unanswered
 *  one is stated rather than dropped: it is the reason the bracket is as wide
 *  as it is. */
function Answers({ bracket }: { bracket: CatalogueBracket }) {
  const horizon = bracket.horizon_band
    ? BAND_WORDS[bracket.horizon_band as HorizonBand] ?? bracket.horizon_band
    : null;
  const purpose = bracket.purpose
    ? PURPOSE_WORDS[bracket.purpose as GoalPurpose] ?? bracket.purpose
    : null;

  return (
    <dl className="space-y-1.5 border-t border-forest-900/8 pt-3">
      <Answer label={MATCH_INPUT_HORIZON_LABEL} value={horizon} />
      <Answer label={MATCH_INPUT_PURPOSE_LABEL} value={purpose} />
    </dl>
  );
}

function Answer({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-brand-muted-fg">{label}</dt>
      <dd
        className={`shrink-0 text-right text-xs font-semibold ${
          value ? "text-forest-900" : "text-brand-muted-fg"
        }`}
      >
        {value ?? MATCH_INPUT_UNANSWERED}
      </dd>
    </div>
  );
}
