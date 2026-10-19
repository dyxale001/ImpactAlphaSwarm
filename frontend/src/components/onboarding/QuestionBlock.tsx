/**
 * One multiple-choice question, rendered the way its surroundings call for.
 *
 * The same question data is asked in three places: onboarding step 3, where
 * it is first answered; the Funds page prompt; and Settings, where it is
 * revised. Until now each place carried its own copy of this markup, and
 * Settings had inherited onboarding's white-card-on-cream look, which inside
 * a white Settings card read as a different product.
 *
 * Two appearances, one component, and the same answer rows in both: the
 * platform's selectable-tile look, a fine outline that darkens on hover, and
 * when chosen a forest outline on light green with a forest radio and dot.
 *
 * - `onboarding`: each question is its own platform card on the page.
 * - `embedded`: for a question that sits inside a card that already has a
 *   border. No card of its own; a numbered gutter and a hairline between
 *   questions.
 *
 * Wording and option values come from the caller, so the two appearances can
 * never drift apart in what they ask.
 */

export type QuestionAppearance = "onboarding" | "embedded";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionSpec {
  id: string;
  question: string;
  /** A plain-words line under the question, for terms a beginner may not know. */
  hint?: string;
  options: readonly QuestionOption[];
}

export default function QuestionBlock({
  question,
  value,
  onAnswer,
  appearance = "onboarding",
  number,
}: {
  question: QuestionSpec;
  value: string | undefined;
  onAnswer: (questionId: string, value: string) => void;
  appearance?: QuestionAppearance;
  /** Shown in the gutter of the embedded appearance. */
  number?: number;
}) {
  if (appearance === "embedded") {
    // The survey questions carry their own "1. " prefix, written for a page
    // that had no gutter. Here the gutter numbers them, so the prefix goes.
    const text = number === undefined ? question.question : question.question.replace(/^\d+\.\s*/, "");
    return (
      <div
        className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1.5 py-4 first:pt-1"
        role="group"
        aria-labelledby={`q-${question.id}`}
      >
        <span className="pt-0.5 text-xs font-bold tabular-nums text-brand-muted-fg">
          {number ?? ""}
        </span>
        <p id={`q-${question.id}`} className="text-sm font-bold leading-snug text-forest-900">
          {text}
        </p>
        {question.hint && (
          <p className="col-start-2 text-xs leading-snug text-brand-muted-fg">{question.hint}</p>
        )}
        <AnswerRows question={question} value={value} onAnswer={onAnswer} className="col-start-2 mt-1.5" />
      </div>
    );
  }

  return (
    <div className="as-card flex flex-col gap-3 p-5 sm:p-6" role="group" aria-labelledby={`q-${question.id}`}>
      <div className="flex flex-col gap-1">
        <p id={`q-${question.id}`} className="text-base font-bold leading-snug tracking-[-0.01em] text-forest-900">
          {question.question}
        </p>
        {question.hint && <p className="text-xs leading-snug text-brand-muted-fg">{question.hint}</p>}
      </div>
      <AnswerRows question={question} value={value} onAnswer={onAnswer} />
    </div>
  );
}

/** The question's answers as radio rows. */
function AnswerRows({
  question,
  value,
  onAnswer,
  className = "",
}: {
  question: QuestionSpec;
  value: string | undefined;
  onAnswer: (questionId: string, value: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="radiogroup" aria-labelledby={`q-${question.id}`}>
      {question.options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onAnswer(question.id, opt.value)}
            className={`flex min-h-11 items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left text-sm transition-colors duration-150 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 ${
              selected
                ? "border-forest-700 bg-forest-50 font-semibold text-forest-900"
                : "border-forest-900/12 bg-white text-forest-900 hover:border-forest-900/30"
            }`}
          >
            {/* A plain radio: a ring that turns forest with a forest dot. Even
                sizes (20px ring, 2px border, 8px dot) so the dot sits exactly
                in the middle. */}
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 bg-white transition-colors duration-150 ${
                selected ? "border-forest-700" : "border-forest-900/25"
              }`}
              aria-hidden="true"
            >
              <span
                className={`h-2 w-2 rounded-full bg-forest-700 transition-transform duration-150 ${selected ? "scale-100" : "scale-0"}`}
              />
            </span>
            <span className="leading-snug">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
