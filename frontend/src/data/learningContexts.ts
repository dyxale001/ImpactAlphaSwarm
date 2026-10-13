export const LEARNING_TAGS = {
  dashboard: 'Dashboard', stocks: 'Stocks', 'stock-analysis': 'Stock analysis', 'stock-ranking': 'Stock ranking',
  'sentiment-analysis': 'Sentiment analysis', 'news-sentiment': 'News sentiment', 'social-sentiment': 'Social sentiment',
  'quant-analysis': 'Quant analysis', 'institutional-holdings': 'Institutional holdings', 'insider-trading': 'Insider trading',
  'market-news': 'Market News', 'sector-news': 'Sector news', funds: 'Funds', 'fund-risk': 'Fund risk', 'fund-matching': 'Fund matching',
  'fund-fees': 'Fund fees', 'fund-factsheets': 'Fund factsheets', 'compare-stocks': 'Compare stocks', 'compare-funds': 'Compare funds',
  'financial-tools': 'Financial Tools', 'investment-growth': 'Investment growth', 'compound-interest': 'Compound interest',
  'investment-goals': 'Investment goals', 'purchasing-power': 'Purchasing power', 'tfsa-planning': 'TFSA planning',
  watchlist: 'Watchlist', diversification: 'Diversification', 'whale-watching': 'Whale Watching',
  'risk-profile': 'Risk profile', 'investment-sectors': 'Investment sectors', 'learning-levels': 'Learning levels',
  'ask-alphaswarm': 'Ask AlphaSwarm', 'paper-trading': 'Paper trading', 'portfolio-diversification': 'Portfolio diversification',
} as const;
export type LearningTag = keyof typeof LEARNING_TAGS;
// Most specific tags first; later matches break ties, not replace specific matches.
export const LEARNING_CONTEXTS = {
  dashboard: ['dashboard'], stocks: ['stock-ranking', 'stock-analysis', 'stocks'],
  'stock.ranking': ['stock-ranking', 'stock-analysis'], 'stock.sentiment': ['sentiment-analysis', 'stock-analysis'],
  'stock.quant': ['quant-analysis', 'stock-analysis'], 'stock.investors': ['institutional-holdings', 'stock-analysis'],
  'stock.insiders': ['insider-trading', 'stock-analysis'], 'stock.news': ['sector-news', 'market-news'],
  'stock.methodology': ['stock-analysis'], 'stock.news-sentiment': ['news-sentiment', 'sentiment-analysis'],
  'stock.social-sentiment': ['social-sentiment', 'sentiment-analysis'],
  news: ['sector-news', 'market-news'], funds: ['fund-matching', 'fund-risk', 'funds'],
  'fund.overview': ['fund-risk', 'funds'], 'fund.figures': ['fund-fees', 'funds'], 'fund.document': ['fund-factsheets', 'funds'],
  'compare.stocks': ['compare-stocks'], 'compare.funds': ['compare-funds'],
  'tools.growth': ['compound-interest', 'investment-growth', 'purchasing-power', 'financial-tools'],
  'tools.goal': ['investment-goals', 'purchasing-power', 'financial-tools'], 'tools.tfsa': ['tfsa-planning', 'purchasing-power', 'financial-tools'],
  watchlist: ['watchlist', 'diversification'], whales: ['institutional-holdings', 'whale-watching'],
  'settings.risk': ['risk-profile'], 'settings.goals': ['investment-goals', 'fund-matching'],
  'settings.sectors': ['investment-sectors', 'diversification'], 'settings.expertise': ['learning-levels'],
  ask: ['ask-alphaswarm'], portfolio: ['paper-trading', 'portfolio-diversification'],
} satisfies Record<string, LearningTag[]>;
export type LearningContext = keyof typeof LEARNING_CONTEXTS;
export function normalizeLearningTags(value: unknown): LearningTag[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().toLowerCase()))]
    .filter((tag): tag is LearningTag => Object.prototype.hasOwnProperty.call(LEARNING_TAGS, tag));
}
export interface LearningPreview { id: string; title: string; summary: string; tags?: string[] | null; display_order: number }
export function relatedArticles(articles: LearningPreview[], context: LearningContext) {
  const tags: readonly string[] = LEARNING_CONTEXTS[context];
  const score = (a: LearningPreview) => tags.reduce((sum, tag, i) => sum + (normalizeLearningTags(a.tags).includes(tag as LearningTag) ? 2 ** (tags.length - i) : 0), 0);
  return [...new Map(articles.map(a => [String(a.id), a])).values()].filter(a => score(a) > 0)
    .sort((a,b) => score(b)-score(a) || a.display_order-b.display_order || String(a.id).localeCompare(String(b.id))) .slice(0,3);
}
