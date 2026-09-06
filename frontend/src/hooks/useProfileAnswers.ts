import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { GOAL_QUESTIONS, SURVEY_QUESTIONS } from "../utils/onboardingData";
import { determinePsychometrics } from "../utils/scoringEngine";
import { buildGoals, type GoalQuestionId } from "../utils/goals";
import { withHistory, withoutHistory } from "../utils/profileHistory";

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

export function useProfileAnswers() {
  const { profile, analysis, fetchProfile } = useAuthStore();

  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [goalAnswers, setGoalAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const stored = (analysis?.survey_answers ?? {}) as Record<string, unknown>;

  // Seeded from what is stored so a retake is a revision. Keys beginning with
  // "_" are onboarding metadata, and `goals` is its own nested object, so
  // neither belongs in the answers a question renders from.
  useEffect(() => {
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith("_") || key === "goals") continue;
      if (typeof value === "string") answers[key] = value;
    }
    setSurveyAnswers(answers);

    const goals = (stored.goals ?? {}) as Record<string, unknown>;
    const seeded: Record<string, string> = {};
    for (const q of GOAL_QUESTIONS) {
      const raw = goals[q.id as keyof typeof goals];
      if (typeof raw === "string") seeded[q.id] = raw;
    }
    setGoalAnswers(seeded);
    // Re-seeded only when the stored row changes, so typing is not overwritten.
  }, [analysis?.survey_answers]);

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
    setSaved(false);
  }

  function setGoalAnswer(id: string, value: string) {
    setGoalAnswers((prev) => ({ ...prev, [id]: value }));
    setSaved(false);
  }

  async function write(surveyPatch: Record<string, unknown>, riskLabel?: string) {
    if (!profile?.id) return false;
    setIsSaving(true);
    setError(null);
    setSaved(false);
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
      setSaved(true);
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
    return write({ ...withoutHistory(stored), goals });
  }

  /** Save revised questionnaire answers, and the label they score to. */
  async function saveRetake() {
    const derived = determinePsychometrics(surveyAnswers);
    return write(
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
    isSaving,
    error,
    saved,
    answeredSurvey,
    answeredGoals,
  };
}

