/**
 * Keeping earlier versions of the answers a profile was derived from.
 *
 * When someone revises their questionnaire or their goals, the previous set is
 * pushed onto a history list rather than replaced. The reason is the fund
 * page: every matched fund carries a sentence citing the answers the match used
 * ("a five-year horizon, growth"). If revising simply overwrote, that sentence
 * would refer to answers that no longer exist anywhere, and nobody could check
 * whether a match had been reasonable when it was made.
 *
 * Pure, so the rule can be tested without a database or a rendered form.
 */

/** How many past versions to keep. Enough to explain a recent match; bounded so
 *  one row cannot grow forever. */
export const HISTORY_LIMIT = 10;

export const HISTORY_KEY = "_history";

export interface AnswerVersion {
  at: string;
  answers: Record<string, unknown>;
}

/** The stored answers without the history, which is rebuilt on every write. */
export function withoutHistory(stored: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...stored };
  delete copy[HISTORY_KEY];
  return copy;
}

/** The existing versions, newest first. Tolerates a row that has none. */
export function historyOf(stored: Record<string, unknown>): AnswerVersion[] {
  const raw = stored[HISTORY_KEY];
  return Array.isArray(raw) ? (raw as AnswerVersion[]) : [];
}

/**
 * The next value of `survey_answers`: the new answers, with what was there
 * pushed onto the front of the history.
 *
 * The archived entry excludes the history itself, or each save would nest the
 * previous save inside it and the row would grow geometrically.
 */
export function withHistory(
  stored: Record<string, unknown>,
  next: Record<string, unknown>,
  now: Date = new Date(),
): Record<string, unknown> {
  const previous = withoutHistory(stored);
  const archived: AnswerVersion[] =
    Object.keys(previous).length > 0
      ? [{ at: now.toISOString(), answers: previous }, ...historyOf(stored)]
      : historyOf(stored);

  return {
    ...withoutHistory(next),
    [HISTORY_KEY]: archived.slice(0, HISTORY_LIMIT),
  };
}
