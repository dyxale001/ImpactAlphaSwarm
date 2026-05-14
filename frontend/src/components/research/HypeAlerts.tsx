import { AlertTriangle } from "lucide-react";
import { type AssetRecommendation } from "../../data/mockData";

export default function HypeAlerts({ alerts }: { alerts: AssetRecommendation[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3" style={{ animation: "slide-up 0.3s ease-out forwards" }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-semantic-warning" /> Hype Check Alerts
      </h2>
      {alerts.map((a) => (
        <div key={a.ticker} className="glass-card p-4 border-semantic-warning/30 glow-accent">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-bold font-mono text-brand-fg">{a.ticker}</span>
            <span className="text-xs bg-semantic-warning/15 text-semantic-warning px-2 py-0.5 rounded-md font-medium">Sentiment ≫ Fundamentals</span>
          </div>
          <p className="text-sm text-brand-fg/80">{a.reasoning}</p>
          <div className="flex gap-4 mt-3 text-xs text-brand-muted-fg">
            <span>Sentiment: <strong className="text-semantic-info">{a.sentimentScore}</strong></span>
            <span>Fundamentals: <strong className="text-brand-primary">{a.fundamentalsScore}</strong></span>
            <span>Gap: <strong className="text-semantic-warning">{a.sentimentScore - a.fundamentalsScore} pts</strong></span>
          </div>
        </div>
      ))}
    </div>
  );
}