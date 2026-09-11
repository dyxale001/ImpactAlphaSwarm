import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { GOAL_QUESTIONS, SURVEY_QUESTIONS } from "../utils/onboardingData";
import { determinePsychometrics } from "../utils/scoringEngine";
import {
  buildGoals,
  goalAnswersFromGoals,
  goalsFromSurveyAnswers,
  type GoalQuestionId,
} from "../utils/goals";
import { lastSavedAt, withHistory, withoutHistory } from "../utils/profileHistory";

/**
 * Reading and revising the answers a user's profile is derived from.
 *
 * Both writes go to `user_analysis`, the row onboarding created. Two rules
 * shape this:
 *
 * **Risk is derived, never assigned.** `saveRetake` scores the answers and
 * stores what the scoring produced. Nothing here writes a risk label directly,
 * which is the whole reason this hook exists — Settings used to.
 *
 * **A previous set of answers is kept, not overwritten.** Both saves push what
 * was there into a history list first. Changing your goals silently would
 * leave earlier matches unexplainable: the reason sentence beside a fund cites
 * the answers it used, and those answers would no longer exist anywhere.
 */

export type ProfileSave = "goals" | "retake";

export function useProfileAnswers() {
  const { profile, analysis, fetchProfile } = useAuthStore();

  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [goalAnswers, setGoalAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which card's save just succeeded, so only that card says so. */
  const [savedWhat, setSavedWhat] = useState<ProfileSave | null>(null);

  const stored = (analysis?.survey_answers ?? {}) as Record<string, unknown>;

  // Seeded from what is stored so a retake is a revision. Keys beginning with
  // "_" are onboarding metadata, and `goals` is its own nested object, so
  // neither belongs in the answers a question renders from.
  function seedFromStored() {
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith("_") || key === "goals") continue;
      if (typeof value === "string") answers[key] = value;
    }
    setSurveyAnswers(answers);

    // Stored under the names `buildGoals` gives them, not the question ids,
    // so they are renamed back here. Reading `stored.goals[q.id]` directly
    // found nothing and showed four unanswered questions after every save.
    setGoalAnswers(goalAnswersFromGoals(goalsFromSurveyAnswers(stored)));
  }

  // Re-seeded only when the stored row changes, so typing is not overwritten.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(seedFromStored, [analysis?.survey_answers]);

  /** Throw away unsaved edits: a closed retake or a cancelled goals edit. */
  function discardChanges() {
    seedFromStored();
    setError(null);
    setSavedWhat(null);
  }

  const answeredSurvey = useMemo(
    () => SURVEY_QUESTIONS.filter((q) => surveyAnswers[q.id]).length,
    [surveyAnswers],
  );
  const answeredGoals = useMemo(
    () => GOAL_QUESTIONS.filter((q) => goalAnswers[q.id]).length,
    [goalAnswers],
  );

  function setSurveyAnswer(id: string, value: string) {
    setSurveyAnswers((prev) => ({ ...prev, [id]: value }));
    setSavedWhat(null);
  }

  function setGoalAnswer(id: string, value: string) {
    setGoalAnswers((prev) => ({ ...prev, [id]: value }));
    setSavedWhat(null);
  }

  async function write(
    what: ProfileSave,
    surveyPatch: Record<string, unknown>,
    riskLabel?: string,
  ) {
    if (!profile?.id) return false;
    setIsSaving(true);
    setError(null);
    setSavedWhat(null);
    try {
      const payload: Record<string, unknown> = {
        user_id: profile.id,
        survey_answers: withHistory(stored, surveyPatch),
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      if (riskLabel) payload.risk_tolerance = riskLabel;

      const { error: writeError } = await supabase
        .from("user_analysis")
        .upsert(payload, { onConflict: "user_id" });
      if (writeError) throw writeError;

      await fetchProfile(profile.id);
      setSavedWhat(what);
      return true;
    } catch (e: unknown) {
      console.error("Could not save profile answers:", e);
      setError(e instanceof Error ? e.message : "That did not save.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  /** Save revised goals. Leaves the risk answers and the risk label alone. */
  async function saveGoals() {
    // Same builder onboarding uses, so a horizon answered here ages the same
    // way: stored as a target year rather than as "five years" forever.
    const goals = buildGoals(goalAnswers as Partial<Record<GoalQuestionId, string>>);
    return write("goals", { ...withoutHistory(stored), goals });
  }

  /** Save revised questionnaire answers, and the label they score to. */
  async function saveRetake() {
    const derived = determinePsychometrics(surveyAnswers);
    return write(
      "retake",
      { ...withoutHistory(stored), ...surveyAnswers },
      derived.riskTolerance,
    );
  }

  return {
    riskLabel: (analysis?.risk_tolerance as string | undefined) ?? null,
    surveyAnswers,
    goalAnswers,
    setSurveyAnswer,
    setGoalAnswer,
    saveGoals,
    saveRetake,
    discardChanges,
    isSaving,
    error,
    savedWhat,
    answeredSurvey,
    answeredGoals,
    /** When the stored answers were last written, if the row says. */
    lastSavedAt: lastSavedAt(stored) ?? (analysis?.updated_at as string | undefined) ?? null,
  };
}
