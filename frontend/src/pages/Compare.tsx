import { useEffect, useMemo, type ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, CandlestickChart, Columns2 } from "lucide-react";
import CompareMotif from "../components/compare/CompareMotif";
import ComparePicks, { type Pick } from "../components/compare/ComparePicks";
import StockComparison from "../components/compare/StockComparison";
import FundComparison, { fundColumn } from "../components/compare/FundComparison";
import FundSearch from "../components/compare/FundSearch";
import CompanySearch from "../components/research/CompanySearch";
import { useUniverseAssets } from "../hooks/useUniverseAssets";
import { useWatchedTickers } from "../hooks/useCompareStocks";
import { useCompareFunds } from "../hooks/useCompareFunds";
import { useFundCatalogue } from "../hooks/useFundCatalogue";
import { FUNDS_ENABLED } from "../utils/fundsFlags";
import { rememberHubPage } from "../utils/lastHubPage";
import {
  MAX_COMPARE,
  buildCompareParams,
  parseCompareParams,
  type CompareKind,
  type CompareState,
} from "../utils/compareUrl";
import {
  QUANT_HORIZONS,
  type QuantHorizon,
} from "../data/quantExplainers";
import {
  COMPARE_EYEBROW,
  COMPARE_LEAD,
  COMPARE_TITLE,
  FROM_WATCHLIST,
  KIND_LABELS,
  PICK_FUND_PLACEHOLDER,
  PICK_STOCK_PLACEHOLDER,
  START_BODY_FUNDS,
  START_BODY_STOCKS,
  START_ONE_MORE,
  START_TITLE_FUNDS,
  START_TITLE_STOCKS,
} from "../data/compareCopy";

/**
 * Compare (D-220): two or three stocks, or two or three funds, side by side.
 *
 * The sponsor's own description (22/09) was "just two dropdowns that sit next to
 * each other ... structured so that you can see a straight-line comparison", with
 * a "funds or equities slider". So the page is a toggle, a row of picks, and one
 * table whose columns are the picks in the order they were chosen.
 *
 * Every figure comes from an endpoint the stock and fund pages already use; the
 * only thing new behind it is the written comparison for stocks. The whole state
 * lives in the URL (see utils/compareUrl.ts), so a comparison is a link: it can be
 * shared, the back button undoes a pick, and "Compare with…" on a stock or fund
 * page opens this page already filled.
 *
 * Laid out like the other hub pages (Whale Watching, Funds): the forest header
 * band with its own motif, then the pill tabs on the page ground, then content.
 *
 * Reached only when VITE_COMPARE_ENABLED is set. The funds half also needs
 * VITE_FUNDS_ENABLED, and is simply absent from the toggle without it.
 */
