import { describe, it, expect } from "vitest";
import {
  DECKS,
  DECK_LIST,
  deckLayout,
  isDeckId,
  resolveStarterDeck,
} from "./decks";

describe("resolveStarterDeck", () => {
  it("uses the investor path the user picked at onboarding", () => {
    for (const deck of DECK_LIST) {
      expect(
        resolveStarterDeck({ survey_answers: { _investor_path: deck.id } }),
      ).toBe(deck.id);
    }
  });

  it("prefers the investor path over the risk tolerance", () => {
    expect(
      resolveStarterDeck({
        survey_answers: { _investor_path: "value_hunter" },
        risk_tolerance: "Aggressive",
      }),
    ).toBe("value_hunter");
  });

  it("falls back to risk tolerance on a row written before the path was collected", () => {
    // Every one of these spellings is in production: onboarding capitalised it,
    // Settings lowercases it, and "aggresive" is a typo that reached the table.
    for (const spelling of ["Aggressive", "aggressive", "aggresive", " AGGRESSIVE "]) {
      expect(resolveStarterDeck({ risk_tolerance: spelling })).toBe(
        "growth_seeker",
      );
    }
  });

  it("under-calls rather than over-calls appetite for the other tolerances", () => {
    for (const spelling of ["Moderate", "conservative", "passive", "tolerant"]) {
      expect(resolveStarterDeck({ risk_tolerance: spelling })).toBe(
        "steady_builder",
      );
    }
  });

  it("always returns a deck, whatever it is handed", () => {
    // The picker needs something pre-selected. "We could not tell" is not a
    // dashboard.
    for (const input of [
      null,
      undefined,
      {},
      { survey_answers: null },
      { survey_answers: "not an object" },
      { survey_answers: [] },
      { survey_answers: { _investor_path: "not_a_deck" } },
      { survey_answers: { _investor_path: 42 } },
      { risk_tolerance: null },
      { risk_tolerance: "" },
    ]) {
      expect(isDeckId(resolveStarterDeck(input as never))).toBe(true);
    }
  });
});

describe("deckLayout", () => {
  it("builds a saveable layout carrying the deck it came from", () => {
    const layout = deckLayout("trend_rider");
    expect(layout.deck).toBe("trend_rider");
    expect(layout.pinnedTicker).toBeNull();
    expect(layout.widgets.length).toBeGreaterThan(0);
  });

  it("copies the widgets rather than sharing the module's own", () => {
    // DECKS is module state read by every session. Handing out its arrays would
    // mean one user's first drag reordered the deck for everyone.
    const a = deckLayout("growth_seeker");
    const b = deckLayout("growth_seeker");

    expect(a.widgets).not.toBe(DECKS.growth_seeker.widgets);
    expect(a.widgets[0]).not.toBe(DECKS.growth_seeker.widgets[0]);

    a.widgets[0].size = "small";
    expect(b.widgets[0].size).not.toBe("small");
    expect(DECKS.growth_seeker.widgets[0].size).not.toBe("small");
  });
});

describe("deck definitions", () => {
  it("gives every investor path a deck of the same id", () => {
    // The onboarding step recommends by using the path id AS the deck id, so the
    // two sets have to stay identical.
    for (const path of [
      "steady_builder",
      "growth_seeker",
      "trend_rider",
      "value_hunter",
    ]) {
      expect(isDeckId(path)).toBe(true);
    }
  });

  it("places no widget twice within a deck", () => {
    for (const deck of DECK_LIST) {
      const ids = deck.widgets.map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
