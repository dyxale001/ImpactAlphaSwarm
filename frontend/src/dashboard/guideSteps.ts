// The setup guide: a manual that ticks itself off as the reader does the thing.
//
// Everyone starts on a blank dashboard, so something has to explain how to fill
// it. A modal wall of text would be read once and forgotten, and a static help
// page would sit somewhere nobody looks. This is the middle: a short checklist
// pinned beside the actual page, where each step completes when the reader
// performs it for real rather than when they click "next". The manual is
// therefore never out of step with what they have actually done.
//
// Pure data and one resolver, deliberately free of React, so the ordering rules
// below are testable without rendering anything.

export type GuideStepId =
  | "customise"
  | "add"
  | "resize"
  | "reorder"
  | "save";

export interface GuideStep {
  id: GuideStepId;
  title: string;
  /** One line saying exactly which control to use. */
  detail: string;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "customise",
    title: "Open customise mode",
    detail:
      "Press Customise in the banner above. Every widget grows a set of controls while it is on.",
  },
  {
    id: "add",
    title: "Add your first widget",
    detail:
      "Press Add a widget and pick one from the library. They are grouped by where the data comes from.",
  },
  {
    id: "resize",
    title: "Set how much room it gets",
    detail:
      "The S, M and W button on a widget steps it through the widths it supports. Some need the full row to be readable.",
  },
  {
    id: "reorder",
    title: "Put it where you want it",
    detail:
      "Drag a widget to a new position, or use the arrows in its header. What you put at the top is what you see first.",
  },
  {
    id: "save",
    title: "Save your dashboard",
    detail:
      "Press Done when you are finished. Changes are saved as you make them, so nothing is lost if you leave first.",
  },
];

/** What the reader has actually done, gathered by the dashboard as it happens. */
export interface GuideActivity {
  /** Customise mode has been on at least once. */
  entered: boolean;
  /** A widget has been added at least once. */
  added: boolean;
  /** A widget's size has been changed at least once. */
  resized: boolean;
  /** A widget has been moved at least once. */
  reordered: boolean;
  /** Customise mode has been turned off again, with something on the page. */
  saved: boolean;
}

export const NO_ACTIVITY: GuideActivity = {
  entered: false,
  added: false,
  resized: false,
  reordered: false,
  saved: false,
};

/**
 * Which steps are done.
 *
 * Reordering needs two widgets before it is even possible, so on a dashboard
 * holding one it is treated as done rather than left as a step the reader
 * cannot complete and cannot get past. Everything else is a plain record of
 * having done it once.
 */
export function completedSteps(
  activity: GuideActivity,
  widgetCount: number,
): Set<GuideStepId> {
  const done = new Set<GuideStepId>();
  if (activity.entered) done.add("customise");
  if (activity.added || widgetCount > 0) done.add("add");
  if (activity.resized) done.add("resize");
  if (activity.reordered || (widgetCount > 0 && widgetCount < 2)) {
    done.add("reorder");
  }
  if (activity.saved) done.add("save");
  return done;
}

/**
 * The step the reader is on: the first one they have not done.
 *
 * Deliberately not "the next one after the last they completed". Someone who
 * adds a widget before opening the drawer the guide pointed at has still done
 * step two, and the guide should move on rather than insist they do step one
 * again in the prescribed order.
 *
 * Null once every step is done, which is what the panel reads as "finished".
 */
export function currentStep(done: Set<GuideStepId>): GuideStepId | null {
  for (const step of GUIDE_STEPS) {
    if (!done.has(step.id)) return step.id;
  }
  return null;
}

/** How far along, for the progress line. */
export function guideProgress(done: Set<GuideStepId>): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = GUIDE_STEPS.length;
  // Only count ids the guide actually defines: a stale id from somewhere else
  // must not push the bar past full.
  let completed = 0;
  for (const step of GUIDE_STEPS) if (done.has(step.id)) completed += 1;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
