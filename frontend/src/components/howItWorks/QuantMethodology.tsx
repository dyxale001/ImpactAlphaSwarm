import { BarChart3, ShieldCheck } from "lucide-react";
import MethodologyCardHeader from "./MethodologyCardHeader";

// Placeholder for the quantitative methodology. The quant engine is still being
// finalized, so this space is intentionally reserved: the walkthrough can drop in
// here later without reworking the page.
export default function QuantMethodology() {
  return (
    <div className="soft-card w-full space-y-5 p-6">
      <MethodologyCardHeader
        icon={BarChart3}
        title="The Quantitative Score"
        subtitle="How the technicals and risk metrics become a score."
      />

      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-border/70 bg-brand-bg/40 px-6 py-12 text-center">
        <ShieldCheck className="h-8 w-8 text-brand-muted-fg/60" />
        <p className="text-sm font-semibold text-brand-fg">
          Documentation coming soon
        </p>
        <p className="max-w-md text-sm text-brand-muted-fg">
          We're still finalising how the quantitative engine turns metrics like
          RSI, MACD, beta, volatility, and the Sharpe ratio into a score. A full
          walkthrough will appear here.
        </p>
      </div>
    </div>
  );
}
