import { SURVEY_QUESTIONS } from "./onboardingData";

/**
 * How the twenty-question retake is paced.
 *
 * Onboarding asks all twenty at once, on a page built for nothing else. In
 * Settings the same list unrolled inside a card ran the page past nine
 * thousand pixels, so the retake is taken in four steps of five. The groups
 * follow the questionnaire's own structure: ten questions on attitude to risk,
 * five on financial knowledge, five about the person. Splitting the first ten
 * in half keeps every step the same length, which is what makes the progress
 * bar honest.
 *
 * Pure, so the grouping can be tested without rendering anything.
 */

export interface RetakeStep {
  title: string;
  /** Index of the first question in this step, inclusive. */
  from: number;
  /** Index one past the last question in this step. */
  to: number;
}

export const RETAKE_STEPS: readonly RetakeStep[] = [
  { title: "Attitude to risk", from: 0, to: 5 },
  { title: "Choices under uncertainty", from: 5, to: 10 },
  { title: "Financial knowledge", from: 10, to: 15 },
  { title: "About you", from: 15, to: 20 },
];

/** The questions asked in a step, in order. */
export function questionsInStep<T>(questions: readonly T[], step: number): readonly T[] {
  const s = RETAKE_STEPS[step];
  return s ? questions.slice(s.from, s.to) : [];
}

/** Whether every question in a step has an answer. */
export function stepComplete(
  answers: Record<string, string>,
  step: number,
  questions: readonly { id: string }[] = SURVEY_QUESTIONS,
): boolean {
  return questionsInStep(questions, step).every((q) => Boolean(answers[q.id]));
}

/** Progress through the retake as a percentage, counting the current step as
 *  under way rather than done, so the bar never reads "finished" before Save. */
export function retakeProgress(step: number): number {
  return Math.round(((step + 1) / RETAKE_STEPS.length) * 100);
}
