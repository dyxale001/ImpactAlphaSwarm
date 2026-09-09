/** The goal answers: what the money is for, and by when.
 *
 * These four questions exist because of one criticism: onboarding collects a
 * rich picture of a person and the product used almost none of it. Each answer
 * here earns its place by mapping to something a fund manager already publishes,
 * so the filtering stays a lookup over disclosed labels rather than a judgement
 * this product is not licensed to make:
 *
 *   horizon      → the minimum investment term stated on a fact sheet
 *   purpose      → the liquidity and income categories of the classification
 *   account type → whether a fund can be held in a tax-free account
 *   contribution → the manager's stated minimums
 *
 * Age is deliberately NOT among them, even though onboarding already asks it:
 * mapping an age to an asset allocation is textbook advice, and horizon asks the
 * same question directly.
 *
 * Stored in `user_analysis.survey_answers` under one `goals` key, never as
 * top-level answers. The risk scorer sums every answer whose id begins with
 * `q_`, so a goal question named that way would silently become part of
 * someone's risk score. */

export type HorizonBand = "under_2" | "2_to_5" | "5_plus";
export type GoalPurpose = "emergency_fund" | "goal" | "growth" | "income";
export type AccountType = "tfsa" | "discretionary" | "unsure";
export type ContributionStyle = "lump_sum" | "monthly" | "both";

export interface Goals {
  horizon_band?: HorizonBand;
  horizon_target_year?: number;
  purpose?: GoalPurpose;
  account_type?: AccountType;
  contribution_style?: ContributionStyle;
  answered_at?: string;
}

/** Ids of the four questions, in the order they are asked. */
export const GOAL_QUESTION_IDS = [
  "goal_horizon",
  "goal_purpose",
  "goal_account_type",
  "goal_contribution",
] as const;

export type GoalQuestionId = (typeof GOAL_QUESTION_IDS)[number];

/** Years to add for each band, taken from its LOWER bound.
 *
 * The cautious end of the range on purpose. Someone answering "two to five
 * years" is promised nothing beyond two, so treating them as a five-year
 * investor could show them a fund whose own sheet asks for longer than they
 * have. */
export const HORIZON_BAND_YEARS: Record<HorizonBand, number> = {
  under_2: 1,
  "2_to_5": 2,
  "5_plus": 5,
};

/** Turn a band into a target year, so the answer ages on its own.
 *
 * This is the whole reason a year is stored rather than the band. A five-year
 * horizon answered in 2026 is a two-year horizon in 2029, and nobody goes back
 * to update it — so the matcher derives the band from what is LEFT of the target
 * year. Personalisation that cannot go stale, rather than personalisation that
 * quietly does while still claiming to be based on your answers. */
export function horizonTargetYear(band: HorizonBand, now: Date = new Date()): number {
  return now.getFullYear() + HORIZON_BAND_YEARS[band];
}

/** Build the object that gets stored, stamped with when it was answered. */
export function buildGoals(
  answers: Partial<Record<GoalQuestionId, string>>,
  now: Date = new Date(),
): Goals {
  const band = answers.goal_horizon as HorizonBand | undefined;
  return {
    ...(band ? { horizon_band: band, horizon_target_year: horizonTargetYear(band, now) } : {}),
    ...(answers.goal_purpose ? { purpose: answers.goal_purpose as GoalPurpose } : {}),
    ...(answers.goal_account_type ? { account_type: answers.goal_account_type as AccountType } : {}),
    ...(answers.goal_contribution
      ? { contribution_style: answers.goal_contribution as ContributionStyle }
      : {}),
    answered_at: now.toISOString(),
  };
}

/** Read goals back out of a stored survey_answers value.
 *
 * Tolerant of a JSON string as well as an object, because that column is read
 * both ways elsewhere, and of a record written before these questions existed —
 * which is most of them. Undefined means "not answered", and the funds page says
 * so rather than pretending to a fuller profile. */
export function goalsFromSurveyAnswers(surveyAnswers: unknown): Goals | undefined {
  let parsed = surveyAnswers;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const goals = (parsed as Record<string, unknown>).goals;
  if (!goals || typeof goals !== "object") return undefined;

  const candidate = goals as Goals;
  const answered =
    candidate.horizon_target_year !== undefined ||
    candidate.purpose !== undefined ||
    candidate.account_type !== undefined ||
    candidate.contribution_style !== undefined;
  return answered ? candidate : undefined;
}

export const PURPOSE_WORDS: Record<GoalPurpose, string> = {
  emergency_fund: "money you may need at short notice",
  goal: "saving towards a particular goal",
  growth: "long-term growth",
  income: "an income",
};

export const BAND_WORDS: Record<HorizonBand, string> = {
  under_2: "under 2 years",
  "2_to_5": "2 to 5 years",
  "5_plus": "5 years or more",
};

/** A short phrase for the profile card, or undefined if nothing was answered. */
export function describeGoals(goals?: Goals): string | undefined {
  if (!goals) return undefined;
  const parts: string[] = [];
  if (goals.horizon_band) parts.push(BAND_WORDS[goals.horizon_band]);
  if (goals.purpose) parts.push(PURPOSE_WORDS[goals.purpose]);
  return parts.length ? parts.join(" · ") : undefined;
}
