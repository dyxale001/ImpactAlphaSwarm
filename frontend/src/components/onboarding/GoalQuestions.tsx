import { GOAL_QUESTIONS } from "../../utils/onboardingData";
import QuestionBlock, { type QuestionAppearance } from "./QuestionBlock";

/**
 * The four questions that say what the money is for.
 *
 * Shared by onboarding, where they are first answered, and by Settings, where
 * they are revised. One implementation rather than two, because the answers
 * drive which funds a user is shown: a wording that drifted between the two
 * places would quietly mean the same person got different matches depending on
 * where they last answered.
 *
 * The two pages do not share a palette, so the look is chosen by the caller:
 * onboarding keeps its white cards on cream, Settings embeds the questions in
 * a card it already owns.
 */
export default function GoalQuestions({
  answers,
  onAnswer,
  className = "",
  appearance = "onboarding",
}: {
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  className?: string;
  appearance?: QuestionAppearance;
}) {
  const embedded = appearance === "embedded";
  return (
    <div
      className={`flex flex-col ${embedded ? "divide-y divide-brand-border/40" : "gap-4"} ${className}`}
    >
      {GOAL_QUESTIONS.map((q, index) => (
        <QuestionBlock
          key={q.id}
          question={q}
          value={answers[q.id]}
          onAnswer={onAnswer}
          appearance={appearance}
          number={index + 1}
        />
      ))}
    </div>
  );
}
