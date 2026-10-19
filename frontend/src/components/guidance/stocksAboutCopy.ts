import type { ConvergenceState } from '../../data/signalCopy';

// Copy for the Stocks "About this page" dialog that is not part of the shared
// page explanation: the worked example, the labels, the three times on the page,
// what the page does and does not tell you, and the wayfinding. Written for a
// first-time investor (D-203): plain words first, no buy, hold or sell language.

export type StocksExampleKey = 'agree' | 'conflict';

export const STOCKS_EXAMPLE: Record<StocksExampleKey, {
  tab: string;
  sentiment: number;
  pricePercentile: number;
  terms: { signalStrength: number; agreement: number; evidenceDepth: number; fit: number };
  state: ConvergenceState;
  outcome: string;
}> = {
  agree: {
    tab: 'Stock A',
    sentiment: 62,
    pricePercentile: 81,
    terms: { signalStrength: 78, agreement: 88, evidenceDepth: 70, fit: 75 },
    state: 'agree_strongly',
    outcome: 'The price agrees with the news, so the two signals back each other up and Stock A sits near the top of the list.',
  },
  conflict: {
    tab: 'Stock B',
    sentiment: 61,
    pricePercentile: 24,
    terms: { signalStrength: 42, agreement: 18, evidenceDepth: 68, fit: 75 },
    state: 'conflict',
    outcome: 'The news is just as positive, but the price has been weak, so the signals disagree and Stock B sits lower down.',
  },
};

export const STOCKS_EXAMPLE_LEAD =
  'Both stocks have almost the same news tone. Switch between them to see how the price evidence changes the result.';

export const STOCKS_LABELS_TITLE = 'Reading the labels';
export const STOCKS_AGREEMENT_MEANING: Record<ConvergenceState, string> = {
  agree_strongly: 'News and price point the same way, firmly.',
  lean_together: 'They point the same way, more gently.',
  mixed: 'Only one of them leans clearly, so the evidence is mixed.',
  conflict: 'They point in opposite directions, so the stock sits lower.',
};
export const STOCKS_OTHER_LABELS = [
  { key: 'hype', label: 'Hype flagged', body: 'Social buzz is running ahead of what the price evidence supports. The stock is flagged, never pushed up.' },
  { key: 'discovered', label: 'Discovered', body: 'Found among trending stocks, then checked exactly like every other stock in the run.' },
  { key: 'watching', label: 'Watching', body: 'On your watchlist, so it is included in your next analysis run.' },
] as const;

export const STOCKS_TIMES_TITLE = 'Three different times on this page';
export const STOCKS_TIMES = [
  { key: 'run', label: 'Last AI run', body: 'When the analysis that ordered this list ran. The prices on the page were captured then.' },
  { key: 'sentiment', label: 'Sentiment updated', body: 'When news and posts were last read again. It can be newer than the run.' },
  { key: 'market', label: 'Market clock', body: 'The time on the US exchanges right now, and whether they are open.' },
] as const;

export const STOCKS_MEANS_TITLE = 'What this page can and cannot tell you';
export const STOCKS_MEANS_LABEL = 'It tells you';
export const STOCKS_MEANS = [
  'What the evidence in your latest run shows, stock by stock',
  'Why each stock sits where it does, in plain words',
  'Whether news and price agree, and how much evidence there is',
];
export const STOCKS_NOT_MEANS_LABEL = 'It does not tell you';
export const STOCKS_NOT_MEANS = [
  'Whether to buy, sell or hold anything',
  'What a price will do next',
  'Anything about stocks outside your sectors and watchlist',
];

export const STOCKS_WAYFINDING_TITLE = 'Finding your way around';
export const STOCKS_WAYFINDING = [
  { key: 'top', title: 'Top signal card', body: 'The stock with the strongest, most consistent evidence for your profile, with its scorecard on the right.' },
  { key: 'shortlist', title: 'Ranks 2 to 5', body: 'The rest of your shortlist, each with its own written reason.' },
  { key: 'also', title: 'Also scored in this run', body: 'Every other stock the run scored, in order. The tabs narrow the table to one investment universe.' },
  { key: 'analysis', title: 'Full analysis', body: 'A stock’s own page: sentiment, price and risk, big investors and insider trading.' },
  { key: 'watchlist', title: 'Watchlist', body: 'Adds a stock to your next analysis run.' },
  { key: 'ask', title: 'Ask AlphaSwarm', body: 'Ask what a result means, in plain English.' },
] as const;

export const STOCKS_SCORECARD_TITLE = 'The four factors behind each place';
export const STOCKS_LEGACY_TITLE = 'How the order is decided';
export const STOCKS_LESSONS_TITLE = 'Lessons for this page';
export const STOCKS_METHODOLOGY_LINK = 'How these numbers are built';
