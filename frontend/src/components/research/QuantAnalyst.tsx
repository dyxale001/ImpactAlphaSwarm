import { BarChart3, Activity } from "lucide-react";

export default function QuantAnalyst({ data }: { data: any[] }) {
  return (
    <section className="glass-card p-6" style={{ animation: "slide-up 0.5s ease-out forwards" }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4" /> Quant Analyst Report - NVDA
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((ind) => (
          <div key={ind.name} className="flex items-start gap-3 p-3 rounded-lg bg-brand-secondary/50 border border-brand-border/50">
            <Activity className={`w-4 h-4 mt-0.5 ${
              ind.status === "bullish" ? "text-brand-primary" : "text-semantic-warning"
            }`} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-brand-fg">{ind.name}</p>
                <span className={`text-xs font-mono font-semibold ${
                  ind.status === "bullish" ? "text-brand-primary" : "text-semantic-warning"
                }`}>{ind.value}</span>
              </div>
              <p className="text-xs text-brand-muted-fg mt-0.5">{ind.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}