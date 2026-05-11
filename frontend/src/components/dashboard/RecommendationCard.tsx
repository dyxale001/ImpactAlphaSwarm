import { useState } from "react";
import { Link } from "react-router-dom";
import {TrendingUp, TrendingDown, ArrowRight, MessageSquare, BarChart3, Flame, Eye } from "lucide-react";
import { type AssetRecommendation } from "../../data/mockData";
import DualBar from "./DualBar"; // Use correct path/case

type PreviewTab = "overview" | "sentiment" | "fundamentals" | "hype";

function getPreview(asset: AssetRecommendation, tab: PreviewTab) {
  switch (tab) {
    case "sentiment": return { title: "Market Vibe", body: asset.sentimentScore >= 75 ? `Social channels are loudly bullish on ${asset.ticker}.` : `Mixed-to-neutral sentiment.` };
    case "fundamentals": return { title: "Hard Numbers", body: asset.fundamentalsScore >= 75 ? `Strong financials, reasonable valuation.` : `Weak or stretched fundamentals.` };
    case "hype": return { title: "Hype Check", body: asset.hypeAlert ? `Caution: social hype is outpacing numbers.` : `Balanced sentiment and fundamentals.` };
    default: return { title: "Quick Take", body: asset.reasoning };
  }
}

function MiniSparkline({ seed, positive }: { seed: number; positive: boolean }) {
  const points = Array.from({ length: 14 }, (_, i) => {
    const v = Math.sin((seed + i) * 1.7) * 8 + Math.cos((seed + i) * 0.9) * 6;
    return `${i * 8},${20 - v}`;
  }).join(" ");
  const stroke = positive ? "hsl(var(--color-brand-accent))" : "hsl(var(--color-brand-primary))";
  return (
    <svg viewBox="0 0 112 40" className="w-full h-10">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RecommendationCard({ asset, sizeClass, delay }: { asset: AssetRecommendation; sizeClass: string; delay: number }) {
  const [tab, setTab] = useState<PreviewTab>("overview");
  const preview = getPreview(asset, tab);

  const tabs = [
    { id: "overview" as PreviewTab, label: "Overview", icon: Eye },
    { id: "sentiment" as PreviewTab, label: "Vibe", icon: MessageSquare },
    { id: "fundamentals" as PreviewTab, label: "Numbers", icon: BarChart3 },
    { id: "hype" as PreviewTab, label: "Hype", icon: Flame },
  ];

  return (
    <div className={`soft-card p-5 space-y-4 hover:border-brand-primary/40 transition-all ${sizeClass}`} style={{ animation: `slide-up ${0.4 + delay * 0.08}s ease-out forwards` }}>
      {/* Re-use Header, Price row, DualBar, and Pills from your original code */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-brand-bg/70 border border-brand-border/60 flex items-center justify-center text-[10px] font-bold font-mono">{asset.ticker.slice(0, 3)}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-brand-fg">{asset.ticker}</p>
            <p className="text-[11px] text-brand-muted-fg truncate">{asset.category}</p>
          </div>
        </div>
        <div className={`chip ${asset.change >= 0 ? "bg-brand-accent/15 text-brand-accent" : "bg-brand-primary/15 text-brand-primary"}`}>
          {asset.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {asset.change >= 0 ? "+" : ""}{asset.change}%
        </div>
      </div>
      
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">Price</p>
          <p className="text-xl font-bold font-mono leading-tight text-brand-fg">R {asset.price.toFixed(2)}</p>
        </div>
        <div className="flex-1 max-w-[140px]">
          <MiniSparkline seed={asset.confidenceScore + asset.ticker.length} positive={asset.change >= 0} />
        </div>
      </div>

      <DualBar sentimentScore={asset.sentimentScore} fundamentalsScore={asset.fundamentalsScore} />

      <div className="flex items-center gap-1 bg-brand-bg/60 border border-brand-border/60 rounded-full p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-colors ${tab === t.id ? "bg-brand-primary text-brand-bg" : "text-brand-muted-fg hover:text-brand-fg"}`}>
            <t.icon className="w-3 h-3" /> <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-brand-bg/50 rounded-2xl p-3 border border-brand-border/50 min-h-[88px]">
        <p className="text-[10px] text-brand-muted-fg uppercase tracking-widest mb-1 font-semibold">{preview.title}</p>
        <p className="text-xs text-brand-fg/85 leading-relaxed">{preview.body}</p>
      </div>

      <div className="flex items-center justify-between">
        <span className={`chip ${asset.confidenceScore >= 70 ? "bg-brand-primary/15 text-brand-primary" : "bg-brand-muted-fg/20 text-brand-muted-fg"}`}>Score {asset.confidenceScore}</span>
        <Link to={`/asset/${asset.ticker}`} className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold">
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}