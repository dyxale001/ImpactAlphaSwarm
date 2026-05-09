import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { MOCK_RECOMMENDATIONS, SENTIMENT_DATA, QUANT_INDICATORS } from "@/data/mockData";
import ConfidenceRing from "@/components/ConfidenceRing";
import DualBar from "@/components/DualBar";
import TradeDialog from "@/components/TradeDialog";
import { usePaperTrading } from "@/store/paperTrading";
import { ArrowLeft, AlertTriangle, TrendingUp, TrendingDown, MessageSquare, BarChart3, Activity, ShieldCheck, Lightbulb, ShoppingCart } from "lucide-react";

const ASSET_SENTIMENT: Record<string, typeof SENTIMENT_DATA> = {
  NVDA: SENTIMENT_DATA,
  AAPL: [
    { source: "Reddit (r/investing)", sentiment: "Neutral", score: 58, mentions: 812, trending: false },
    { source: "Reddit (r/stocks)", sentiment: "Bullish", score: 65, mentions: 534, trending: false },
    { source: "Twitter/X Finance", sentiment: "Neutral", score: 52, mentions: 2104, trending: false },
    { source: "News Outlets", sentiment: "Bullish", score: 71, mentions: 423, trending: true },
    { source: "Telegram Groups", sentiment: "Neutral", score: 48, mentions: 210, trending: false },
  ],
  ENPH: [
    { source: "Reddit (r/investing)", sentiment: "Neutral", score: 50, mentions: 198, trending: false },
    { source: "Twitter/X Finance", sentiment: "Bearish", score: 38, mentions: 542, trending: false },
    { source: "News Outlets", sentiment: "Bullish", score: 68, mentions: 87, trending: true },
    { source: "Telegram Groups", sentiment: "Neutral", score: 55, mentions: 64, trending: false },
  ],
  PLTR: [
    { source: "Reddit (r/wallstreetbets)", sentiment: "Very Bullish", score: 91, mentions: 2340, trending: true },
    { source: "Reddit (r/stocks)", sentiment: "Bullish", score: 74, mentions: 890, trending: true },
    { source: "Twitter/X Finance", sentiment: "Bullish", score: 82, mentions: 4100, trending: true },
    { source: "Telegram Groups", sentiment: "Very Bullish", score: 88, mentions: 1230, trending: true },
    { source: "News Outlets", sentiment: "Neutral", score: 45, mentions: 210, trending: false },
  ],
  COIN: [
    { source: "Reddit (r/cryptocurrency)", sentiment: "Bullish", score: 76, mentions: 1890, trending: true },
    { source: "Reddit (r/wallstreetbets)", sentiment: "Bullish", score: 70, mentions: 650, trending: false },
    { source: "Twitter/X Finance", sentiment: "Bullish", score: 73, mentions: 3200, trending: true },
    { source: "Telegram Groups", sentiment: "Very Bullish", score: 85, mentions: 980, trending: true },
    { source: "News Outlets", sentiment: "Neutral", score: 48, mentions: 310, trending: false },
  ],
};

