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
 *   questions, and the selected row in the forest-ring-with-lime-dot idiom the
 *   sector and expertise tiles beside it use.
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
        <p id={`q-${question.id}`} className="text-sm font-semibold leading-snug text-brand-fg">
          {text}
        </p>
        <div className="col-start-2 mt-1 flex flex-col gap-1.5" role="radiogroup">
          {question.options.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onAnswer(question.id, opt.value)}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                  selected
                    ? "border-brand-primary/50 bg-brand-primary/5 font-semibold text-brand-fg"
                    : "border-brand-border/60 bg-brand-surface/40 text-brand-fg hover:border-brand-border hover:bg-brand-surface"
                }`}
              >
                <span
                  className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                    selected ? "border-brand-primary bg-brand-primary" : "border-brand-border"
                  }`}
                >
                  {selected && <span className="h-[7px] w-[7px] rounded-full bg-brand-accent" />}
                </span>
                <span className="leading-[1.45]">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
      <p className="text-[15px] font-semibold leading-normal text-forest-900">{question.question}</p>
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
