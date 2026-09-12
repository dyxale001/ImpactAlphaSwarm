import { Link } from "react-router-dom";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { HORIZON_SETTING, readHorizon } from "../../../dashboard/quantWidgetSettings";
import { useAssetDetails } from "../../../hooks/useAssetDetails";
import { useQuantHistory } from "../../../hooks/useQuantHistory";
import { PercentileTrack, ordinal } from "../../research/QuantMetricsPanel";
import { HorizonPicker, QuantTrendChart } from "../../research/QuantTrendChart";
import {
  BETA_BANDS,
  BETA_BAND_MEANING,
  INSUFFICIENT_UNIVERSE_NOTE,
  NO_DATA_NOTE,
  PERCENTILE_CAPTION,
  RSI_BANDS,
  RSI_BAND_MEANING,
  SUB_DIMENSIONS,
  SUB_DIMENSION_ORDER,
  type BetaBand,
  type RsiBand,
  type SubDimensionKey,
} from "../../../data/quantExplainers";
import { WidgetEmpty, WidgetLoading, PinPrompt, PinnedHeader } from "./widgetChrome";

// Quant widgets: the asset page's Quant tab, one card at a time, each scoped to
// the asset chosen for that widget alone. They follow the sentiment widgets
// beside them, and differ from each other in one way that matters.
//
// The price window reads a public endpoint that knows nothing about any run, so
// a chosen asset keeps working after the next run drops it. The quant reading is
// the run's own measurement: percentiles against the OTHER assets in this user's
// latest run, so it can only exist for an asset that run scored, and its empty
// state has to say so rather than look like a fetch that failed.

function FullAnalysisLink({ ticker }: { ticker: string }) {
  return (
    <Link
      to={`/asset/${ticker}`}
      className="text-xs font-semibold text-brand-primary hover:underline"
    >
      Full analysis →
    </Link>
  );
}

/** Closes and RSI over a horizon of the reader's choosing, in rand. */
export function QuantWindowWidget({
  ticker,
  setTicker,
  settings,
  updateSettings,
}: WidgetProps) {
  const horizon = readHorizon(settings);
  const window = useQuantHistory(ticker ?? undefined, horizon, ticker !== null);

  if (!ticker) {
    return <PinPrompt what="the price window" setTicker={setTicker} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <div className="flex flex-wrap items-center gap-3">
          {/* The horizon is this widget's own, stored beside its ticker, so two
              windows on the same asset can show a month and five years. */}
          <HorizonPicker
            value={horizon}
            onChange={(next) => updateSettings({ [HORIZON_SETTING]: next })}
          />
          <FullAnalysisLink ticker={ticker} />
        </div>
      </div>
      <QuantTrendChart
        points={window.points}
        facts={window.facts}
        currency={window.currency}
        displayCurrency={window.displayCurrency}
        fxRate={window.fxRate}
        converted={window.converted}
        exchangeName={window.exchangeName}
        horizon={horizon}
        available={window.available}
        isLoading={window.isLoading}
        error={window.error}
      />
    </div>
  );
}

/** The latest run's quant reading for one asset: the three percentiles with their
 *  plain-language direction, and the RSI and beta bands. */
