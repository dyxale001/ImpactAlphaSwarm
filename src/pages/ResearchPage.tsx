import { SENTIMENT_DATA, QUANT_INDICATORS, MOCK_RECOMMENDATIONS } from "@/data/mockData";
import { AlertTriangle, TrendingUp, MessageSquare, BarChart3, Activity } from "lucide-react";

export default function ResearchPage() {
  const hypeAlerts = MOCK_RECOMMENDATIONS.filter((r) => r.hypeAlert);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Research Deep Dive</h1>
        <p className="text-muted-foreground text-sm mt-1">Explore the reasoning traces behind every recommendation.</p>
      </div>

      {/* Hype Check Alerts */}
      {hypeAlerts.length > 0 && (
        <div className="space-y-3" style={{ animation: "slide-up 0.3s ease-out forwards" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" /> Hype Check Alerts
          </h2>
          {hypeAlerts.map((a) => (
            <div key={a.ticker} className="glass-card p-4 border-warning/30 glow-accent">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-bold font-mono">{a.ticker}</span>
                <span className="text-xs bg-warning/15 text-warning px-2 py-0.5 rounded-md font-medium">Sentiment ≫ Fundamentals</span>
              </div>
              <p className="text-sm text-foreground/80">{a.reasoning}</p>
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                <span>Sentiment: <strong className="text-info">{a.sentimentScore}</strong></span>
                <span>Fundamentals: <strong className="text-primary">{a.fundamentalsScore}</strong></span>
                <span>Gap: <strong className="text-warning">{a.sentimentScore - a.fundamentalsScore} pts</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sentiment Scout */}
      <section className="glass-card p-6" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4" /> Sentiment Scout Report - NVDA
        </h2>
        <div className="space-y-3">
          {SENTIMENT_DATA.map((s) => (
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

      {/* Quant Analyst */}
      <section className="glass-card p-6" style={{ animation: "slide-up 0.5s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4" /> Quant Analyst Report - NVDA
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {QUANT_INDICATORS.map((ind) => (
            <div key={ind.name} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
              <Activity className={`w-4 h-4 mt-0.5 ${
                ind.status === "bullish" ? "text-primary" : "text-warning"
              }`} />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{ind.name}</p>
                  <span className={`text-xs font-mono font-semibold ${
                    ind.status === "bullish" ? "text-primary" : "text-warning"
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