const ASSET_QUANT: Record<string, typeof QUANT_INDICATORS> = {
  NVDA: QUANT_INDICATORS,
  AAPL: [
    { name: "RSI (14-day)", value: 54, status: "neutral" as const, description: "Neutral territory - no strong momentum signal" },
    { name: "MACD Signal", value: "Flat", status: "neutral" as const, description: "No clear trend direction currently" },
    { name: "Sharpe Ratio", value: 1.45, status: "bullish" as const, description: "Decent risk-adjusted returns" },
    { name: "Volatility (30d)", value: "12.1%", status: "bullish" as const, description: "Low volatility - stable price action" },
    { name: "Volume Trend", value: "+8%", status: "neutral" as const, description: "Slightly above average volume" },
    { name: "Support Level", value: "$185", status: "bullish" as const, description: "Strong support from 200-day moving average" },
  ],
  ENPH: [
    { name: "RSI (14-day)", value: 44, status: "neutral" as const, description: "Approaching oversold but not there yet" },
    { name: "MACD Signal", value: "Bearish", status: "neutral" as const, description: "Downward momentum but flattening" },
    { name: "Sharpe Ratio", value: 0.92, status: "neutral" as const, description: "Below average risk-adjusted returns" },
    { name: "Volatility (30d)", value: "28.3%", status: "neutral" as const, description: "Higher than average volatility" },
    { name: "Volume Trend", value: "-12%", status: "neutral" as const, description: "Declining volume - less conviction" },
    { name: "Support Level", value: "$115", status: "bullish" as const, description: "Previous resistance now acting as support" },
  ],
  PLTR: [
    { name: "RSI (14-day)", value: 78, status: "neutral" as const, description: "Overbought territory - potential pullback" },
    { name: "MACD Signal", value: "Bullish", status: "bullish" as const, description: "Strong upward momentum" },
    { name: "Sharpe Ratio", value: 0.68, status: "neutral" as const, description: "Poor risk-adjusted returns relative to volatility" },
    { name: "Volatility (30d)", value: "42.1%", status: "neutral" as const, description: "Very high volatility - speculative territory" },
    { name: "Volume Trend", value: "+89%", status: "bullish" as const, description: "Massive volume surge - retail driven" },
    { name: "Support Level", value: "$18", status: "neutral" as const, description: "Weak support - large gap to downside" },
  ],
  COIN: [
    { name: "RSI (14-day)", value: 66, status: "neutral" as const, description: "Approaching overbought" },
    { name: "MACD Signal", value: "Bullish Crossover", status: "bullish" as const, description: "Positive momentum shift" },
    { name: "Sharpe Ratio", value: 0.74, status: "neutral" as const, description: "Below average risk-adjusted performance" },
    { name: "Volatility (30d)", value: "35.8%", status: "neutral" as const, description: "High volatility - correlated to crypto markets" },
    { name: "Volume Trend", value: "+45%", status: "bullish" as const, description: "Volume increasing with crypto rally" },
    { name: "Support Level", value: "$155", status: "bullish" as const, description: "200-day MA providing support" },
  ],
};

