import type { LearningContext } from './learningContexts';
export const LEARNING_CALLOUT_SUBTITLES: Record<LearningContext, string> = {
  dashboard: 'Build understanding alongside your market overview.', stocks: 'Understand the evidence behind stock analysis.',
  'stock.ranking': 'Explore how to interpret stock analysis.', 'stock.sentiment': 'Put market sentiment into perspective.',
  'stock.quant': 'Understand price trends, volatility and quantitative evidence.', 'stock.investors': 'Learn how to interpret institutional holdings.',
  'stock.insiders': 'Understand insider activity and its limitations.', 'stock.news': 'Put market news into context.',
  'stock.methodology': 'Explore the concepts behind the analysis.', 'stock.news-sentiment': 'Understand news sentiment and market reactions.',
  'stock.social-sentiment': 'Understand sentiment, popularity and investor behaviour.', news: 'Separate market developments from short-term noise.',
  funds: 'Explore fund risk and investment choices.', 'fund.overview': 'Understand the risk behind fund choices.',
  'fund.figures': 'Learn how to interpret fund costs and figures.', 'fund.document': 'Understand the information in fund factsheets.',
  'compare.stocks': 'Build context for comparing stocks.', 'compare.funds': 'Build context for comparing funds.',
  'tools.growth': 'Explore compounding and future purchasing power.', 'tools.goal': 'Understand time horizons and investment goals.',
  'tools.tfsa': 'Explore the concepts behind TFSA planning.', watchlist: 'Build perspective on the stocks you follow.',
  whales: 'Understand institutional ownership.', 'settings.risk': 'Understand risk and your comfort with uncertainty.',
  'settings.goals': 'Connect investment goals with time horizons.', 'settings.sectors': 'Explore sectors and diversification.',
  'settings.expertise': 'Build your financial understanding.', ask: 'Build understanding before exploring your data.',
  portfolio: 'Learn portfolio concepts in this simulated environment.',
};
