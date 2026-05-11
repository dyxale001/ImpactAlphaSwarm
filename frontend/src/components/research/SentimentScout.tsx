import { MessageSquare, TrendingUp } from "lucide-react";

export default function SentimentScout({ data }: { data: any[] }) {
  return (
    <section className="glass-card p-6" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4" /> Sentiment Scout Report - NVDA
      </h2>
      <div className="space-y-3">
        {data.map((s) => (
          <div key={s.source} className="flex items-center gap-4 py-2 border-b border-brand-border/50 last:border-0">
            <div className="flex-1">
              <p className="text-sm font-medium text-brand-fg">{s.source}</p>
              <p className="text-xs text-brand-muted-fg">{s.mentions.toLocaleString()} mentions</p>
            </div>
            <div className="text-right flex items-center gap-3">
              {s.trending && (
                <span className="text-xs bg-brand-primary/15 text-brand-primary px-2 py-0.5 rounded-md flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Trending
                </span>
              )}
              <span className={`text-xs font-semibold px-2 py-1 rounded-md ${
                s.score >= 70 ? "bg-brand-primary/15 text-brand-primary" :
                s.score >= 50 ? "bg-semantic-warning/15 text-semantic-warning" :
                "bg-semantic-danger/15 text-semantic-danger"
              }`}>
                {s.sentiment} ({s.score})
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}