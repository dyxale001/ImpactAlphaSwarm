import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ExternalLink, PieChart, RotateCcw } from "lucide-react";
import { PORTFOLIO_HISTORY, MOCK_RECOMMENDATIONS } from "../data/mockData";
import { usePortfolioStats } from "../hooks/usePortfolioStats";

import PortfolioSummary from "../components/portfolio/PortfolioSummary";
import HoldingsList from "../components/portfolio/HoldingsList";
import RecentTrades from "../components/portfolio/RecentTrades";

export default function PortfolioPage() {
  const { cash, startingCapital, trades, holdingsList, investedValue, totalValue, totalReturn, reset } = usePortfolioStats();

  const handleReset = () => {
    reset();
    alert(`Portfolio reset. Cash restored to R ${startingCapital.toLocaleString()}.`);
  };

  return (
    <div className="space-y-6 pt-10 px-8 pb-10 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-fg">Paper Trading Portfolio</h1>
          <p className="text-brand-muted-fg text-sm mt-1">Practice trading with virtual cash. No real money at risk.</p>
        </div>
        {trades.length > 0 && (
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 text-xs text-brand-muted-fg hover:text-brand-fg border border-brand-border/60 rounded-full px-4 py-2 hover:bg-brand-secondary/40 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Portfolio
          </button>
        )}
      </div>

      <PortfolioSummary cash={cash} investedValue={investedValue} totalValue={totalValue} totalReturn={totalReturn} />
      <HoldingsList holdings={holdingsList} />
      <RecentTrades trades={trades} />

      {/* Performance Chart */}
      <div className="glass-card p-6" style={{ animation: "slide-up 0.5s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">Simulated Performance (Demo Data)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={PORTFOLIO_HISTORY}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-brand-border)" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fill: "var(--color-brand-muted-fg)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--color-brand-muted-fg)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R ${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "var(--color-brand-card)", border: "1px solid var(--color-brand-border)", borderRadius: "8px", fontSize: "12px", color: "var(--color-brand-fg)" }}
                formatter={(value: any) => [`R ${Number(value).toLocaleString()}`, "Value"]}
              />
              <Line type="monotone" dataKey="value" stroke="var(--color-brand-primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Suggested Allocation */}
      <div className="glass-card p-6" style={{ animation: "slide-up 0.6s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg flex items-center gap-2 mb-4">
          <PieChart className="w-4 h-4" /> AI Suggested Allocation
        </h2>
        <div className="space-y-3">
          {MOCK_RECOMMENDATIONS.map((asset) => (
            <div key={asset.ticker} className="flex items-center gap-4">
              <span className="text-sm font-mono font-bold w-12 text-brand-fg">{asset.ticker}</span>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-brand-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-primary transition-all duration-700"
                    style={{ width: `${asset.allocation || 0}%`, opacity: 0.5 + (asset.allocation || 0) / 50 }}
                  />
                </div>
              </div>
              <span className="text-sm font-mono text-brand-muted-fg w-10 text-right">{asset.allocation || 0}%</span>
              <span className="text-xs text-brand-muted-fg w-20 text-right">
                R {((startingCapital * (asset.allocation || 0)) / 100).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* External Link */}
      <div className="glass-card p-6 text-center" style={{ animation: "slide-up 0.7s ease-out forwards" }}>
        <p className="text-sm text-brand-muted-fg mb-3">Ready to trade for real? Execute on your preferred platform.</p>
        <a href="https://www.easyequities.co.za" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-brand-primary text-brand-bg px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-brand-primary/20">
          Trade on EasyEquities <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}