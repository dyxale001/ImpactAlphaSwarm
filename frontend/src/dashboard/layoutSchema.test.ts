import { describe, it, expect } from "vitest";
import {
  arrayMove,
  emptyLayout,
  parseLayout,
  LAYOUT_VERSION,
  type WidgetSpecMap,
} from "./layoutSchema";

// A two-widget registry standing in for the real one. Deliberately not the real
// WIDGET_SPEC: that lives in widgetRegistry.tsx, which imports every widget
// component and every feature hook, none of which will load in vitest's node
// environment. Passing the spec in is what keeps this testable.
const SPEC: WidgetSpecMap = {
  "top-pick": { sizes: ["medium", "wide"], defaultSize: "wide" },
  "run-status": { sizes: ["small", "medium"], defaultSize: "small" },
  "social-buzz": {
    sizes: ["medium", "wide"],
    defaultSize: "medium",
    needsTicker: true,
  },
};

describe("parseLayout", () => {
  it("reads a well-formed layout", () => {
    const parsed = parseLayout(
      {
        version: 2,
        widgets: [
          { id: "top-pick", size: "medium" },
          { id: "run-status", size: "small", settings: { foo: 1 } },
        ],
      },
      SPEC,
    );

    expect(parsed).toEqual({
      version: 2,
      widgets: [
        { id: "top-pick", size: "medium" },
        { id: "run-status", size: "small", settings: { foo: 1 } },
      ],
    });
  });

  it("drops a widget id this build does not know about", () => {
    // Retiring a widget must retire it from everyone's saved dashboard rather
    // than breaking the page for whoever still has it placed.
    const parsed = parseLayout(
      {
        widgets: [
          { id: "top-pick", size: "wide" },
          { id: "widget-that-was-removed", size: "wide" },
        ],
      },
      SPEC,
    );

    expect(parsed?.widgets).toEqual([{ id: "top-pick", size: "wide" }]);
  });

  it("falls back to the default when the size is one the widget does not offer", () => {
    // "small" is not in top-pick's sizes, so it must land on its default rather
    // than render at a width the widget was never laid out for.
    const parsed = parseLayout(
      { widgets: [{ id: "top-pick", size: "small" }] },
      SPEC,
    );

    expect(parsed?.widgets).toEqual([{ id: "top-pick", size: "wide" }]);
  });

  it("falls back to the default when the size is not a size at all", () => {
    const parsed = parseLayout(
      { widgets: [{ id: "run-status", size: "enormous" }] },
      SPEC,
    );

    expect(parsed?.widgets).toEqual([{ id: "run-status", size: "small" }]);
  });

  it("keeps only the first copy of a repeated widget", () => {
    // Two copies would fight over one settings object.
    const parsed = parseLayout(
      {
        widgets: [
          { id: "top-pick", size: "wide" },
          { id: "top-pick", size: "medium" },
        ],
      },
      SPEC,
    );

    expect(parsed?.widgets).toEqual([{ id: "top-pick", size: "wide" }]);
  });

  it("normalises a widget's own ticker and drops a blank one", () => {
    const ticker = (raw: unknown) =>
      parseLayout(
        { widgets: [{ id: "social-buzz", size: "medium", settings: { ticker: raw } }] },
        SPEC,
      )?.widgets[0].settings?.ticker;

    expect(ticker(" nvda ")).toBe("NVDA");
    expect(ticker("   ")).toBeUndefined();
    expect(ticker(42)).toBeUndefined();
  });

  it("leaves a settings key alone when it drops an unusable ticker", () => {
    const parsed = parseLayout(
      {
        widgets: [
          { id: "social-buzz", size: "medium", settings: { ticker: "", sort: "added" } },
        ],
      },
      SPEC,
    );

    expect(parsed?.widgets).toEqual([
      { id: "social-buzz", size: "medium", settings: { sort: "added" } },
    ]);
  });

  it("migrates a v1 dashboard-wide pinnedTicker onto the ticker-scoped widgets", () => {
    // The old layout pointed every ticker widget at one asset. That has to
    // survive the upgrade, or a dashboard that was showing NVDA everywhere
    // comes back empty and asking to be set up again.
    const parsed = parseLayout(
      {
        version: 1,
        pinnedTicker: "nvda",
        widgets: [
          { id: "social-buzz", size: "medium" },
          { id: "run-status", size: "small" },
        ],
      },
      SPEC,
    );

    expect(parsed?.widgets).toEqual([
      { id: "social-buzz", size: "medium", settings: { ticker: "NVDA" } },
      // Not ticker-scoped, so it gets nothing.
      { id: "run-status", size: "small" },
    ]);
    // The field itself does not survive, so the migration runs exactly once.
    expect(parsed).not.toHaveProperty("pinnedTicker");
  });

  it("lets a widget's own ticker win over the migrated one", () => {
    const parsed = parseLayout(
      {
        version: 1,
        pinnedTicker: "NVDA",
        widgets: [
          { id: "social-buzz", size: "medium", settings: { ticker: "GOOG" } },
        ],
      },
      SPEC,
    );

    expect(parsed?.widgets[0].settings?.ticker).toBe("GOOG");
  });

  it("returns null rather than throwing on anything that is not a layout", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "a string",
      42,
      [],
      {},
      { widgets: "not an array" },
      { widgets: null },
    ]) {
      expect(parseLayout(bad, SPEC)).toBeNull();
    }
  });

  it("survives junk inside the widget list", () => {
    const parsed = parseLayout(
      {
        widgets: [
          null,
          "top-pick",
          { size: "wide" },
          { id: 7 },
          { id: "top-pick", size: "wide", settings: "not an object" },
        ],
      },
      SPEC,
    );

    expect(parsed?.widgets).toEqual([{ id: "top-pick", size: "wide" }]);
  });

  it("defaults a missing version", () => {
    const parsed = parseLayout({ widgets: [] }, SPEC);
    expect(parsed).toEqual({ version: LAYOUT_VERSION, widgets: [] });
  });

  it("reads straight past a deck field left by an older build", () => {
    // Starter decks were removed in favour of everyone beginning from a blank
    // page, so the field no longer means anything and must not survive a
    // parse into the layout that gets written back.
    const parsed = parseLayout(
      { deck: "trend_rider", widgets: [{ id: "top-pick", size: "wide" }] },
      SPEC,
    );
    expect(parsed).not.toHaveProperty("deck");
  });

  it("distinguishes an emptied layout from no layout at all", () => {
    // Null sends the user back to the setup guide; an empty widget list is a
    // dashboard they chose to clear, and must not.
    expect(parseLayout(emptyLayout(), SPEC)).not.toBeNull();
    expect(parseLayout(null, SPEC)).toBeNull();
  });
});

describe("arrayMove", () => {
  const items = ["a", "b", "c", "d"];

  it("moves an item later", () => {
    expect(arrayMove(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item earlier", () => {
    expect(arrayMove(items, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("does not mutate the input", () => {
    arrayMove(items, 0, 3);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the same array reference for a no-op, so callers can skip a save", () => {
    expect(arrayMove(items, 1, 1)).toBe(items);
  });

  it("returns the input untouched for out-of-range indices", () => {
    expect(arrayMove(items, -1, 2)).toBe(items);
    expect(arrayMove(items, 0, 9)).toBe(items);
    expect(arrayMove(items, 9, 0)).toBe(items);
    expect(arrayMove([], 0, 0)).toEqual([]);
  });
});
