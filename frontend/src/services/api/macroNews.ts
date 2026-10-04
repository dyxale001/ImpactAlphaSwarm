/** Client for /api/macro: world and market news tagged to investment universes.
 *
 * Public data (published headlines and our scores of them), so no token, like the
 * sentiment-drivers endpoint. */

const BASE = import.meta.env.VITE_API_BASE ?? "";

export interface MacroArticle {
  id: number;
  headline: string;
  /** The publisher's own summary, exactly as sent. Often just the headline again. */
  blurb: string;
  source: string;
  url: string;
  image_url: string | null;
  published_at: string;
  /** False until Jev has scored it; every probability below is then null. */
  scored: boolean;
  /** The relevance gate: market-relevant news vs lifestyle and tips. */
  relevance: number | null;
  market_wide: number | null;
  /** Every current universe, in the usual order. Null for a universe added since
   *  this story was scored. */
  universes: Record<string, number | null>;
  /** Universe names and/or the market-wide label that cleared the threshold. */
  tags: string[];
}

export interface MacroFeed {
  universes: string[];
  market_wide_label: string;
  /** A story is tagged at or above this probability. */
  threshold: number;
  days: number;
  updated_at: string | null;
  tagged: MacroArticle[];
  other: MacroArticle[];
}

export async function getMacroNews(days = 7): Promise<MacroFeed> {
  const res = await fetch(`${BASE}/api/macro/news?days=${days}`);
  if (!res.ok) {
    throw new Error(`Market news could not be loaded (HTTP ${res.status})`);
  }
  return res.json();
}
