import { Wallet } from "lucide-react";

interface Props {
  cash: number;
  investedValue: number;
  totalValue: number;
  totalReturn: number;
}

export default function PortfolioSummary({ cash, investedValue, totalValue, totalReturn }: Props) {
  return (
    <div className="bento-grid" style={{ animation: "slide-up 0.3s ease-out forwards" }}>
      <div className="glass-card p-5 col-span-6 md:col-span-3 lg:col-span-2">
        <p className="text-xs text-brand-muted-fg uppercase tracking-widest font-semibold flex items-center gap-1.5">
          <Wallet className="w-3 h-3" /> Cash Available
        </p>
        <p className="text-2xl font-bold font-mono mt-2 text-brand-fg">R {cash.toFixed(2)}</p>
      </div>
      <div className="glass-card p-5 col-span-6 md:col-span-3 lg:col-span-2">
        <p className="text-xs text-brand-muted-fg uppercase tracking-widest font-semibold">Invested Value</p>
        <p className="text-2xl font-bold font-mono mt-2 text-brand-fg">R {investedValue.toFixed(2)}</p>
      </div>
      <div className="glass-card glow-primary p-5 col-span-6 md:col-span-3 lg:col-span-2">
        <p className="text-xs text-brand-muted-fg uppercase tracking-widest font-semibold">Total Value</p>
        <p className="text-2xl font-bold font-mono gradient-text mt-2">R {totalValue.toFixed(2)}</p>
        <p className={`text-xs font-mono mt-1 ${totalReturn >= 0 ? "text-brand-primary" : "text-semantic-danger"}`}>
          {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(2)}% all time
        </p>
      </div>
    </div>
  );
}