const REASONING_STEPS: Record<string, { agent: string; icon: React.ElementType; summary: string; detail: string }[]> = {
  NVDA: [
    { agent: "Sentiment Scout", icon: MessageSquare, summary: "Social sentiment overwhelmingly bullish", detail: "Scanned 5,823 mentions across Reddit, Telegram, and Twitter/X in the last 7 days. Bullish mentions outnumber bearish 8:1. Key narrative: AI infrastructure demand continues to accelerate. Trending on r/wallstreetbets with 1,243 mentions." },
    { agent: "Quant Analyst", icon: BarChart3, summary: "Technicals confirm uptrend with strong fundamentals", detail: "MACD bullish crossover confirmed. RSI at 62 - room to run before overbought. Sharpe ratio of 1.82 indicates excellent risk-adjusted returns. Revenue growth of 122% YoY with expanding margins. Volume trend +34% supports price action." },
    { agent: "Risk Manager", icon: ShieldCheck, summary: "Risk within acceptable parameters", detail: "Volatility at 18.4% is moderate for this asset class. Strong support at $820 limits downside. Position size of 25% allocation is justified given high confidence. No significant correlation risk with other portfolio holdings." },
    { agent: "Orchestrator", icon: Lightbulb, summary: "High conviction - BUY recommendation", detail: "Both sentiment and fundamentals align strongly. No hype-fundamental divergence detected. The Investment Committee assigns a Unified Confidence Score of 87/100. Recommended allocation: 25% of portfolio." },
  ],
  PLTR: [
    { agent: "Sentiment Scout", icon: MessageSquare, summary: "Extreme social hype detected", detail: "2,340 mentions on r/wallstreetbets alone - 3x normal volume. Telegram groups showing coordinated bullish messaging. Twitter/X engagement at all-time highs. WARNING: Sentiment intensity exceeds what fundamentals can support." },
    { agent: "Quant Analyst", icon: BarChart3, summary: "Fundamentals lag behind price action", detail: "RSI at 78 - firmly in overbought territory. P/E ratio above 200x is extreme. Sharpe ratio of 0.68 indicates poor risk-adjusted returns. Volatility at 42.1% signals speculative trading dominance." },
    { agent: "Risk Manager", icon: ShieldCheck, summary: "Hype-Fundamental divergence flagged", detail: "Sentiment score (88) exceeds fundamentals score (42) by 46 points - triggering Hype Check alert. Historical data shows similar divergences correct within 2-4 weeks. Weak support at $18 means significant downside risk." },
    { agent: "Orchestrator", icon: Lightbulb, summary: "Caution - small position only", detail: "The Investment Committee downgrades confidence due to hype-fundamental mismatch. Score: 58/100. Maximum allocation: 5%. Monitor for sentiment cooling before increasing position." },
  ],
  AAPL: [
    { agent: "Sentiment Scout", icon: MessageSquare, summary: "Steady neutral-positive sentiment", detail: "Moderate mention volume across platforms. No extreme bullish or bearish narratives. News coverage focused on services growth and Vision Pro reception. Institutional sentiment remains supportive." },
    { agent: "Quant Analyst", icon: BarChart3, summary: "Solid fundamentals, limited upside catalyst", detail: "RSI neutral at 54. Low volatility (12.1%) indicates stability. Strong cash flow generation and services revenue growing at 14% YoY. Sharpe ratio of 1.45 is respectable." },
    { agent: "Risk Manager", icon: ShieldCheck, summary: "Low risk profile - safe allocation", detail: "Strong support at $185 from 200-day MA. Low correlation with high-beta portfolio holdings. Suitable as a portfolio anchor position." },
    { agent: "Orchestrator", icon: Lightbulb, summary: "Moderate conviction - HOLD/ACCUMULATE", detail: "Fundamentals outpace sentiment slightly, suggesting underappreciation. Score: 74/100. Recommended allocation: 20%." },
  ],
  ENPH: [
    { agent: "Sentiment Scout", icon: MessageSquare, summary: "Mixed sentiment with policy tailwinds", detail: "Low mention volume overall. News coverage bullish on IRA subsidies. Social media sentiment cautious due to recent sector rotation away from clean energy." },
    { agent: "Quant Analyst", icon: BarChart3, summary: "Fundamentals recovering from pullback", detail: "RSI at 44 - near oversold. Higher-than-average volatility at 28.3%. Recent earnings beat expectations. Sharpe ratio below 1.0 reflects recent drawdown." },
    { agent: "Risk Manager", icon: ShieldCheck, summary: "Moderate risk - watch volatility", detail: "Declining volume signals less conviction. Support at $115 needs to hold. Position sizing should remain conservative until trend confirms." },
    { agent: "Orchestrator", icon: Lightbulb, summary: "Moderate conviction - selective entry", detail: "Fundamentals slightly ahead of sentiment, suggesting a potential recovery play. Score: 62/100. Allocation: 15%." },
  ],
  COIN: [
    { agent: "Sentiment Scout", icon: MessageSquare, summary: "Elevated buzz driven by crypto rally", detail: "High mention volume correlated with Bitcoin price action. r/cryptocurrency and Telegram groups highly bullish. Sentiment may be transient - tied to crypto cycle." },
    { agent: "Quant Analyst", icon: BarChart3, summary: "Cyclical revenue, improving technicals", detail: "MACD bullish crossover is positive. However, revenue is heavily tied to crypto trading volume which is cyclical. High volatility at 35.8%." },
    { agent: "Risk Manager", icon: ShieldCheck, summary: "Hype-Fundamental divergence detected", detail: "Sentiment (75) outpaces fundamentals (38) by 37 points. Revenue highly dependent on market conditions. Potential for sharp correction if crypto sentiment reverses." },
    { agent: "Orchestrator", icon: Lightbulb, summary: "Low conviction - minimal allocation", detail: "Hype Check triggered. Score: 51/100. Maximum 5% allocation. Re-evaluate if fundamentals improve with sustained trading volume." },
  ],
};

