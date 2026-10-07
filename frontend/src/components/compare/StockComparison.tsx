import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MessageCircleQuestion } from "lucide-react";
import { useQuantHistory } from "../../hooks/useQuantHistory";
import { useSentimentHistory } from "../../hooks/useSentimentHistory";
import { useCompareStocks, type CompareAsset } from "../../hooks/useCompareStocks";
import { useAskChatbotStore } from "../../store/askChatbotStore";
import { SCORECARD_ENABLED } from "../../hooks/useDashboardStats";
import {
  BETA_BANDS,
  QUANT_HORIZON_LABELS,
  SUB_DIMENSIONS,
  percentileReading,
  type BetaBand,
  type QuantHorizon,
  type SubDimensionKey,
} from "../../data/quantExplainers";
import { CONVERGENCE_HEADLINE, CONVERGENCE_TONE, type ConvergenceState } from "../../data/signalCopy";
import {
  ALIKE,
  ASK_ABOUT_THIS,
  DIFFERS_MOST,
  OWN_TRACE,
  ROW_LABELS,
  ROW_MEANING,
  RSI_DAYS_LABEL,
  RSI_DAYS_MEANING,
  SAME,
  SECTION_OVERVIEW,
  SECTION_TONE,
  SECTION_WINDOW,
  SECTION_YOURS,
  SECTION_YOURS_NOTE,
  STOCKS_DISCLAIMER,
  TONE_BUILDING,
  TONE_MEANING,
  TONE_ROW_NEWS,
  TONE_ROW_SOCIAL,
  WHY_BADGE,
  WHY_TITLE,
  YOURS_BETA,
  YOURS_CONFIDENCE,
  YOURS_NO_RUN,
  YOURS_NOT_IN_RUN,
  YOURS_NOT_IN_RUN_BODY,
  YOURS_PLACE,
  YOURS_SHARPE,
  YOURS_SIGNALS,
  askPrompt,
} from "../../data/compareCopy";
import { sentimentVerdict } from "../research/sentimentDisplay";
import {
  formatChange,
  formatDrawdown,
  formatNumber,
  formatPrice,
} from "../research/quantSeries";
import {
  differsMost,
  explainPlacement,
  isAlike,
  ordinal,
  weekTone,
  type MeasuredRow,
  type RunReading,
} from "../../utils/compareStocks";
import { CompareGrid, CompareRow, CompareSection, Missing, RowTag, Value, type CompareColumn } from "./CompareGrid";
import CompareChart from "./CompareChart";
import ComparisonTracePanel from "./ComparisonTracePanel";

// The stock side of the Compare page, top to bottom: what happened (the chart),
// what separates them (the written comparison), every shared figure lined up with
// what each gap means, and then, kept apart and labelled, the user's own analysis.
//
// Every figure comes from an endpoint the stock page already uses, through the
// same hooks, so a number here is the number on that stock's own page.
//
// The hooks are called once per column slot (three, fixed) rather than in a loop,
// which is what React's rules allow; an empty slot asks for nothing.

const SUB_KEYS: SubDimensionKey[] = ["momentum", "risk_adjusted_return", "stability"];

// The scorecard's own chip tones, with conflict's text moved to warning-strong:
// the design system's colour for warning text on the light warning tint. The
// shared tone puts warning-yellow text on a near-white card here, which is too
// faint to read in a table cell.
const CHIP_TONE: Record<ConvergenceState, string> = {
  ...CONVERGENCE_TONE,
  conflict: "bg-semantic-warning/15 text-warning-strong",
};

function rsiWord(rsi: number | null | undefined): string | null {
  if (rsi === null || rsi === undefined) return null;
  if (rsi >= 70) return "In the overbought range";
  if (rsi <= 30) return "In the oversold range";
  return "Between 30 and 70";
}

