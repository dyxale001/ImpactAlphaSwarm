import { Link } from "react-router-dom";
import { ArrowRight, Flame, Sparkles, MessageCircleQuestion } from "lucide-react";
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
import { useAskChatbotStore } from "../../store/askChatbotStore";
import DualBar from "./DualBar";
import AddToWatchlistButton from "./Addtowatchlistbutton";
import { ListingLine } from "../research/ListingLine";

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
  const openAskChatbot = useAskChatbotStore(s => s.openWithPrompt);

  return (
    <div
      className={`soft-card p-6 space-y-4 hover:border-forest-900/26 hover:shadow-[0_10px_28px_rgba(17,35,32,0.08)] transition-all flex flex-col ${sizeClass}`}
      style={{ animation: `slide-up ${0.4 + delay * 0.08}s ease-out forwards` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Solid forest with the ticker knocked out in the page background,
              matching the universe tiles on Whale Watching. The tinted version
              read as grey. */}
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center text-xs font-bold tabular-nums text-brand-bg">
              {asset.ticker.slice(0, 3)}
            </div>
            {/* Discovered used to sit in the badge row below DualBar, where its
                presence added a line only some cards had, so the reasoning trace box
                landed at a different height per card in the same row (see CSCO vs
                RTX). Anchored on the avatar instead: out of document flow, so it can
                never move anything below it, on this card or any other. */}
            {asset.isDiscovered ? (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-accent ring-2 ring-white flex items-center justify-center"
                title={discoveryProvenance(asset.discoverySources)}
              >
                <Sparkles className="w-2.5 h-2.5 text-brand-fg" />
              </span>
            ) : null}
          </div>

          <div className="min-w-0">
            <p className="text-base font-semibold truncate text-primary">
              {asset.ticker}
            </p>
            <p className="text-xs text-primary truncate">
              {asset.name}
            </p>
            <p className="text-base tabular-nums text-primary">
              R {asset.currentPrice.toFixed(2)}
            </p>
          </div>
        </div>
        {/* The same pale green as the "Why it ranks here" panel below, so the
            rank reads as part of the card rather than a second accent. */}
        <div className="chip">
          Rank {asset.rank}
        </div>
      </div>

      {/* Universe and exchange, as on the asset page. Every card has a universe, so
          this line is on all of them and the cards in a row keep their alignment. */}
      <ListingLine universe={asset.universe} exchange={asset.exchange} />

      <div className="flex items-end justify-between gap-3">
        {showScorecard && asset.convergenceState ? (
          // The disclosed replacement for the score: a STATE, not a grade. No
          // number, because a number is what invited "how good a buy is this".
          <div className="relative group" tabIndex={0}>
            <span
              className={`chip ${CONVERGENCE_TONE[asset.convergenceState]} font-semibold`}
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
            <p className="text-xs text-primary font-semibold">
              Confidence Score
            </p>
            <p className="text-xl font-bold tabular-nums leading-tight text-brand-fg">
              {asset.confidenceScore}
            </p>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 translate-x-0 mt-2 w-64 max-w-[calc(100vw-2rem)] z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                A unified measure of the AI's conviction in this stock. It blends
                quantitative data with market sentiment, specifically applying
                penalties to risky stocks where social hype outpaces actual
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
        {asset.isHype ? (
          <span className="chip bg-caution-bg text-caution">
            <Flame className="w-3 h-3" /> Hype flagged
          </span>
        ) : null}
      </div>

      <div className="as-inset p-4">
        <p className="text-sm text-forest-900 mb-2 font-bold flex items-center gap-2">
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800"><Sparkles className="w-3.5 h-3.5" /></span>
          Why it ranks here
        </p>
        <p className="text-xs text-forest-900 leading-relaxed">
          {asset.reasoning ||
            (asset.convergenceState
              ? CONVERGENCE_DETAIL[asset.convergenceState]
              : "No reasoning trace available for this run.")}
        </p>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <Link
          to={`/asset/${asset.ticker}`}
          className="text-sm text-forest-700 hover:underline flex items-center gap-1 font-bold whitespace-nowrap"
        >
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
        <div className="flex items-center gap-1.5">
          {/* Reuses the exact accessible tooltip pattern already used above
              (group + tabIndex + group-focus-within) — keyboard-reachable,
              not hover-only, and the accessible name alone ("Ask AlphaSwarm
              about {ticker}") already conveys the meaning without the
              tooltip, so this works on touch devices too. */}
          <div className="relative group">
            <button
              type="button"
              onClick={(e) => {
                // Defensive: this card sits in a grid of otherwise-plain
                // divs (no wrapping <Link>), but stop propagation anyway so
                // a future ancestor click handler can never swallow this or
                // trigger unrelated navigation.
                e.stopPropagation();
                openAskChatbot(`Tell me about ${asset.ticker}`);
              }}
              aria-label={`Ask AlphaSwarm about ${asset.ticker}`}
              className="w-7 h-7 rounded-full flex items-center justify-center text-brand-muted-fg hover:text-brand-primary hover:bg-brand-primary/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              <MessageCircleQuestion className="w-4 h-4" />
            </button>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute right-0 translate-x-0 mt-2 w-max max-w-[calc(100vw-2rem)] z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border whitespace-nowrap">
                Ask AlphaSwarm about this
              </div>
            </div>
          </div>
          <AddToWatchlistButton ticker={asset.ticker} />
        </div>
      </div>
    </div>
  );
}