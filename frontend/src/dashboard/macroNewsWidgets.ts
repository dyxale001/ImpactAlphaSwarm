// What the Market news widgets choose to show. Pure and registry-free, like
// quantWidgetSettings, so it is testable on its own.
//
// The widgets read the same /api/macro feed the Market News page reads and pick
// from it by the same rules: a group's stories most relevant first (storiesFor),
// commentary (a presenter's stock pick, a trading idea) never leading, and
// relevance only. No story is called good or bad for anything.

import type { MacroArticle } from "../services/api/macroNews";
import { groupProbability, userSectors } from "../utils/macroNews";
import type { WidgetSettings, WidgetSize } from "./layoutSchema";

/** The one setting a sector news widget keeps: which universe it follows. */
export const SECTOR_SETTING = "sector";

/**
 * The sector a widget follows: the one its settings name if the feed still has
 * it, else the first of the reader's onboarding sectors (D-127), else the
 * feed's first universe. Null only when the feed has no universes at all.
 */
export function readSector(
  settings: WidgetSettings | undefined,
  universes: string[],
  chosen: unknown,
): string | null {
  const raw = settings?.[SECTOR_SETTING];
  if (typeof raw === "string") {
    const match = universes.find((u) => u.toLowerCase() === raw.trim().toLowerCase());
    if (match) return match;
  }
  return userSectors(chosen, universes)[0] ?? universes[0] ?? null;
}

/** How many stories a widget lists at each size. */
export function storyLimit(size: WidgetSize): number {
  return size === "small" ? 3 : size === "medium" ? 4 : 6;
}

/** Whether a size has room for the AI overview above the stories. */
export function showsOverview(size: WidgetSize): boolean {
  return size !== "small";
}

/** A group's stories for a widget: commentary dropped, most relevant first
 *  (the order storiesFor already gives), cut to the limit. */
export function leadStories(stories: MacroArticle[], limit: number): MacroArticle[] {
  return stories.filter((a) => !a.commentary).slice(0, limit);
}

/** The newest stories tagged to anything, commentary left out. Untagged
 *  stories are the page's "other" list and never reach a widget. */
export function latestTagged(tagged: MacroArticle[], limit: number): MacroArticle[] {
  return tagged
    .filter((a) => !a.commentary && a.tags.length > 0)
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, limit);
}

/** The tag a story is most relevant to, to label it with in a mixed list. */
export function leadTag(article: MacroArticle, marketWideLabel: string): string | null {
  let best: string | null = null;
  let bestP = -1;
  for (const tag of article.tags) {
    const p = groupProbability(article, tag, marketWideLabel);
    if (p > bestP) {
      best = tag;
      bestP = p;
    }
  }
  return best;
}
