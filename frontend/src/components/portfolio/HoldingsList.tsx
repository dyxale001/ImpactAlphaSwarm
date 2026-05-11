import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export default function HoldingsList({ holdings }: { holdings: any[] }) {
  if (holdings.length === 0) {
    return (
      <div className="glass-card p-6" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Your Holdings</h2>
        <div className="text-center py-10 space-y-3">
          <p className="text-sm text-brand-muted-fg">You haven't placed any trades yet.</p>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-brand-primary hover:underline">
            Browse recommendations <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Your Holdings</h2>
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-3 text-[10px] uppercase tracking-widest text-brand-muted-fg px-3 pb-2 border-b border-brand-border/60">
          <span className="col-span-3">Asset</span>
          <span className="col-span-2 text-right">Shares</span>
          <span className="col-span-2 text-right">Avg Cost</span>
          <span className="col-span-2 text-right">Price</span>
          <span className="col-span-3 text-right">Market Value (P/L)</span>
        </div>
        {holdings.map((h) => (
          <Link
            to={`/asset/${h.ticker}`}
            key={h.ticker}
            className="grid grid-cols-12 gap-3 items-center px-3 py-3 rounded-lg hover:bg-brand-secondary/40 transition-colors text-sm"
          >
            <div className="col-span-3">
              <p className="font-mono font-bold text-brand-fg">{h.ticker}</p>
              <p className="text-xs text-brand-muted-fg truncate">{h.name}</p>
            </div>
            <p className="col-span-2 text-right font-mono text-brand-fg">{h.shares}</p>
            <p className="col-span-2 text-right font-mono text-brand-muted-fg">R {h.avgCost.toFixed(2)}</p>
            <p className="col-span-2 text-right font-mono text-brand-fg">R {h.price.toFixed(2)}</p>
            <div className="col-span-3 text-right">
              <p className="font-mono font-semibold text-brand-fg">R {h.marketValue.toFixed(2)}</p>
              <p className={`text-xs font-mono ${h.pnl >= 0 ? "text-brand-primary" : "text-semantic-danger"}`}>
                {h.pnl >= 0 ? "+" : ""}R {h.pnl.toFixed(2)} ({h.pnl >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%)
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}