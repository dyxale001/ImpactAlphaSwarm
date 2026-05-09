export const INVESTMENT_CATEGORIES = [
  { id: "tech", label: "Tech Stocks", icon: "Laptop", examples: "AAPL, NVDA, MSFT" },
  { id: "green", label: "Green Energy", icon: "Leaf", examples: "ENPH, FSLR, NEE" },
  { id: "healthcare", label: "Healthcare", icon: "Heart", examples: "JNJ, UNH, PFE" },
  { id: "fintech", label: "FinTech", icon: "Landmark", examples: "SQ, PYPL, COIN" },
  { id: "ai", label: "AI & Robotics", icon: "Bot", examples: "NVDA, PLTR, PATH" },
  { id: "crypto", label: "Crypto-Adjacent", icon: "Bitcoin", examples: "COIN, MARA, MSTR" },
];

export interface AssetRecommendation {
  ticker: string;
  name: string;
  confidenceScore: number;
  sentimentScore: number;
  fundamentalsScore: number;
  reasoning: string;
  hypeAlert: boolean;
  allocation: number;
  price: number;
  change: number;
  category: string;
}

export const MOCK_RECOMMENDATIONS: AssetRecommendation[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA Corp",
    confidenceScore: 87,
    sentimentScore: 92,
    fundamentalsScore: 85,
    reasoning: "High Confidence: Quant metrics are strong AND Reddit sentiment is spiking. Revenue growth of 122% YoY with dominant AI chip market position. Social sentiment overwhelmingly bullish across all monitored channels.",
    hypeAlert: false,
    allocation: 25,
    price: 875.30,
    change: 3.2,
    category: "AI & Robotics",
  },
  {
    ticker: "AAPL",
    name: "Apple Inc",
    confidenceScore: 74,
    sentimentScore: 68,
    fundamentalsScore: 82,
    reasoning: "Moderate Confidence: Strong fundamentals with consistent cash flow generation. Sentiment is neutral-positive. Services segment growing steadily at 14% YoY.",
    hypeAlert: false,
    allocation: 20,
    price: 198.50,
    change: 0.8,
    category: "Tech Stocks",
  },
  {
    ticker: "ENPH",
    name: "Enphase Energy",
    confidenceScore: 62,
    sentimentScore: 55,
    fundamentalsScore: 70,
    reasoning: "Moderate Confidence: Solid clean energy fundamentals but mixed sentiment. Recent earnings beat expectations. Policy tailwinds from IRA subsidies.",
    hypeAlert: false,
    allocation: 15,
    price: 128.40,
    change: -1.4,
    category: "Green Energy",
  },
  {
    ticker: "PLTR",
    name: "Palantir Technologies",
    confidenceScore: 58,
    sentimentScore: 88,
    fundamentalsScore: 42,
    reasoning: "Caution: Sentiment is very high but fundamentals are lagging. Reddit and social media hype significantly outpaces current earnings multiples. P/E ratio of 200+ raises valuation concerns.",
    hypeAlert: true,
    allocation: 5,
    price: 22.80,
    change: 5.6,
    category: "AI & Robotics",
  },
  {
    ticker: "COIN",
    name: "Coinbase Global",
    confidenceScore: 51,
    sentimentScore: 75,
    fundamentalsScore: 38,
    reasoning: "Hype Check: Social buzz is elevated around crypto rally but revenue is heavily cyclical. Proceed with caution-sentiment may not sustain.",
    hypeAlert: true,
    allocation: 5,
    price: 178.20,
    change: 2.1,
    category: "Crypto-Adjacent",
  },
];

export const PORTFOLIO_HISTORY = [
  { date: "Jan", value: 10000 },
  { date: "Feb", value: 10320 },
  { date: "Mar", value: 10150 },
  { date: "Apr", value: 10680 },
  { date: "May", value: 11200 },
  { date: "Jun", value: 10890 },
  { date: "Jul", value: 11450 },
  { date: "Aug", value: 11820 },
  { date: "Sep", value: 12100 },
  { date: "Oct", value: 11950 },
  { date: "Nov", value: 12480 },
  { date: "Dec", value: 12890 },
];

export const SENTIMENT_DATA = [
  { source: "Reddit (r/wallstreetbets)", sentiment: "Bullish", score: 78, mentions: 1243, trending: true },
  { source: "Reddit (r/investing)", sentiment: "Neutral", score: 55, mentions: 487, trending: false },
  { source: "Telegram Groups", sentiment: "Very Bullish", score: 89, mentions: 892, trending: true },
  { source: "Twitter/X Finance", sentiment: "Bullish", score: 72, mentions: 3201, trending: true },
  { source: "News Outlets", sentiment: "Neutral", score: 52, mentions: 156, trending: false },
];

export const QUANT_INDICATORS = [
  { name: "RSI (14-day)", value: 62, status: "neutral" as const, description: "Relative Strength Index - not overbought or oversold" },
  { name: "MACD Signal", value: "Bullish Crossover", status: "bullish" as const, description: "Moving Average Convergence Divergence trending up" },
  { name: "Sharpe Ratio", value: 1.82, status: "bullish" as const, description: "Risk-adjusted returns are strong (>1.5 is good)" },
  { name: "Volatility (30d)", value: "18.4%", status: "neutral" as const, description: "Moderate volatility - normal range for this asset" },
  { name: "Volume Trend", value: "+34%", status: "bullish" as const, description: "Trading volume increasing - confirms price movement" },
  { name: "Support Level", value: "$820", status: "bullish" as const, description: "Strong price support established at this level" },
];
