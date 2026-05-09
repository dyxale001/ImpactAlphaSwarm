import { Link } from "react-router-dom";
import { MOCK_RECOMMENDATIONS, PORTFOLIO_HISTORY } from "@/data/mockData";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ExternalLink, PieChart, Wallet, History, ArrowUpRight, ArrowDownRight, RotateCcw } from "lucide-react";
import { usePaperTrading } from "@/store/paperTrading";
import { toast } from "@/hooks/use-toast";

export default function PortfolioPage() {
  const { cash, startingCapital, holdings, trades, reset } = usePaperTrading();

  const priceMap = Object.fromEntries(MOCK_RECOMMENDATIONS.map((a) => [a.ticker, a.price]));

  const holdingsList = Object.values(holdings).map((h) => {
    const price = priceMap[h.ticker] ?? h.avgCost;
    const marketValue = h.shares * price;
    const costBasis = h.shares * h.avgCost;
    const pnl = marketValue - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { ...h, price, marketValue, costBasis, pnl, pnlPct };
  });

  const investedValue = holdingsList.reduce((s, h) => s + h.marketValue, 0);
  const totalValue = cash + investedValue;
  const totalReturn = ((totalValue - startingCapital) / startingCapital) * 100;

  const handleReset = () => {
    reset();
    toast({ title: "Portfolio reset", description: `Cash restored to $${startingCapital.toLocaleString()}.` });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paper Trading Portfolio</h1>
          <p className="text-muted-foreground text-sm mt-1">Practice trading with virtual cash. No real money at risk.</p>
        </div>
        {trades.length > 0 && (
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-4 py-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Portfolio
          </button>
        )}
      </div>

      {/* Bento summary */}
      <div className="bento-grid" style={{ animation: "slide-up 0.3s ease-out forwards" }}>
        <div className="glass-card p-5 col-span-6 md:col-span-3 lg:col-span-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Wallet className="w-3 h-3" /> Cash Available
          </p>
          <p className="text-2xl font-bold font-mono mt-2">${cash.toFixed(2)}</p>
        </div>
        <div className="glass-card p-5 col-span-6 md:col-span-3 lg:col-span-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Invested Value</p>
          <p className="text-2xl font-bold font-mono mt-2">${investedValue.toFixed(2)}</p>
        </div>
        <div className="glass-card glow-primary p-5 col-span-6 md:col-span-3 lg:col-span-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Total Value</p>
          <p className="text-2xl font-bold font-mono gradient-text mt-2">${totalValue.toFixed(2)}</p>
          <p className={`text-xs font-mono mt-1 ${totalReturn >= 0 ? "text-primary" : "text-danger"}`}>
            {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(2)}% all time
          </p>
        </div>
      </div>

      {/* Your Holdings */}
      <div className="glass-card p-6" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Your Holdings</h2>
        {holdingsList.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-sm text-muted-foreground">You haven't placed any trades yet.</p>
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              Browse recommendations <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 text-[10px] uppercase tracking-widest text-muted-foreground px-3 pb-2 border-b border-border/60">
              <span className="col-span-3">Asset</span>
              <span className="col-span-2 text-right">Shares</span>
              <span className="col-span-2 text-right">Avg Cost</span>
              <span className="col-span-2 text-right">Price</span>
              <span className="col-span-3 text-right">Market Value (P/L)</span>
            </div>
            {holdingsList.map((h) => (
              <Link
                to={`/asset/${h.ticker}`}
                key={h.ticker}
                className="grid grid-cols-12 gap-3 items-center px-3 py-3 rounded-lg hover:bg-secondary/40 transition-colors text-sm"
              >
                <div className="col-span-3">
                  <p className="font-mono font-bold">{h.ticker}</p>
                  <p className="text-xs text-muted-foreground truncate">{h.name}</p>
                </div>
                <p className="col-span-2 text-right font-mono">{h.shares}</p>
                <p className="col-span-2 text-right font-mono text-muted-foreground">${h.avgCost.toFixed(2)}</p>
                <p className="col-span-2 text-right font-mono">${h.price.toFixed(2)}</p>
                <div className="col-span-3 text-right">
                  <p className="font-mono font-semibold">${h.marketValue.toFixed(2)}</p>
                  <p className={`text-xs font-mono ${h.pnl >= 0 ? "text-primary" : "text-danger"}`}>
                    {h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)} ({h.pnl >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%)
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Trades */}
      {trades.length > 0 && (
        <div className="glass-card p-6" style={{ animation: "slide-up 0.45s ease-out forwards" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
            <History className="w-4 h-4" /> Recent Trades
          </h2>
          <div className="space-y-1">
            {trades.slice(0, 10).map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0 text-sm">
                <span className={`w-7 h-7 rounded-md flex items-center justify-center ${
                  t.side === "buy" ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"
                }`}>
                  {t.side === "buy" ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                </span>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-semibold capitalize">{t.side}</span>{" "}
                    <span className="font-mono">{t.shares}</span> {t.shares === 1 ? "share" : "shares"} of{" "}
                    <span className="font-mono font-bold">{t.ticker}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(t.timestamp).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono">${(t.shares * t.price).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground font-mono">@ ${t.price.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Chart */}
      <div className="glass-card p-6" style={{ animation: "slide-up 0.5s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Simulated Performance (Demo Data)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={PORTFOLIO_HISTORY}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="date" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  background: "hsl(220, 18%, 12%)",
                  border: "1px solid hsl(220, 14%, 18%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
formatter={(value) => [`$${Number(value).toLocaleString()}`, "Value"]}              />
              <Line type="monotone" dataKey="value" stroke="hsl(160, 84%, 45%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Suggested Allocation */}
      <div className="glass-card p-6" style={{ animation: "slide-up 0.6s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
          <PieChart className="w-4 h-4" /> AI Suggested Allocation
        </h2>
        <div className="space-y-3">
          {MOCK_RECOMMENDATIONS.map((asset) => (
            <div key={asset.ticker} className="flex items-center gap-4">
              <span className="text-sm font-mono font-bold w-12">{asset.ticker}</span>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${asset.allocation}%`, opacity: 0.5 + asset.allocation / 50 }}
                  />
                </div>
              </div>
              <span className="text-sm font-mono text-muted-foreground w-10 text-right">{asset.allocation}%</span>
              <span className="text-xs text-muted-foreground w-20 text-right">
                ${((startingCapital * asset.allocation) / 100).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* External Link */}
      <div className="glass-card p-6 text-center" style={{ animation: "slide-up 0.7s ease-out forwards" }}>
        <p className="text-sm text-muted-foreground mb-3">Ready to trade for real? Execute on your preferred platform.</p>
        <a
          href="https://www.easyequities.co.za"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
          Trade on EasyEquities <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
