import { History, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function RecentTrades({ trades }: { trades: any[] }) {
  if (trades.length === 0) return null;

  return (
    <div className="glass-card p-6" style={{ animation: "slide-up 0.45s ease-out forwards" }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg flex items-center gap-2 mb-4">
        <History className="w-4 h-4" /> Recent Trades
      </h2>
      <div className="space-y-1">
        {trades.slice(0, 10).map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-2 border-b border-brand-border/40 last:border-0 text-sm">
            <span className={`w-7 h-7 rounded-md flex items-center justify-center ${
              t.side === "buy" ? "bg-brand-primary/15 text-brand-primary" : "bg-semantic-danger/15 text-semantic-danger"
            }`}>
              {t.side === "buy" ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            </span>
            <div className="flex-1">
              <p className="text-sm text-brand-fg">
                <span className="font-semibold capitalize">{t.side}</span>{" "}
                <span className="font-mono">{t.shares}</span> {t.shares === 1 ? "share" : "shares"} of{" "}
                <span className="font-mono font-bold">{t.ticker}</span>
              </p>
              <p className="text-xs text-brand-muted-fg">{new Date(t.timestamp).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-brand-fg">R {(t.shares * t.price).toFixed(2)}</p>
              <p className="text-xs text-brand-muted-fg font-mono">@ R {t.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}