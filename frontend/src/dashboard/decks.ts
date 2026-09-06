// Starter decks: the dashboard a user gets before they have built one.
//
// Onboarding has always asked which kind of investor someone is and stored the
// answer under survey_answers._investor_path, with a comment saying it was kept
// "for future use". Nothing read it. This is that use: the answer picks which
// widgets a new dashboard opens with, so the page is already about them the
// first time they see it and customising is an edit rather than a build.
//
// Pure data plus one resolver. No React and no registry import, so the widget
// ids below are plain strings; parseLayout drops any that the registry does not
// know about, which is what keeps a retired widget from breaking a saved deck.

import { Gem, Rocket, TreePine, TrendingUp, type LucideIcon } from "lucide-react";
import type { DashboardLayout, LayoutEntry } from "./layoutSchema";
import { LAYOUT_VERSION } from "./layoutSchema";

export type DeckId =
  | "steady_builder"
  | "growth_seeker"
  | "trend_rider"
  | "value_hunter";

export interface Deck {
  id: DeckId;
  /** The deck's own name. Not the investor path's name: someone can pick a deck
   *  that does not match the path they chose, and calling it "Trend Rider" then
   *  would misdescribe them rather than the dashboard. */
  name: string;
  tagline: string;
  blurb: string;
  /** A lucide icon component, not an emoji glyph — the brand does not use emoji
   *  anywhere else in the product and this is not the exception. */
  icon: LucideIcon;
  widgets: LayoutEntry[];
}

export const DECKS: Record<DeckId, Deck> = {
  steady_builder: {
    id: "steady_builder",
    name: "The Long Game",
    tagline: "Built for patience",
    blurb:
      "Your own library first, then the institutions holding the same names. Leads with what you already track rather than what moved today.",
    icon: TreePine,
    widgets: [
      { id: "watchlist", size: "wide" },
      { id: "institutional-owners", size: "medium" },
      { id: "top-funds", size: "medium" },
      { id: "ranked-feed", size: "wide" },
      { id: "learning-progress", size: "small" },
    ],
  },
  growth_seeker: {
    id: "growth_seeker",
    name: "High Conviction",
    tagline: "Built for backing a call",
    blurb:
      "The committee's single strongest name up top, the rest of the shortlist under it, and the full scored feed below. Everything the run concluded, in rank order.",
    icon: Rocket,
    widgets: [
      { id: "top-pick", size: "wide" },
      { id: "ranked-feed", size: "wide" },
      { id: "sentiment-trend", size: "medium" },
      { id: "run-status", size: "small" },
      { id: "also-scored", size: "wide" },
    ],
  },
  trend_rider: {
    id: "trend_rider",
    name: "Riding the Wave",
    tagline: "Built for what is moving",
    blurb:
      "Sentiment first. The seven day trend, the articles and posts driving it, and how fresh the reading is, all pointed at one asset you pin.",
    icon: TrendingUp,
    widgets: [
      { id: "sentiment-freshness", size: "small" },
      { id: "sentiment-trend", size: "wide" },
      { id: "news-influential", size: "medium" },
      { id: "social-buzz", size: "medium" },
      { id: "top-pick", size: "medium" },
      { id: "run-status", size: "small" },
    ],
  },
  value_hunter: {
    id: "value_hunter",
    name: "Against the Grain",
    tagline: "Built for the overlooked",
    blurb:
      "Where the money is quietly going. Insider cluster buying up top, then ownership and fund positions, then everything the run scored rather than only its favourites.",
    icon: Gem,
    widgets: [
      { id: "whale-cluster", size: "wide" },
      { id: "institutional-owners", size: "medium" },
      { id: "top-funds", size: "medium" },
      { id: "also-scored", size: "wide" },
      { id: "ranked-feed", size: "wide" },
    ],
  },
};

export const DECK_LIST: Deck[] = [
  DECKS.steady_builder,
  DECKS.growth_seeker,
  DECKS.trend_rider,
  DECKS.value_hunter,
];

const DECK_IDS = new Set<string>(Object.keys(DECKS));

export function isDeckId(value: unknown): value is DeckId {
  return typeof value === "string" && DECK_IDS.has(value);
}

/** A fresh layout for a deck, ready to save. */
export function deckLayout(deckId: DeckId): DashboardLayout {
  return {
    version: LAYOUT_VERSION,
    deck: deckId,
    pinnedTicker: null,
    // Copied, not shared: the user is about to start editing this and DECKS is
    // module state that every other user's session reads.
    widgets: DECKS[deckId].widgets.map((w) => ({ ...w })),
  };
}

/** The subset of user_analysis this resolver reads. Kept structural so a test
 *  can pass a two-field object and so a legacy row missing either field is a
 *  normal input rather than a cast. */
export interface StarterDeckSource {
  survey_answers?: unknown;
  risk_tolerance?: string | null;
}

/**
 * Which deck to recommend to this user.
 *
 * Three sources, in descending order of how directly the user said it:
 *
 *  1. The investor path they picked at onboarding. An explicit answer.
 *  2. Their risk tolerance, for rows written before the investor path was
 *     collected. Aggressive maps to High Conviction; everything else maps to The
 *     Long Game, because the failure mode of over-calling someone's appetite is
 *     worse than under-calling it.
 *  3. The Long Game, for a row carrying neither.
 *
 * Always returns a deck. The picker needs something pre-selected, and "we could
 * not tell" is not a dashboard.
 */
export function resolveStarterDeck(
  analysis: StarterDeckSource | null | undefined,
): DeckId {
  const answers = analysis?.survey_answers;
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    const path = (answers as Record<string, unknown>)._investor_path;
    if (isDeckId(path)) return path;
  }

  // The stored spelling has drifted (capitalised from onboarding, lowercased
  // from Settings, plus an "aggresive" typo that reached production), so match
  // loosely rather than on an exact value.
  const risk = (analysis?.risk_tolerance || "").toLowerCase().trim();
  if (risk.startsWith("aggre")) return "growth_seeker";

  return "steady_builder";
}
