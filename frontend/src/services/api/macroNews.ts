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
  /** A presenter's stock pick or a trading idea rather than a news event. Labelled on
   *  its card and kept out of the sector summaries. */
  commentary?: boolean;
}

/** An AI-written overview of one sector's tagged stories (or market-wide ones). */
export interface MacroOverview {
  summary: string;
  generated_at: string;
  /** How many tagged stories it was written from. */
  article_count: number;
}

export interface MacroFeed {
  universes: string[];
  market_wide_label: string;
  /** A story is tagged at or above this probability. */
  threshold: number;
  days: number;
  updated_at: string | null;
  /** Keyed by universe name or the market-wide label; absent when none is written yet. */
  overviews: Record<string, MacroOverview>;
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
