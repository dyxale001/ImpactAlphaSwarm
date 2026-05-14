export interface AssetRecommendation {
  ticker: string;
  name: string;
  category: string;
  price: number;
  change: number;
  confidenceScore: number;
  sentimentScore: number;
  fundamentalsScore: number;
  hypeAlert: boolean;
  reasoning: string;
  allocation?: number;
}

export const MOCK_RECOMMENDATIONS: AssetRecommendation[] = [
  { ticker: "NVDA", name: "NVIDIA Corp.", category: "Semiconductors", price: 900.25, change: 2.4, confidenceScore: 88, sentimentScore: 92, fundamentalsScore: 85, hypeAlert: true, allocation: 25, reasoning: "Strong AI tailwinds but retail hype is peaking." },
  { ticker: "MSFT", name: "Microsoft", category: "Software", price: 420.55, change: 1.2, confidenceScore: 92, sentimentScore: 88, fundamentalsScore: 95, hypeAlert: false, allocation: 35, reasoning: "Steady cloud growth and AI integration driving sustained value." },
  { ticker: "TSLA", name: "Tesla", category: "Automotive", price: 175.22, change: -3.5, confidenceScore: 45, sentimentScore: 40, fundamentalsScore: 55, hypeAlert: false, allocation: 10, reasoning: "Margin compression and slowing EV demand remain risks." },
  { ticker: "CRWD", name: "CrowdStrike", category: "Cybersecurity", price: 310.15, change: 5.2, confidenceScore: 75, sentimentScore: 85, fundamentalsScore: 80, hypeAlert: true, allocation: 15, reasoning: "Exceptional earnings beat but trading at a stretched valuation." },
  { ticker: "PLTR", name: "Palantir", category: "Software", price: 23.40, change: -1.1, confidenceScore: 65, sentimentScore: 70, fundamentalsScore: 60, hypeAlert: true, allocation: 15, reasoning: "Retail favorite with improving commercial revenue." }
];

export const SENTIMENT_DATA = [
  { source: "Reddit (r/wallstreetbets)", mentions: 4502, sentiment: "Bullish", score: 85, trending: true },
  { source: "Financial Twitter", mentions: 12053, sentiment: "Neutral-Bullish", score: 65, trending: false },
  { source: "News Headlines", mentions: 890, sentiment: "Bullish", score: 78, trending: true },
];

export const QUANT_INDICATORS = [
  { name: "RSI (14 Day)", value: "68", status: "bullish", description: "Approaching overbought territory but maintaining strong upward momentum." },
  { name: "MACD (12,26)", value: "Bullish Cross", status: "bullish", description: "MACD line crossed above signal line 3 days ago." },
  { name: "EV/EBITDA", value: "35x", status: "warning", description: "Trading at a premium to historical averages and sector peers." },
  { name: "Short Interest", value: "2.4%", status: "bullish", description: "Low short interest indicating minimal institutional bearishness." },
];

export const WATCHLIST_ASSETS: AssetRecommendation[] = [
  ...MOCK_RECOMMENDATIONS,
  {
    ticker: "MSFT",
    name: "Microsoft Corp",
    category: "Tech Stocks",
    price: 415.60,
    change: 1.1,
    confidenceScore: 79,
    sentimentScore: 65,
    fundamentalsScore: 88,
    hypeAlert: false,
    reasoning: "Strong cloud growth with Azure. Fundamentals outpace sentiment.",
  },
  {
    ticker: "TSLA",
    name: "Tesla Inc",
    category: "Tech Stocks",
    price: 245.20,
    change: -2.3,
    confidenceScore: 55,
    sentimentScore: 82,
    fundamentalsScore: 40,
    hypeAlert: true,
    reasoning: "High social buzz but valuation stretched relative to earnings.",
  },
  {
    ticker: "FSLR",
    name: "First Solar Inc",
    category: "Green Energy",
    price: 178.90,
    change: 0.6,
    confidenceScore: 64,
    sentimentScore: 48,
    fundamentalsScore: 72,
    hypeAlert: false,
    reasoning: "Solid fundamentals in solar manufacturing. Low social attention.",
  },
];

export const PORTFOLIO_HISTORY = [
  { date: "May 01", value: 10000 },
  { date: "May 02", value: 10150 },
  { date: "May 03", value: 10080 },
  { date: "May 04", value: 10420 },
  { date: "May 05", value: 10390 },
  { date: "May 06", value: 10650 },
  { date: "May 07", value: 10810 },
  { date: "May 08", value: 10750 },
  { date: "May 09", value: 10920 },
  { date: "May 10", value: 11140 },
  { date: "May 11", value: 11250 },
];