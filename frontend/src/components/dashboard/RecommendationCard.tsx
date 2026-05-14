import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageSquare, BarChart3, Flame, Eye } from "lucide-react";
import { type AssetRecommendation } from "../../hooks/useDashboardStats";
import DualBar from "./DualBar";

type PreviewTab = "overview" | "sentiment" | "fundamentals" | "hype";

function getPreview(asset: AssetRecommendation, tab: PreviewTab) {
  switch (tab) {
    case "sentiment":
      return {
        title: "Market Vibe",
        body:
          asset.sentimentScore >= 70
            ? `Strong social momentum. With a score of ${asset.sentimentScore}/100, the internet is highly bullish on ${asset.ticker}.`
            : `Neutral chatter. A score of ${asset.sentimentScore}/100 indicates balanced or quiet discussion online.`,
      };
    case "fundamentals":
      return {
        title: "Hard Numbers",
        body: `Quantitative Score: ${asset.fundamentalsScore}/100. Higher quant scores indicate stronger technical signals and healthier financials backing the AI's decision.`,
      };
    case "hype":
      return {
        title: "Hype Check",
        body:
          asset.hypePenalty > 0
            ? `Hype Penalty Applied: The AI deducted ${asset.hypePenalty} points from ${asset.ticker}'s final score because social hype is outpacing the math.`
            : `Clear Signal. No hype penalties were applied (${asset.hypePenalty} points deducted).`,
      };
    default:
      return { title: "Quick Take", body: asset.reasoning };
  }
}

function MiniSparkline({
  seed,
  positive,
}: {
  seed: number;
  positive: boolean;
}) {
  const points = Array.from({ length: 14 }, (_, i) => {
    const v = Math.sin((seed + i) * 1.7) * 8 + Math.cos((seed + i) * 0.9) * 6;
    return `${i * 8},${20 - v}`;
  }).join(" ");
  const stroke = positive
    ? "hsl(var(--color-brand-accent))"
    : "hsl(var(--color-brand-primary))";
  return (
    <svg viewBox="0 0 112 40" className="w-full h-10">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function RecommendationCard({
  asset,
  sizeClass,
  delay,
}: {
  asset: AssetRecommendation;
  sizeClass: string;
  delay: number;
}) {
  const [tab, setTab] = useState<PreviewTab>("overview");
  const preview = getPreview(asset, tab);

  const tabs = [
    { id: "overview" as PreviewTab, label: "Overview", icon: Eye },
    { id: "sentiment" as PreviewTab, label: "Vibe", icon: MessageSquare },
    { id: "fundamentals" as PreviewTab, label: "Numbers", icon: BarChart3 },
    { id: "hype" as PreviewTab, label: "Hype", icon: Flame },
  ];

  return (
    <div
      className={`soft-card p-5 space-y-4 hover:border-brand-primary/40 transition-all ${sizeClass}`}
      style={{ animation: `slide-up ${0.4 + delay * 0.08}s ease-out forwards` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-brand-bg/70 border border-brand-border/60 flex items-center justify-center text-[10px] font-bold font-mono">
            {asset.ticker.slice(0, 3)}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-brand-fg">
              {asset.ticker}
            </p>
            <p className="text-[11px] text-brand-muted-fg truncate">
              {asset.name}
            </p>
            <p className="text-sm font-mono text-brand-muted-fg mt-1">
              R {asset.currentPrice.toFixed(2)}
            </p>
          </div>
        </div>
        <div
          className={`chip ${asset.rank === 1 ? "bg-brand-primary/15 text-brand-primary" : "bg-brand-accent/15 text-brand-accent"}`}
        >
          Rank {asset.rank}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="relative group">
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
            Confidence Score
          </p>
          <p className="text-xl font-bold font-mono leading-tight text-brand-fg">
            {asset.confidenceScore}
          </p>
          <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-0 translate-x-0 mt-2 w-64 z-50">
            <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
              A unified measure of the AI's conviction in this asset. It blends
              quantitative data with market sentiment, specifically applying
              penalties to risky assets where social hype outpaces actual
              financial strength.
            </div>
          </div>
        </div>
        <div className="flex-1 max-w-35">
          <MiniSparkline
            seed={asset.confidenceScore + asset.ticker.length}
            positive={asset.confidenceScore >= 60}
          />
        </div>
      </div>

      <DualBar
        sentimentScore={asset.sentimentScore}
        quantitativeScore={asset.fundamentalsScore}
      />

      <div className="flex flex-wrap gap-2">
        {asset.isHype ? (
          <span className="chip bg-semantic-warning/15 text-semantic-warning">
            <Flame className="w-3 h-3" /> Hype flagged
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1 bg-brand-bg/60 border border-brand-border/60 rounded-full p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-colors ${tab === t.id ? "bg-brand-primary text-brand-bg" : "text-brand-muted-fg hover:text-brand-fg"}`}
          >
            <t.icon className="w-3 h-3" />{" "}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-brand-bg/50 rounded-2xl p-3 border border-brand-border/50">
        <p className="text-[10px] text-brand-muted-fg uppercase tracking-widest mb-1 font-semibold">
          {preview.title}
        </p>
        <p className="text-xs text-brand-fg/85 leading-relaxed">
          {preview.body}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Link
          to={`/asset/${asset.ticker}`}
          className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold"
        >
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
