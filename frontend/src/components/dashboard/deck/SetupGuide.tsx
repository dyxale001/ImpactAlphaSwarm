import { ArrowRight, Check, LayoutGrid, PartyPopper, X } from "lucide-react";
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

  // One line, as the full redesign draws it: what this is, how far along, the
  // step in hand and its action, and a way to close it. The board below is the
  // point of the page; the guide should not push it down by a screen.
  return (
    <section aria-label="Dashboard setup guide" className="as-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800" aria-hidden="true">
        {allDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <LayoutGrid className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-forest-900">
          {allDone ? "Your dashboard is yours" : "Make this dashboard yours"}
        </p>
        <p className="text-xs leading-relaxed text-brand-muted-fg">
          {allDone ? (
            "That is everything. Customise is always in the banner above when you want to change it again."
          ) : (
            <>
              {completed} of {total} steps done.{" "}
              {step ? (
                <>
                  Next: <span className="font-semibold text-forest-900">{GUIDE_STEPS.find((g) => g.id === step)?.title}</span>.{" "}
                  {GUIDE_STEPS.find((g) => g.id === step)?.detail}
                </>
              ) : null}
            </>
          )}
        </p>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-forest-50 sm:w-28 sm:shrink-0"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <div className="h-full rounded-full bg-forest-700 transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {allDone ? (
          <button type="button" onClick={onFinish} className="as-btn as-btn-sm as-btn-primary">
            <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
            Close the guide
          </button>
        ) : currentAction ? (
          <button type="button" onClick={currentAction.run} className="as-btn as-btn-sm as-btn-secondary">
            {currentAction.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss the setup guide"
          className="flex h-8 w-8 items-center justify-center rounded-full text-brand-muted-fg transition-colors hover:bg-forest-50 hover:text-forest-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