export default function ComparePage() {
  const [params, setParams] = useSearchParams();
  const state = parseCompareParams(params);
  const kind: CompareKind = FUNDS_ENABLED ? state.kind : "stocks";

  // Registered as a hub, so a stock page opened from a column's ticker says
  // "Back to Compare" and returns to this exact comparison.
  useEffect(() => rememberHubPage("/compare"), []);

  const update = (next: Partial<CompareState>) => {
    const merged = { ...state, kind, ...next };
    setParams(buildCompareParams(merged));
  };

  const setKind = (k: CompareKind) => {
    if (k !== kind) update({ kind: k, ids: [] });
  };
  const add = (id: string) => {
    if (state.ids.includes(id) || state.ids.length >= MAX_COMPARE) return;
    update({ ids: [...state.ids, id] });
  };
  const remove = (id: string) => update({ ids: state.ids.filter((x) => x !== id) });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-20 pt-6 animate-fade-in-up sm:px-6 lg:px-8 lg:pt-10">
      {/* ── Header ── */}
      <div className="hero-card overflow-hidden px-5 pb-12 pt-8 sm:px-7 sm:pb-14">
        <CompareMotif className="h-16 sm:h-full" />
        <div className="relative">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">
            {COMPARE_EYEBROW}
          </span>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl">
            <Columns2 className="h-7 w-7 shrink-0 text-brand-accent" />
            {COMPARE_TITLE}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">{COMPARE_LEAD}</p>
        </div>
      </div>

      {/* ── Controls: what kind, and over what window ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {FUNDS_ENABLED ? (
          <Tabs
            label="What to compare"
            value={kind}
            onChange={(v) => setKind(v as CompareKind)}
            options={[
              { id: "stocks", label: KIND_LABELS.stocks, Icon: CandlestickChart },
              { id: "funds", label: KIND_LABELS.funds, Icon: Building2 },
            ]}
          />
        ) : (
          <span />
        )}
        {kind === "stocks" && state.ids.length >= 2 && (
          <Tabs
            label="Price window"
            value={state.horizon}
            onChange={(v) => update({ horizon: v as QuantHorizon })}
            options={QUANT_HORIZONS.map((h) => ({ id: h, label: h }))}
          />
        )}
      </div>

      {kind === "stocks" ? (
        <StocksSide ids={state.ids} horizon={state.horizon} onAdd={add} onRemove={remove} />
      ) : (
        <FundsSide ids={state.ids} onAdd={add} onRemove={remove} />
      )}
    </div>
  );
}

function StocksSide({
  ids,
  horizon,
  onAdd,
  onRemove,
}: {
  ids: string[];
  horizon: QuantHorizon;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { all, isLoading } = useUniverseAssets();
  const watched = useWatchedTickers();
  const byTicker = useMemo(() => new Map(all.map((a) => [a.ticker, a])), [all]);
  const searchable = useMemo(() => all.filter((a) => !ids.includes(a.ticker)), [all, ids]);
  const suggestions = watched.filter((t) => !ids.includes(t) && byTicker.has(t)).slice(0, 5);

  const picks: Pick[] = ids.map((t) => ({ id: t, title: t, subtitle: byTicker.get(t)?.name ?? null }));

  return (
    <>
      <ComparePicks
        picks={picks}
        onRemove={onRemove}
        search={
          <CompanySearch
            assets={searchable}
            onSelect={(ticker) => onAdd(ticker)}
            disabled={isLoading}
            placeholder={PICK_STOCK_PLACEHOLDER}
          />
        }
      />
      {ids.length < 2 ? (
        <StartPanel
          title={ids.length === 1 ? START_ONE_MORE : START_TITLE_STOCKS}
          body={START_BODY_STOCKS}
          suggestions={suggestions}
          onPick={onAdd}
        />
      ) : (
        <StockComparison tickers={ids} horizon={horizon} />
      )}
    </>
  );
}

function FundsSide({
  ids,
  onAdd,
  onRemove,
}: {
  ids: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const catalogue = useFundCatalogue({});
  const { funds, missing, isLoading, error } = useCompareFunds(ids);
  const known = useMemo(() => new Map(catalogue.funds.map((f) => [f.fund_id, f])), [catalogue.funds]);

  const picks: Pick[] = ids.map((id) => {
    const f = funds[id] ?? known.get(id);
    return f ? { id, title: f.jse_code ?? f.name, subtitle: f.jse_code ? f.name : f.fund_house } : { id, title: "…" };
  });
  const loaded = ids.map((id) => funds[id]).filter(Boolean);

  return (
    <>
      <ComparePicks
        picks={picks}
        onRemove={onRemove}
        search={
          <FundSearch
            funds={catalogue.funds}
            exclude={ids}
            onSelect={onAdd}
            disabled={catalogue.isLoading}
            placeholder={PICK_FUND_PLACEHOLDER}
          />
        }
      />
      {missing.length > 0 && (
        <p className="text-xs text-brand-muted-fg">
          {missing.length === 1 ? "One fund in this link is" : `${missing.length} funds in this link are`} no longer in
          the catalogue and {missing.length === 1 ? "was" : "were"} left out.
        </p>
      )}
      {error && <p className="text-sm text-brand-muted-fg">{error}</p>}
      {ids.length < 2 ? (
        <StartPanel title={ids.length === 1 ? START_ONE_MORE : START_TITLE_FUNDS} body={START_BODY_FUNDS} />
      ) : isLoading && loaded.length < ids.length ? (
        <div className="soft-card h-72 animate-pulse" />
      ) : loaded.length >= 2 ? (
        <FundComparison funds={loaded} key={loaded.map((f) => fundColumn(f).id).join(",")} />
      ) : null}
    </>
  );
}

function StartPanel({
  title,
  body,
  suggestions = [],
  onPick,
}: {
  title: string;
  body: string;
  suggestions?: string[];
  onPick?: (id: string) => void;
}) {
  return (
    <div className="rounded-[var(--radius-brand)] border border-dashed border-brand-border bg-brand-card/70 p-6 sm:p-8">
      <h2 className="text-base font-semibold text-brand-fg">{title}</h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-brand-muted-fg">{body}</p>
      {suggestions.length > 0 && onPick && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-brand-muted-fg">
            {FROM_WATCHLIST}
          </span>
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="rounded-full border border-brand-border/60 bg-brand-card px-3 py-1 font-mono text-xs font-bold text-brand-fg transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The pill tabs every hub page uses (Whale Watching's sections, the stock page's
// tabs), so this toggle reads as the same control the reader already knows.
function Tabs({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: Array<{ id: string; label: string; Icon?: ComponentType<{ className?: string }> }>;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-1 rounded-full border border-brand-border/50 bg-brand-bg/60 p-1"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            value === o.id ? "bg-brand-primary text-brand-bg" : "text-brand-muted-fg hover:text-brand-fg"
          }`}
        >
          {o.Icon && <o.Icon className="h-3.5 w-3.5" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
