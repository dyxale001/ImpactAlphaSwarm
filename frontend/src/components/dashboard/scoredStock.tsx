import { Flame, Sparkles } from "lucide-react";
import type { AssetRecommendation } from "../../hooks/useDashboardStats";
import { CONVERGENCE_HEADLINE } from "../../data/signalCopy";
import { discoveryProvenance } from "../../utils/discovery";
import { sectorColour } from "../../utils/sectorColours";
import { sentimentVerdict } from "../research/sentimentDisplay";

// How a scored stock reads in a list, on the Stocks page and on the dashboard:
// its sector line, its readings and its one agreement chip.

/** 84 -> "84th", 1 -> "1st", 12 -> "12th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

// The quant percentile and sentiment verdict for one scored stock, shared by the
// Stocks table, its phone list and the dashboard so they cannot drift apart.
export function scoredReadings(asset: AssetRecommendation) {
  // quant_lean is the mean peer percentile mapped to [-1,+1].
  const percentile =
    asset.quantLean !== null
      ? Math.round(((asset.quantLean + 1) / 2) * 100)
      : null;
  const verdict = sentimentVerdict(asset.sentimentScore);
  const verdictTone =
    verdict.tone === "positive"
      ? "chip-up"
      : verdict.tone === "negative"
        ? "chip-down"
        : "";
  return { percentile, verdict, verdictTone };
}

export function ScoredSignals({ asset }: { asset: AssetRecommendation }) {
  return (
    <>
      {asset.isHype ? (
        <span className="chip chip-caution">
          <Flame className="h-3 w-3" /> Hype flagged
        </span>
      ) : asset.convergenceState ? (
        <span
          className={`chip ${
            asset.convergenceState === "agree_strongly"
              ? "chip-up"
              : asset.convergenceState === "conflict"
                ? "chip-caution"
                : ""
          }`}
        >
          {CONVERGENCE_HEADLINE[asset.convergenceState]}
        </span>
      ) : null}
      {asset.isDiscovered ? (
        <span
          className="chip chip-accent"
          title={discoveryProvenance(asset.discoverySources)}
        >
          <Sparkles className="h-3 w-3" /> Discovered
        </span>
      ) : null}
    </>
  );
}

export function UniverseLine({ asset }: { asset: AssetRecommendation }) {
  if (!asset.universe) return null;
  return (
    <span className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs text-brand-muted-fg">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${sectorColour(asset.universe).fill}`}
      />
      {asset.universe}
      {asset.exchange ? ` · ${asset.exchange}` : ""}
    </span>
  );
}
