import { describe, it, expect } from "vitest";
import {
  GUIDE_STEPS,
  NO_ACTIVITY,
  completedSteps,
  currentStep,
  guideProgress,
  type GuideActivity,
} from "./guideSteps";

const activity = (patch: Partial<GuideActivity> = {}): GuideActivity => ({
  ...NO_ACTIVITY,
  ...patch,
});

describe("completedSteps", () => {
  it("has nothing done on a blank dashboard nobody has touched", () => {
    expect(completedSteps(NO_ACTIVITY, 0).size).toBe(0);
  });

  it("counts a widget already on the page as having added one", () => {
    // Someone who arrives with widgets placed must not be told to add their
    // first one.
    expect(completedSteps(NO_ACTIVITY, 3).has("add")).toBe(true);
  });

  it("treats reordering as done on a dashboard holding one widget", () => {
    // Nothing to reorder against, so leaving it open would be a step they
    // cannot complete and cannot get past.
    expect(completedSteps(NO_ACTIVITY, 1).has("reorder")).toBe(true);
    expect(completedSteps(NO_ACTIVITY, 2).has("reorder")).toBe(false);
  });

  it("records a real reorder on a dashboard that has room for one", () => {
    expect(completedSteps(activity({ reordered: true }), 4).has("reorder")).toBe(
      true,
    );
  });

  it("does not treat an empty dashboard as reordered", () => {
    expect(completedSteps(NO_ACTIVITY, 0).has("reorder")).toBe(false);
  });

  it("maps each remaining flag to its own step", () => {
    expect(completedSteps(activity({ entered: true }), 0).has("customise")).toBe(
      true,
    );
    expect(completedSteps(activity({ resized: true }), 0).has("resize")).toBe(
      true,
    );
    expect(completedSteps(activity({ saved: true }), 0).has("save")).toBe(true);
  });
});

describe("currentStep", () => {
  it("starts at the first step", () => {
    expect(currentStep(completedSteps(NO_ACTIVITY, 0))).toBe("customise");
  });

  it("returns the first gap rather than the step after the last one done", () => {
    // Adding a widget before opening customise mode leaves step one undone,
    // and that is the step to point at.
    const done = completedSteps(activity({ added: true }), 1);
    expect(currentStep(done)).toBe("customise");
  });

  it("skips over steps completed out of order", () => {
    const done = completedSteps(
      activity({ entered: true, added: true, reordered: true }),
      2,
    );
    expect(currentStep(done)).toBe("resize");
  });

  it("is null once everything is done", () => {
    const done = completedSteps(
      activity({
        entered: true,
        added: true,
        resized: true,
        reordered: true,
        saved: true,
      }),
      3,
    );
    expect(currentStep(done)).toBeNull();
  });
});

describe("guideProgress", () => {
  it("is zero on a fresh dashboard", () => {
    expect(guideProgress(completedSteps(NO_ACTIVITY, 0))).toEqual({
      completed: 0,
      total: GUIDE_STEPS.length,
      percent: 0,
    });
  });

  it("reaches full only when every step is done", () => {
    const done = completedSteps(
      activity({
        entered: true,
        added: true,
        resized: true,
        reordered: true,
        saved: true,
      }),
      3,
    );
    expect(guideProgress(done).percent).toBe(100);
  });

  it("ignores an id the guide does not define, so the bar cannot overrun", () => {
    const done = completedSteps(activity({ entered: true }), 0);
    done.add("something-else" as never);
    expect(guideProgress(done).completed).toBe(1);
  });
});
