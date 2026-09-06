import { GOAL_QUESTIONS } from "../../utils/onboardingData";

/**
 * The four questions that say what the money is for.
 *
 * Shared by onboarding, where they are first answered, and by Settings, where
 * they are revised. One implementation rather than two, because the answers
 * drive which funds a user is shown: a wording that drifted between the two
 * places would quietly mean the same person got different matches depending on
 * where they last answered.
 *
 * Presentation is deliberately plain and inherits its surroundings, since the
 * two pages it appears on do not share a palette.
 */
export default function GoalQuestions({
  answers,
  onAnswer,
  className = "",
}: {
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {GOAL_QUESTIONS.map((q) => (
        <div key={q.id} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
          <p className="text-[15px] font-semibold leading-normal text-forest-900">{q.question}</p>
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const selected = answers[q.id] === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onAnswer(q.id, opt.value)}
                  className={`flex items-center gap-3 rounded-md border px-3.5 py-[11px] text-left transition-all duration-150 ${
                    selected ? "border-lime-500/80 bg-lime-100" : "border-forest-900/8 bg-neutral-100/60"
                  }`}
                >
                  <span
                    className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                      selected ? "border-forest-900" : "border-forest-900/25"
                    }`}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-forest-900" />}
                  </span>
                  <span
                    className={`text-[13px] leading-[1.45] ${
                      selected ? "font-semibold text-forest-900" : "text-muted"
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
