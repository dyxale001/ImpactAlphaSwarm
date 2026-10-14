import { SURVEY_QUESTIONS } from './onboardingData';
import { isRiskAnswer, psychometricBreakdown } from './scoringEngine';

export const RISK_REASONING_FALLBACK =
  'Your saved answers are missing, incomplete, or do not explain this rating under the current questionnaire. Review your answers to update your profile.';

const summaries: Record<string, string> = {
  Conservative: 'Taken together, your answers and the age and income adjustments place you in the Conservative range, which reflects a lower willingness or capacity to take investment risks.',
  Moderate: 'Taken together, your answers and the age and income adjustments place you in the Moderate range, between the lower and higher risk ranges.',
  Aggressive: 'Taken together, your risk-related answers, adjusted for age and income, produce a combined result in the Aggressive range, the higher risk range in this questionnaire.',
};

const highlights = [
  { id: 'q_portfolio_allocation', title: 'How you would split your money' },
  { id: 'q_worst_best_case', title: 'The gains and losses you would accept' },
  { id: 'q_investment_participation', title: 'What you would pay for the coin toss' },
];

/** Only saved, recognised inputs can justify a saved classification. */
export function riskProfileReasoning(saved: unknown, riskLabel: string | null) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !riskLabel || !Object.prototype.hasOwnProperty.call(summaries, riskLabel)) return null;
  const raw = saved as Record<string, unknown>;
  const required = SURVEY_QUESTIONS.filter(q => isRiskAnswer(q.id) || q.id === 'demo_age' || q.id === 'demo_income');
  const answers: Record<string, string> = {};
  for (const question of required) {
    const value = raw[question.id];
    if (typeof value !== 'string' || !question.options.some(o => o.value === value)) return null;
    answers[question.id] = value;
  }
  // Unknown q_ keys also enter the scorer. Do not silently discard their effect.
  if (Object.keys(raw).some(key => isRiskAnswer(key) && !Object.prototype.hasOwnProperty.call(answers, key))) return null;
  const result = psychometricBreakdown(answers);
  if (result.riskTolerance !== riskLabel || !Number.isFinite(result.finalRiskScore)) return null;

  const selectedLabel = (id: string) => SURVEY_QUESTIONS.find(q => q.id === id)!.options.find(o => o.value === answers[id])!.label;
  const effect = (adjustment: number) => adjustment > 0
    ? 'raised the overall result'
    : adjustment < 0 ? 'lowered the overall result' : 'left the overall result unchanged';

  return {
    summary: summaries[riskLabel],
    highlights: highlights.map(({ id, title }) => ({
      id, title, answer: selectedLabel(id),
    })),
    answerNote: 'These are three of the choices included in your rating. Across the risk questions, choices accepting more uncertainty or possible loss add more towards the higher risk ranges; choices favouring certainty add less.',
    capacity: `Your age answer (${selectedLabel('demo_age')}) ${effect(result.ageAdjustment)}. Your household income answer (${selectedLabel('demo_income')}) ${effect(result.incomeAdjustment)}. These adjustments are part of the questionnaire rules, rather than a separate assessment of your finances.`,
  };
}