export function QuantReadingWidget({ ticker, setTicker }: WidgetProps) {
  const { recommendation, isLoading, latestRunCreatedAt } = useAssetDetails(
    ticker ?? undefined,
  );

  if (!ticker) {
    return <PinPrompt what="the quant reading" setTicker={setTicker} />;
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <PinnedHeader ticker={ticker} setTicker={setTicker} />
      <FullAnalysisLink ticker={ticker} />
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {header}
        <WidgetLoading rows={3} />
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className="flex h-full flex-col gap-3">
        {header}
        <WidgetEmpty
          grow
          message={
            latestRunCreatedAt
              ? `${ticker} was not scored in your latest run, so there is no reading to show. It will appear here once a run includes it.`
              : "Run an analysis first: the quant reading comes from your latest run."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      <QuantReadingCompact recommendation={recommendation} />
    </div>
  );
}

function formatMetric(value: unknown, digits: number) {
  return typeof value === "number" ? value.toFixed(digits) : "—";
}

/**
 * The Quant tab's measurements panel cut down to what a card can hold: each
 * sub-dimension as its name, its percentile and the position track, then the
 * two context readings as chips with their one-line meaning. The subtitles,
 * the per-row explainers and the raw-metrics grid stay on the asset page, one
 * click away through the header link.
 *
 * What is kept is not arbitrary. The track is what stops a percentile reading
 * as a score, and the band meanings are D-122's plain-language explanation of
 * RSI and beta, which a beginner needs wherever the numbers appear.
 */
function QuantReadingCompact({
  recommendation,
}: {
  recommendation: Record<string, unknown>;
}) {
  const normalisation = recommendation.quant_normalisation ?? null;
  const percentiles: Record<SubDimensionKey, number | null> = {
    momentum: numberOrNull(recommendation.momentum_pctile),
    risk_adjusted_return: numberOrNull(recommendation.risk_adj_pctile),
    stability: numberOrNull(recommendation.stability_pctile),
  };
  const rsiBand = (recommendation.rsi_band ?? null) as RsiBand | null;
  const betaBand = (recommendation.beta_band ?? null) as BetaBand | null;
  const hasPercentiles = SUB_DIMENSION_ORDER.some((k) => percentiles[k] !== null);
  const hasBands = rsiBand !== null || betaBand !== null;

  if (normalisation === "no_data") {
    return <WidgetEmpty grow message={NO_DATA_NOTE} />;
  }
  if (!hasPercentiles && !hasBands) {
    return (
      <WidgetEmpty
        grow
        message={
          normalisation === "insufficient_universe"
            ? INSUFFICIENT_UNIVERSE_NOTE
            : "This run recorded no quant reading for the asset."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {hasPercentiles ? (
        <div className="space-y-3">
          {SUB_DIMENSION_ORDER.map((key) => {
            const pctile = percentiles[key];
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                    {SUB_DIMENSIONS[key].label}
                  </span>
                  <span className="whitespace-nowrap font-mono text-sm font-semibold text-brand-fg">
                    {pctile !== null ? `${ordinal(Math.round(pctile))} percentile` : "—"}
                  </span>
                </div>
                {pctile !== null && <PercentileTrack pctile={pctile} />}
              </div>
            );
          })}
          {/* Relative to the other assets in THIS user's run. Said under the
              tracks because a dashboard card is where a percentile is most
              easily read as an absolute score. */}
          <p className="text-[11px] text-brand-muted-fg">{PERCENTILE_CAPTION}</p>
        </div>
      ) : (
        normalisation === "insufficient_universe" && (
          <p className="text-xs text-brand-muted-fg">{INSUFFICIENT_UNIVERSE_NOTE}</p>
        )
      )}

      {hasBands && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
            Context readings
          </span>
          <div className="flex flex-wrap gap-2">
            {rsiBand && (
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-border/60 bg-brand-bg/55 px-3 py-1 text-xs">
                <span className="font-mono font-semibold text-brand-fg">
                  RSI {formatMetric(recommendation.rsi, 0)}
                </span>
                {/* Neutral slate on purpose: colouring "oversold" green would
                    re-encode the buy signal the bands replace. */}
                <span className="font-medium text-slate-600">{RSI_BANDS[rsiBand]}</span>
              </span>
            )}
            {betaBand && (
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-border/60 bg-brand-bg/55 px-3 py-1 text-xs">
                <span className="font-mono font-semibold text-brand-fg">
                  Beta {formatMetric(recommendation.beta, 2)}
                </span>
                <span className="font-medium text-slate-600">{BETA_BANDS[betaBand]}</span>
              </span>
            )}
          </div>
          <div className="space-y-1 text-[11px] text-brand-fg/80">
            {rsiBand && (
              <p>
                <span className="font-medium text-brand-fg">RSI:</span> {RSI_BAND_MEANING[rsiBand]}
              </p>
            )}
            {betaBand && (
              <p>
                <span className="font-medium text-brand-fg">Beta:</span> {BETA_BAND_MEANING[betaBand]}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