function sameText(values: Array<string | null | undefined>): boolean {
  return values.length >= 2 && values.every((v) => v && v === values[0]);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function StockComparison({
  tickers,
  horizon,
}: {
  tickers: string[];
  horizon: QuantHorizon;
}) {
  const [t0, t1, t2] = tickers;
  const q0 = useQuantHistory(t0, horizon, Boolean(t0));
  const q1 = useQuantHistory(t1, horizon, Boolean(t1));
  const q2 = useQuantHistory(t2, horizon, Boolean(t2));
  const s0 = useSentimentHistory(t0);
  const s1 = useSentimentHistory(t1);
  const s2 = useSentimentHistory(t2);
  const { assets, readings, runSize, hasRun, isLoading: runLoading } = useCompareStocks(tickers);
  const openAsk = useAskChatbotStore((s) => s.openWithPrompt);

  const windows = [q0, q1, q2].slice(0, tickers.length);
  const tones = [s0, s1, s2].slice(0, tickers.length);
  const facts = windows.map((w) => w.facts);
  const weeks = tones.map((t) => weekTone(t.points));
  const loadingWindows = windows.some((w) => w.isLoading);
  const windowsAvailable = windows.every((w) => w.available);

  const columns: CompareColumn[] = tickers.map((t) => ({
    id: t,
    title: t,
    subtitle: assets[t]?.name ?? null,
    href: `/asset/${encodeURIComponent(t)}`,
  }));

  const most = loadingWindows ? null : differsMost(facts);

  const measured = (row: MeasuredRow, render: (i: number) => ReactNode) => {
    const alike = !loadingWindows && isAlike(row, facts);
    return (
      <CompareRow
        key={row}
        label={ROW_LABELS[row]}
        emphasis={most === row}
        tag={
          most === row ? (
            <RowTag kind="differs">{DIFFERS_MOST}</RowTag>
          ) : alike ? (
            <RowTag kind="alike">{ALIKE}</RowTag>
          ) : undefined
        }
        values={tickers.map((_, i) => (windows[i].isLoading ? <Pending /> : render(i)))}
        note={ROW_MEANING[row]}
      />
    );
  };

  const universes = tickers.map((t) => assets[t]?.universe ?? null);
  const exchanges = windows.map((w) => w.exchangeName || null);
  const showNews = weeks.some((w) => w.hasNews);
  const newsLabels = weeks.map((w) => (w.newsScore === null ? null : sentimentVerdict(w.newsScore).label));
  const socialLabels = weeks.map((w) => (w.socialScore === null ? null : sentimentVerdict(w.socialScore).label));

  const reading = (t: string): RunReading | undefined => readings[t];
  const anyScorecard =
    SCORECARD_ENABLED && tickers.some((t) => reading(t)?.convergenceState);
  const why = explainPlacement(
    tickers.map((t) => readings[t]).filter((r): r is RunReading => Boolean(r)),
    runSize,
  );

  return (
    <div className="space-y-6">
      <CompareChart
        series={tickers.map((t, i) => ({ ticker: t, points: windows[i].points }))}
        horizon={horizon}
        isLoading={loadingWindows}
        available={windowsAvailable}
      />

      <ComparisonTracePanel
        tickers={tickers}
        horizon={horizon}
        action={
          <button
            type="button"
            onClick={() => openAsk(askPrompt(tickers))}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-border/60 bg-brand-card px-3 py-1.5 text-xs font-semibold text-brand-fg transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            <MessageCircleQuestion className="h-4 w-4 text-brand-primary" />
            {ASK_ABOUT_THIS}
          </button>
        }
      />

      <CompareGrid columns={columns}>
        <CompareSection title={SECTION_OVERVIEW} />
        <CompareRow
          label="Sector"
          tag={sameText(universes) ? <RowTag kind="alike">{SAME}</RowTag> : undefined}
          values={universes.map((u) => u ?? <Missing />)}
        />
        <CompareRow
          label="Exchange"
          tag={sameText(exchanges) ? <RowTag kind="alike">{SAME}</RowTag> : undefined}
          values={windows.map((w) => (w.isLoading ? <Pending /> : w.exchangeName || <Missing />))}
        />
        <CompareRow
          label="Price"
          values={tickers.map((t) => <PriceCell key={t} asset={assets[t]} loading={runLoading} />)}
          note="The latest stored price in rand. A higher share price is not a bigger or more valuable company, which is why the chart above starts every stock at 100."
        />

        {windowsAvailable && (
          <>
            <CompareSection title={`${SECTION_WINDOW} ${QUANT_HORIZON_LABELS[horizon]}`} />
            {measured("change", (i) => (facts[i] ? formatChange(facts[i]!.change_pct) : <Missing />))}
            {measured("drawdown", (i) => (facts[i] ? formatDrawdown(facts[i]!.max_drawdown_pct) : <Missing />))}
            {measured("volatility", (i) =>
              facts[i]?.volatility_pct != null ? `${formatNumber(facts[i]!.volatility_pct!, 1)}%` : <Missing />,
            )}
            {measured("rsi", (i) =>
              facts[i]?.latest_rsi != null ? (
                <Value main={formatNumber(facts[i]!.latest_rsi!, 0)} sub={rsiWord(facts[i]!.latest_rsi)} />
              ) : (
                <Missing />
              ),
            )}
            <CompareRow
              label={RSI_DAYS_LABEL}
              values={tickers.map((_, i) =>
                windows[i].isLoading ? (
                  <Pending />
                ) : facts[i] && facts[i]!.rsi_days_measured ? (
                  <Value
                    main={`${facts[i]!.days_rsi_overbought} / ${facts[i]!.days_rsi_oversold}`}
                    sub={`of ${facts[i]!.rsi_days_measured} days measured`}
                  />
                ) : (
                  <Missing />
                ),
              )}
              note={RSI_DAYS_MEANING}
            />
          </>
        )}

        <CompareSection title={SECTION_TONE} />
        {showNews && (
          <CompareRow
            label={TONE_ROW_NEWS}
            tag={sameText(newsLabels) ? <RowTag kind="alike">{ALIKE}</RowTag> : undefined}
            values={tickers.map((_, i) =>
              tones[i].isLoading ? (
                <Pending />
              ) : newsLabels[i] ? (
                <Value main={newsLabels[i]} sub={`${weeks[i].articles} article${weeks[i].articles === 1 ? "" : "s"}`} />
              ) : (
                <Missing>{tones[i].isSeeding ? TONE_BUILDING : "No articles"}</Missing>
              ),
            )}
          />
        )}
        <CompareRow
          label={TONE_ROW_SOCIAL}
          tag={sameText(socialLabels) ? <RowTag kind="alike">{ALIKE}</RowTag> : undefined}
          values={tickers.map((_, i) =>
            tones[i].isLoading ? (
              <Pending />
            ) : socialLabels[i] ? (
              <Value main={socialLabels[i]} sub={`${formatNumber(weeks[i].posts, 0)} posts`} />
            ) : (
              <Missing>{tones[i].isSeeding ? TONE_BUILDING : "No posts"}</Missing>
            ),
          )}
          note={TONE_MEANING}
        />
      </CompareGrid>

      {/* ── Your analysis: kept apart, because it is about the user's run ── */}
      <section className="space-y-3" aria-labelledby="compare-yours">
        <div>
          <h2 id="compare-yours" className="text-sm font-bold text-brand-primary">
            {SECTION_YOURS}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-brand-muted-fg">{SECTION_YOURS_NOTE}</p>
        </div>

        {runLoading && !Object.keys(readings).length ? (
          <div className="soft-card h-40 animate-pulse" />
        ) : !hasRun ? (
          <p className="soft-card p-4 text-sm text-brand-muted-fg">{YOURS_NO_RUN}</p>
        ) : (
          <>
            <CompareGrid columns={columns}>
              <CompareRow
                label={YOURS_PLACE}
                values={tickers.map((t) => {
                  const r = reading(t);
                  return r?.rank != null ? (
                    <Value main={ordinal(r.rank)} sub={runSize ? `of ${runSize} in your run` : undefined} />
                  ) : (
                    <span className="inline-flex rounded-md bg-brand-bg px-2 py-0.5 text-[11px] font-semibold text-brand-muted-fg" title={YOURS_NOT_IN_RUN_BODY}>
                      {YOURS_NOT_IN_RUN}
                    </span>
                  );
                })}
                note={tickers.some((t) => !reading(t)) ? YOURS_NOT_IN_RUN_BODY : undefined}
              />
              {anyScorecard ? (
                <CompareRow
                  label={YOURS_SIGNALS}
                  values={tickers.map((t) => {
                    const state = reading(t)?.convergenceState;
                    return state ? (
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${CHIP_TONE[state]}`}>
                        {CONVERGENCE_HEADLINE[state]}
                      </span>
                    ) : (
                      <Missing />
                    );
                  })}
                />
              ) : (
                <CompareRow
                  label={YOURS_CONFIDENCE}
                  values={tickers.map((t) => {
                    const score = reading(t)?.confidenceScore;
                    return score != null ? `${Math.round(score)} / 100` : <Missing />;
                  })}
                />
              )}
              {SUB_KEYS.map((key) => {
                const pick = (r: RunReading | undefined) =>
                  key === "momentum" ? r?.momentumPctile : key === "risk_adjusted_return" ? r?.riskAdjPctile : r?.stabilityPctile;
                if (!tickers.some((t) => pick(reading(t)) != null)) return null;
                return (
                  <CompareRow
                    key={key}
                    label={`${SUB_DIMENSIONS[key].label} vs the run`}
                    values={tickers.map((t) => {
                      const p = pick(reading(t));
                      return p != null ? (
                        <span className="text-xs font-semibold leading-snug">{capitalise(percentileReading(key, p))}</span>
                      ) : (
                        <Missing />
                      );
                    })}
                  />
                );
              })}
              <CompareRow
                label={YOURS_BETA}
                values={tickers.map((t) => {
                  const r = reading(t);
                  if (r?.beta == null) return <Missing />;
                  const band = r.betaBand as BetaBand | null;
                  return (
                    <Value
                      main={formatNumber(r.beta, 2)}
                      sub={band && BETA_BANDS[band] ? capitalise(BETA_BANDS[band].replace(/ \(.*\)$/, "")) : undefined}
                    />
                  );
                })}
              />
              <CompareRow
                label={YOURS_SHARPE}
                values={tickers.map((t) => {
                  const r = reading(t);
                  return r?.sharpe != null ? formatNumber(r.sharpe, 2) : <Missing />;
                })}
              />
            </CompareGrid>

            {why && (
              <div className="soft-card space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-brand-fg">{WHY_TITLE}</h3>
                  <span className="inline-flex rounded-md bg-brand-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-muted-fg">
                    {WHY_BADGE}
                  </span>
                </div>
                <p className="max-w-3xl text-sm leading-relaxed text-brand-fg">{why.join(" ")}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {tickers
                .filter((t) => reading(t))
                .map((t) => (
                  <Link
                    key={t}
                    to={`/asset/${encodeURIComponent(t)}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
                  >
                    <span>
                      <span className="font-mono">{t}</span>
                      {`'s ${OWN_TRACE}`}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
            </div>
          </>
        )}
      </section>

      <p className="max-w-3xl text-[11px] leading-relaxed text-brand-muted-fg">{STOCKS_DISCLAIMER}</p>
    </div>
  );
}

function PriceCell({ asset, loading }: { asset: CompareAsset | undefined; loading: boolean }) {
  if (!asset) return loading ? <Pending /> : <Missing />;
  return asset.currentPrice != null ? <>{formatPrice(asset.currentPrice, "ZAR")}</> : <Missing />;
}

function Pending() {
  return <span className="inline-block h-4 w-16 animate-pulse rounded bg-brand-muted/15" aria-label="Loading" />;
}
