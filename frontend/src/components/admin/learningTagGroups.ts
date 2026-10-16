import type { LearningTag } from '../../data/learningContexts';

/** Presentation only: keys and labels remain owned by LEARNING_TAGS. */
export const LEARNING_TAG_GROUPS = [
  { label: 'Getting started and your profile', tags: ['dashboard', 'risk-profile', 'investment-sectors', 'learning-levels', 'ask-alphaswarm'] },
  { label: 'Stocks and analysis', tags: ['stocks', 'stock-analysis', 'stock-ranking', 'sentiment-analysis', 'news-sentiment', 'social-sentiment', 'quant-analysis', 'compare-stocks'] },
  { label: 'Market news and ownership', tags: ['market-news', 'sector-news', 'institutional-holdings', 'insider-trading', 'whale-watching'] },
  { label: 'Funds', tags: ['funds', 'fund-risk', 'fund-matching', 'fund-fees', 'fund-factsheets', 'compare-funds'] },
  { label: 'Financial tools and planning', tags: ['financial-tools', 'investment-growth', 'compound-interest', 'investment-goals', 'purchasing-power', 'tfsa-planning'] },
  { label: 'Watchlists and portfolios', tags: ['watchlist', 'diversification', 'paper-trading', 'portfolio-diversification'] },
] satisfies Array<{ label: string; tags: LearningTag[] }>;
