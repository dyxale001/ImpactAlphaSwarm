import type { ComponentType } from 'react';
import { SCORECARD_ENABLED } from '../../hooks/useDashboardStats';
import RankingMethodology from './RankingMethodology';
import SentimentMethodology from './SentimentMethodology';
import QuantMethodology from './QuantMethodology';

export type MethodologyKey = 'ranking' | 'sentiment' | 'quant';

export type MethodologySection = {
  key: MethodologyKey;
  /** The stock page tab this explains, as that tab is labelled. */
  label: string;
  /** The phone label, for the 3x2 tab grid. */
  short: string;
  title: string;
  Content: ComponentType;
};

// One list for both the dialog's tabs and the stacked "How it works" page, in the
// stock page's tab order. Ranking only exists under the scorecard, as on the stock
// page.
export const METHODOLOGY_SECTIONS: MethodologySection[] = [
  ...(SCORECARD_ENABLED ? [{ key: 'ranking' as const, label: 'Why it ranks here', short: 'Ranking', title: 'How your list is ordered', Content: RankingMethodology }] : []),
  { key: 'sentiment', label: 'Sentiment', short: 'Sentiment', title: 'How the sentiment score is built', Content: SentimentMethodology },
  { key: 'quant', label: 'Quant', short: 'Quant', title: 'How the price measurements work', Content: QuantMethodology },
];

export const METHODOLOGY_CAVEAT =
  'Every figure describes past and present public data. Nothing here predicts a price or tells you what to buy or sell.';
