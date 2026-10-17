/**
 * One multiple-choice question, rendered the way its surroundings call for.
 *
 * The same question data is asked in three places: onboarding step 3, where
 * it is first answered; the Funds page prompt; and Settings, where it is
 * revised. Until now each place carried its own copy of this markup, and
 * Settings had inherited onboarding's white-card-on-cream look, which inside
 * a white Settings card read as a different product.
 *
 * Two appearances, one component:
 *
 * - `onboarding`: the white card with a soft shadow and a lime selected row,
 *   exactly as the onboarding page has always drawn it.
 * - `embedded`: for a question that sits inside a card that already has a
 *   border. No card of its own; a numbered gutter, a hairline between
 *   questions, and each answer as a row in the platform's selectable-tile look
 *   (the sector and expertise tiles beside it): a fine outline that darkens on
 *   hover, and when chosen a forest outline on light green with a forest radio
 *   holding a lime dot.
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
        <div className="col-start-2 mt-1.5 flex flex-col gap-2" role="radiogroup">
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
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                    selected ? "border-forest-700 bg-forest-700" : "border-forest-900/25 bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-lime-500" />}
                </span>
                <span className="leading-snug">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold leading-normal text-forest-900">{question.question}</p>
        {question.hint && <p className="text-xs leading-snug text-muted">{question.hint}</p>}
      </div>
      <div className="flex flex-col gap-2">
        {question.options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAnswer(question.id, opt.value)}
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
  );
}
