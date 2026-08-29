import { Link } from "react-router-dom";
import { ArrowRight, Flame, Sparkles } from "lucide-react";
import type { AssetRecommendation } from "../../hooks/useDashboardStats";
import { discoveryProvenance } from "../../utils/discovery";
import { CONVERGENCE_DETAIL } from "../../data/signalCopy";
import DualBar from "./DualBar";
import AddToWatchlistButton from "./Addtowatchlistbutton";

/**
 * One asset the run scored but did not shortlist.
 *
 * A row rather than a RecommendationCard, because there are about twenty five of
 * these against the top five's cards, and giving them the same weight would say
 * they carry the same standing. What they do NOT get is a lighter treatment of
 * the numbers: DualBar is reused whole, tooltips included, so the disclosure that
 * the quant half is a position among peers and not a quality score reads the same
 * here as it does on a card. That distinction is the point of the component.
 *
 * The reasoning shown is the deterministic trace the backend writes for every
 * ranked asset. Only the top five get LLM-written prose, which is why this feed
 * costs nothing extra to display.
 */
export default function ScoredAssetRow({
  asset,
}: {
  asset: AssetRecommendation;
}) {
  // quant_lean is the mean peer percentile mapped to [-1,+1], so invert it back
  // to a 0-100 position for the marker. Null on legacy rows -> DualBar keeps its bar.
  const quantPercentile =
    asset.quantLean !== null ? ((asset.quantLean + 1) / 2) * 100 : null;

  const reasoning =
    asset.reasoning ||
    (asset.convergenceState ? CONVERGENCE_DETAIL[asset.convergenceState] : "");

  return (
    <li className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 hover:bg-brand-bg/40 transition-colors">
      <div className="md:col-span-4 flex items-start gap-3 min-w-0">
        <span className="chip bg-primary/10 text-primary font-mono shrink-0 mt-0.5">
          {asset.rank}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary truncate">
            {asset.ticker}
          </p>
          <p className="text-xs text-brand-muted-fg truncate">{asset.name}</p>
          <p className="text-sm font-mono text-primary mt-1">
            R {asset.currentPrice.toFixed(2)}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
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
        </div>
      </div>

      <div className="md:col-span-4">
        <DualBar
          sentimentScore={asset.sentimentScore}
          quantitativeScore={asset.fundamentalsScore}
          quantPercentile={quantPercentile}
        />
      </div>

      <div className="md:col-span-4 flex flex-col justify-between gap-2 min-w-0">
        {reasoning ? (
          <p className="text-xs text-brand-muted-fg leading-relaxed line-clamp-3">
            {reasoning}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3 mt-auto">
          <Link
            to={`/asset/${asset.ticker}`}
            className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold shrink-0"
          >
            Full analysis <ArrowRight className="w-3 h-3" />
          </Link>
          <AddToWatchlistButton ticker={asset.ticker} />
        </div>
      </div>
    </li>
  );
}
