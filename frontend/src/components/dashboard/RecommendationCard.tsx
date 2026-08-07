import { Link } from "react-router-dom";
import { ArrowRight, Flame, Sparkles, BrainCircuit } from "lucide-react";
import {
  type AssetRecommendation,
  SCORECARD_ENABLED,
} from "../../hooks/useDashboardStats";
import { discoveryProvenance } from "../../utils/discovery";
import {
  CONVERGENCE_HEADLINE,
  CONVERGENCE_TONE,
  CONVERGENCE_DETAIL,
} from "../../data/signalCopy";
import DualBar from "./DualBar";
import AddToWatchlistButton from "./Addtowatchlistbutton";

// The four preview tabs (Overview / Vibe / Numbers / Hype) were removed. Three of
// them restated numbers already on the card — the sentiment score, the quant
// position — as prose, and the fourth described the hype penalty that convergence
// replaced. That left the reasoning trace, the one thing the card could say that
// nothing else on it says, hidden behind a tab nobody needed to click.
//
// Also removed with them: an unused MiniSparkline that drew a sine wave from the
// ticker's hash — decorative fake price data on a transparency-focused product.

export default function RecommendationCard({
  asset,
  sizeClass,
  delay,
}: {
  asset: AssetRecommendation;
  sizeClass: string;
  delay: number;
}) {
  const showScorecard = SCORECARD_ENABLED && asset.hasSignalTerms;
  // quant_lean is the mean peer percentile mapped to [-1,+1], so invert it back to
  // a 0-100 position for the marker. Null on legacy rows -> DualBar keeps its bar.
  const quantPercentile =
    asset.quantLean !== null ? ((asset.quantLean + 1) / 2) * 100 : null;

  return (
    <div
      className={`soft-card p-5 space-y-4 hover:border-brand-primary/40 transition-all flex flex-col ${sizeClass}`}
      style={{ animation: `slide-up ${0.4 + delay * 0.08}s ease-out forwards` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-brand-bg/70 border border-brand-border/60 flex items-center justify-center text-[10px] font-bold font-mono">
            {asset.ticker.slice(0, 3)}
          </div>

          <div className="min-w-0">
            <p className="text-base font-semibold truncate text-primary">
              {asset.ticker}
            </p>
            <p className="text-[12px] text-primary truncate">
              {asset.name}
            </p>
            <p className="text-base font-mono text-primary">
              R {asset.currentPrice.toFixed(2)}
            </p>
          </div>
        </div>
        <div
          className={`chip ${asset.rank === 1 ? "bg-brand-primary/15 text-brand-primary" : "bg-primary/15 text-primary"}`}
        >
          Rank {asset.rank}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        {showScorecard && asset.convergenceState ? (
          // The disclosed replacement for the score: a STATE, not a grade. No
          // number, because a number is what invited "how good a buy is this".
          <div className="relative group" tabIndex={0}>
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">
              Signals
            </p>
            <span
              className={`chip ${CONVERGENCE_TONE[asset.convergenceState]} font-semibold mt-1`}
            >
              {CONVERGENCE_HEADLINE[asset.convergenceState]}
            </span>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 translate-x-0 mt-2 w-64 max-w-[calc(100vw-2rem)] z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                {CONVERGENCE_DETAIL[asset.convergenceState]}
              </div>
            </div>
          </div>
        ) : (
          <div className="relative group" tabIndex={0}>
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">
              Confidence Score
            </p>
            <p className="text-xl font-bold font-mono leading-tight text-brand-fg">
              {asset.confidenceScore}
            </p>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 translate-x-0 mt-2 w-64 max-w-[calc(100vw-2rem)] z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                A unified measure of the AI's conviction in this asset. It blends
                quantitative data with market sentiment, specifically applying
                penalties to risky assets where social hype outpaces actual
                financial strength.
              </div>
            </div>
          </div>
        )}
      </div>

      <DualBar
        sentimentScore={asset.sentimentScore}
        quantitativeScore={asset.fundamentalsScore}
        quantPercentile={quantPercentile}
      />

      <div className="flex flex-wrap gap-2">
        {asset.isDiscovered ? (
          <span
            className="chip bg-brand-accent text-brand-fg"
            title={discoveryProvenance(asset.discoverySources)}
          >
            <Sparkles className="w-2.5 h-2.5" /> Discovered
          </span>
        ) : null}
        {asset.isHype ? (
          <span className="chip bg-semantic-warning/15 text-semantic-warning">
            <Flame className="w-3 h-3" /> Hype flagged
          </span>
        ) : null}
      </div>

      <div className="bg-brand-bg/50 rounded-2xl p-3 border border-brand-border/50">
        <p className="text-[10px] text-brand-muted-fg uppercase tracking-widest mb-1 font-semibold flex items-center gap-1.5">
          <BrainCircuit className="w-3 h-3 text-brand-primary" />
          Why it ranks here
        </p>
        <p className="text-xs text-brand-fg/85 leading-relaxed">
          {asset.reasoning ||
            (asset.convergenceState
              ? CONVERGENCE_DETAIL[asset.convergenceState]
              : "No reasoning trace available for this run.")}
        </p>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <Link
          to={`/asset/${asset.ticker}`}
          className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold"
        >
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
        <AddToWatchlistButton ticker={asset.ticker} />
      </div>
    </div>
  );
}