import { ArrowRight, Check, PartyPopper, X } from "lucide-react";
import {
  GUIDE_STEPS,
  completedSteps,
  currentStep,
  guideProgress,
  type GuideActivity,
  type GuideStepId,
} from "../../../dashboard/guideSteps";

/**
 * The dashboard's setup manual.
 *
 * Every dashboard starts blank, so this is what stands between a new reader and
 * an empty page. It is not a tour that talks over the interface and it does not
 * place anything on their behalf: it names the five controls in the order they
 * are useful, and each step ticks itself off the moment the reader actually
 * uses that control. Someone who works it out on their own watches the manual
 * complete behind them rather than having to dismiss it.
 *
 * The action button always drives the step being described, so the guide is
 * also the shortest path through: pressing it five times configures a
 * dashboard.
 */
export default function SetupGuide({
  activity,
  widgetCount,
  isEditing,
  onStartCustomising,
  onOpenLibrary,
  onFinish,
  onDismiss,
}: {
  activity: GuideActivity;
  widgetCount: number;
  isEditing: boolean;
  onStartCustomising: () => void;
  onOpenLibrary: () => void;
  onFinish: () => void;
  onDismiss: () => void;
}) {
  const done = completedSteps(activity, widgetCount);
  const step = currentStep(done);
  const { completed, total, percent } = guideProgress(done);
  const allDone = step === null;

  // What the primary button does depends on the step being described. The last
  // two are things only the reader can do to a widget they chose, so the guide
  // stops offering to do them and just says where the control is.
  const action: Record<GuideStepId, { label: string; run: () => void } | null> =
    {
      customise: { label: "Open customise mode", run: onStartCustomising },
      add: {
        label: "Open the widget library",
        run: () => {
          if (!isEditing) onStartCustomising();
          onOpenLibrary();
        },
      },
      resize: null,
      reorder: null,
      save: null,
    };

  const currentAction = step ? action[step] : null;

  return (
    <section
      aria-label="Dashboard setup guide"
      className="soft-card relative space-y-4 p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss the setup guide"
        className="absolute right-4 top-4 rounded-full p-1.5 text-brand-muted-fg transition-colors hover:bg-brand-bg hover:text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">
          Setting up
        </p>
        <h2 className="mt-1.5 text-lg font-bold text-brand-fg">
          {allDone ? "Your dashboard is yours" : "How to build your dashboard"}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">
          {allDone
            ? "That is everything. Customise is always in the banner above when you want to change it again."
            : "Your dashboard starts empty on purpose, so it only ever holds what you put there. Five steps, and each one ticks itself off as you do it."}
        </p>
      </div>

      {/* Progress. Worth showing because the steps complete on their own: a
          reader who resized a widget before being told to needs to see that
          the guide noticed. */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-brand-muted-fg">
          <span>
            {completed} of {total} done
          </span>
          <span className="font-mono">{percent}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-brand-border/40"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-brand-primary transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ol className="space-y-1.5">
        {GUIDE_STEPS.map((guideStep, i) => {
          const isDone = done.has(guideStep.id);
          const isCurrent = guideStep.id === step;

          return (
            <li
              key={guideStep.id}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
                isCurrent
                  ? "border-brand-accent bg-brand-accent/10"
                  : "border-transparent"
              }`}
            >
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-colors ${
                  isDone
                    ? "border-brand-primary bg-brand-primary text-brand-bg"
                    : isCurrent
                      ? "border-brand-primary text-brand-primary"
                      : "border-brand-border text-brand-muted-fg"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>

              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold ${
                    isDone
                      ? "text-brand-muted-fg line-through"
                      : "text-brand-fg"
                  }`}
                >
                  {guideStep.title}
                </p>
                {/* Only the step in hand needs its instruction spelled out.
                    Printing all five at once is the wall of text this is
                    meant to replace. */}
                {isCurrent ? (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-brand-muted-fg">
                    {guideStep.detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        {allDone ? (
          <button
            type="button"
            onClick={onFinish}
            className="inline-flex items-center gap-2 rounded-full bg-brand-accent px-4 py-2 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            <PartyPopper className="h-4 w-4" />
            Close the guide
          </button>
        ) : currentAction ? (
          <button
            type="button"
            onClick={currentAction.run}
            className="inline-flex items-center gap-2 rounded-full bg-brand-accent px-4 py-2 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            {currentAction.label}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-brand-muted-fg transition-colors hover:text-brand-fg hover:underline"
        >
          {allDone ? "Hide this" : "I will work it out myself"}
        </button>
      </div>
    </section>
  );
}