export default function AssetDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const asset = MOCK_RECOMMENDATIONS.find((a) => a.ticker === ticker);
  const [tradeOpen, setTradeOpen] = useState(false);
  const { holdings } = usePaperTrading();

  if (!asset) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <p className="text-foreground">Asset not found.</p>
      </div>
    );
  }

  const sentiment = ASSET_SENTIMENT[asset.ticker] || SENTIMENT_DATA;
  const quant = ASSET_QUANT[asset.ticker] || QUANT_INDICATORS;
  const steps = REASONING_STEPS[asset.ticker] || REASONING_STEPS["NVDA"];
  const owned = holdings[asset.ticker]?.shares ?? 0;

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link to="/" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {/* Header */}
      <div className="glass-card p-6" style={{ animation: "slide-up 0.3s ease-out forwards" }}>
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
          <ConfidenceRing score={asset.confidenceScore} size={100} label="Unified Score" />
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{asset.ticker}</h1>
              <span className="text-sm text-muted-foreground">{asset.name}</span>
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-md text-muted-foreground">{asset.category}</span>
              {asset.hypeAlert && (
                <span className="text-xs flex items-center gap-1 text-warning bg-warning/10 px-2 py-1 rounded-md">
                  <AlertTriangle className="w-3 h-3" /> Hype Check
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="font-mono">${asset.price.toFixed(2)}</span>
              <span className={`font-mono flex items-center gap-1 ${asset.change >= 0 ? "text-primary" : "text-danger"}`}>
                {asset.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {asset.change >= 0 ? "+" : ""}{asset.change}%
              </span>
              <span className="text-muted-foreground">Allocation: {asset.allocation}%</span>
              {owned > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-mono">
                  You own {owned} {owned === 1 ? "share" : "shares"}
                </span>
              )}
            </div>
            <DualBar sentimentScore={asset.sentimentScore} fundamentalsScore={asset.fundamentalsScore} />
          </div>
          <button
            onClick={() => setTradeOpen(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity self-stretch md:self-auto justify-center shadow-lg shadow-primary/20"
          >
            <ShoppingCart className="w-4 h-4" /> Trade
          </button>
        </div>
      </div>

      <TradeDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        asset={{ ticker: asset.ticker, name: asset.name, price: asset.price }}
      />

      {/* Reasoning Trace - step by step */}
      <section style={{ animation: "slide-up 0.4s ease-out forwards" }}>
        <h2 className="text-lg font-semibold mb-4">Reasoning Trace</h2>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <details key={i} className="glass-card group">
              <summary className="flex items-center gap-3 p-4 cursor-pointer select-none">
                <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                  <step.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{step.agent}</p>
                  <p className="text-sm font-medium">{step.summary}</p>
                </div>
                <span className="text-xs text-muted-foreground">Step {i + 1}/4</span>
              </summary>
              <div className="px-4 pb-4 pl-[60px]">
                <p className="text-sm text-foreground/80 leading-relaxed">{step.detail}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Sentiment Scout Report */}
      <section className="glass-card p-6" style={{ animation: "slide-up 0.5s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4" /> Sentiment Scout Report
        </h2>
        <div className="space-y-3">
          {sentiment.map((s) => (
            <div key={s.source} className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
              <div className="flex-1">
                <p className="text-sm font-medium">{s.source}</p>
                <p className="text-xs text-muted-foreground">{s.mentions.toLocaleString()} mentions</p>
              </div>
              <div className="text-right flex items-center gap-3">
                {s.trending && (
                  <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-md flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Trending
                  </span>
                )}
                <span className={`text-xs font-semibold px-2 py-1 rounded-md ${
                  s.score >= 70 ? "bg-primary/15 text-primary" :
                  s.score >= 50 ? "bg-warning/15 text-warning" :
                  "bg-danger/15 text-danger"
                }`}>
                  {s.sentiment} ({s.score})
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quant Analyst Report */}
      <section className="glass-card p-6" style={{ animation: "slide-up 0.6s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4" /> Quant Analyst Report
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {quant.map((ind) => (
            <div key={ind.name} className="flex items-start gap-3 p-3 rounded-sm bg-secondary/50 border border-border/50">
              <Activity className={`w-4 h-4 mt-0.5 ${
                ind.status === "bullish" ? "text-primary" : "text-muted-foreground"
              }`} />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{ind.name}</p>
                  <span className={`text-xs font-mono font-semibold ${
                    ind.status === "bullish" ? "text-primary" : "text-muted-foreground"
                  }`}>{ind.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ind.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}