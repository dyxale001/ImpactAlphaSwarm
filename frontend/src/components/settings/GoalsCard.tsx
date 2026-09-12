import { useState } from "react";
import { Zap } from "lucide-react";
import GoalQuestions from "../onboarding/GoalQuestions";
import SettingsCard, { CardChip, Consequence } from "./SettingsCard";
import { PrimaryButton, SecondaryButton } from "./SettingsButtons";
import type { useProfileAnswers } from "../../hooks/useProfileAnswers";
import { GOAL_QUESTIONS } from "../../utils/onboardingData";
import {
  GOALS_CANCEL_ACTION,
  GOALS_CARD_LEAD,
  GOALS_CARD_TITLE,
  GOALS_CONSEQUENCE,
  GOALS_EDIT_ACTION,
  GOALS_NOT_ANSWERED,
  GOALS_SAVE_ACTION,
  GOALS_SAVED,
  GOAL_LABEL_ACCOUNT,
  GOAL_LABEL_CONTRIBUTION,
  GOAL_LABEL_HORIZON,
  GOAL_LABEL_PURPOSE,
  RETAKE_SAVING,
} from "../../utils/settingsCopy";

type Profile = ReturnType<typeof useProfileAnswers>;

const GOAL_LABELS: Record<string, string> = {
  goal_horizon: GOAL_LABEL_HORIZON,
  goal_purpose: GOAL_LABEL_PURPOSE,
  goal_account_type: GOAL_LABEL_ACCOUNT,
  goal_contribution: GOAL_LABEL_CONTRIBUTION,
};

/**
 * What the money is for, read as a summary and revised in place.
 *
 * Sits beside the risk card because the two are read together — the fund
 * matcher takes the rating and the goals in the same pass — but saves
 * separately, since revising what your money is for should not require
 * re-answering twenty questions about risk. The four questions used to render
 * open at all times; now the card shows the four answers and opens the
 * questions only when asked, in the same embedded style as the retake.
 */
export default function GoalsCard({ profile }: { profile: Profile }) {
  const {
    goalAnswers,
    setGoalAnswer,
    saveGoals,
    discardChanges,
    isSaving,
    error,
    savedWhat,
    answeredGoals,
  } = profile;
  const [editing, setEditing] = useState(false);

  function cancel() {
    discardChanges();
    setEditing(false);
  }
  async function submit() {
    const ok = await saveGoals();
    if (ok) setEditing(false);
  }

  return (
    <SettingsCard
      id="goals"
      title={GOALS_CARD_TITLE}
      lead={GOALS_CARD_LEAD}
      chip={
        <CardChip>
          <span className="tabular-nums">
            {answeredGoals} of {GOAL_QUESTIONS.length} answered
          </span>
        </CardChip>
      }
      error={error}
      success={savedWhat === "goals" ? GOALS_SAVED : null}
      consequence={<Consequence icon={<Zap className="h-3.5 w-3.5" />}>{GOALS_CONSEQUENCE}</Consequence>}
      actions={
        editing ? (
          <>
            <SecondaryButton onClick={cancel} disabled={isSaving}>
              {GOALS_CANCEL_ACTION}
            </SecondaryButton>
            <PrimaryButton onClick={() => void submit()} disabled={isSaving}>
              {isSaving ? RETAKE_SAVING : GOALS_SAVE_ACTION}
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={() => setEditing(true)} aria-expanded={false}>
            {GOALS_EDIT_ACTION}
          </SecondaryButton>
        )
      }
    >
      {editing ? (
        <GoalQuestions answers={goalAnswers} onAnswer={setGoalAnswer} appearance="embedded" />
      ) : (
        <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {GOAL_QUESTIONS.map((q) => {
            const answer = q.options.find((o) => o.value === goalAnswers[q.id]);
            return (
              <div
                key={q.id}
                className="rounded-lg border border-brand-border/40 bg-brand-primary/[0.03] px-3 py-2.5"
              >
                <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-brand-muted-fg">
                  {GOAL_LABELS[q.id] ?? q.question}
                </dt>
                <dd
                  className={`mt-0.5 text-[13px] font-semibold leading-snug ${
                    answer ? "text-brand-fg" : "text-brand-muted-fg"
                  }`}
                >
                  {answer?.label ?? GOALS_NOT_ANSWERED}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </SettingsCard>
  );
}
