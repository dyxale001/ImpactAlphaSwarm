import { ArrowRight } from "lucide-react";
import { useInstitutionalData } from "../../hooks/useInstitutionalData";
import { useWhaleData } from "../../hooks/useWhaleData";
import { ordinal } from "./QuantMetricsPanel";
import { sentimentVerdict } from "./sentimentDisplay";
import { formatPct, isOpenMarket } from "./whaleFormat";

export type ReadingTab = "sentiment" | "quant" | "investors" | "insiders";

type Reading = {
  tab: ReadingTab;
  label: string;
  value: string;
  detail: string;
  detailTone?: string;
};

const VERDICT_TONE = {
  positive: "text-up",
  negative: "text-down",
  neutral: "text-brand-muted-fg",
} as const;

/**
 * One headline figure from each of the other tabs, each opening its tab. The
 * ownership and dealings figures share their tabs' cached requests, so opening
 * those tabs afterwards costs nothing more.
 */
export default function KeyReadings({
  ticker,
  sentimentScore,
  quantPercentile,
  onOpen,
}: {
  ticker: string;
  sentimentScore: number | null;
  /** Mean peer percentile (0-100); null on runs without the disclosed factors. */
  quantPercentile: number | null;
  onOpen: (tab: ReadingTab) => void;
}) {
  const owners = useInstitutionalData(ticker);
  const dealings = useWhaleData(ticker);

  const verdict = sentimentVerdict(sentimentScore);
  const marketTrades = dealings.transactions.filter((t) => isOpenMarket(t.transaction_code));
  const bought = marketTrades.filter((t) => t.type === "buy").length;
  const sold = marketTrades.length - bought;
  const count = dealings.transactions.length;

  const readings: Reading[] = [
    {
      tab: "sentiment",
      label: "Sentiment",
      value: sentimentScore == null ? "—" : `${Math.round(sentimentScore)} / 100`,
      detail: verdict.label,
      detailTone: VERDICT_TONE[verdict.tone],
    },
    {
      tab: "quant",
      label: "Quant vs peers",
      value: quantPercentile == null ? "—" : `${ordinal(Math.round(quantPercentile))} percentile`,
      detail: "Against the other stocks in this run",
    },
    {
      tab: "investors",
      label: "Big investors",
      value: owners.isLoading ? "…" : owners.data ? `${formatPct(owners.data.institutions_pct)} held` : "—",
      detail: owners.isLoading
        ? "Loading"
        : owners.data?.institutions_count != null
          ? `By ${owners.data.institutions_count.toLocaleString("en-US")} institutions`
          : "Not available",
    },
    {
      tab: "insiders",
      label: "Insider dealings",
      value: dealings.isLoading
        ? "…"
        : dealings.error
          ? "—"
          : `${count} in ${dealings.windowDays ?? 90} days`,
      detail: dealings.isLoading
        ? "Loading"
        : dealings.error
          ? "Not available"
          : marketTrades.length
            ? `${bought} bought, ${sold} sold on the market`
            : count
              ? "No open-market trades"
              : "None filed",
    },
  ];

  return (
    <section aria-labelledby="key-readings-heading" className="space-y-3">
      <div>
        <h3 id="key-readings-heading" className="text-sm font-bold text-forest-900">
          Key readings
        </h3>
        <p className="text-xs text-brand-muted-fg">Select one to open its tab.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {readings.map((r) => (
          <button
            key={r.tab}
            type="button"
            onClick={() => onOpen(r.tab)}
            className="as-inset group flex min-w-0 flex-col gap-1 p-4 text-left transition-colors hover:bg-forest-100 focus-visible:outline-2 focus-visible:outline-brand-primary"
          >
            <span className="flex items-center justify-between gap-2 text-xs font-semibold text-brand-muted-fg">
              {r.label}
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-forest-700 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
            <span className="text-lg font-bold tabular-nums text-forest-900 sm:text-xl">{r.value}</span>
            <span className={`text-xs ${r.detailTone ?? "text-brand-muted-fg"}`}>{r.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
