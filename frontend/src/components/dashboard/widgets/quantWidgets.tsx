import { Link } from "react-router-dom";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { HORIZON_SETTING, readHorizon } from "../../../dashboard/quantWidgetSettings";
import { useAssetDetails } from "../../../hooks/useAssetDetails";
import { useQuantHistory } from "../../../hooks/useQuantHistory";
import QuantMetricsPanel from "../../research/QuantMetricsPanel";
import { HorizonPicker, QuantTrendChart } from "../../research/QuantTrendChart";
import { PERCENTILE_CAPTION } from "../../../data/quantExplainers";
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
      {/* Relative to the other assets in THIS user's run. The caption travels
          with the numbers because a dashboard card is where a percentile is most
          easily read as an absolute score. */}
      <p className="text-[11px] text-brand-muted-fg">{PERCENTILE_CAPTION}</p>
      <QuantMetricsPanel recommendation={recommendation} />
    </div>
  );
}
