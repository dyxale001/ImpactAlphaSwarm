// Shared building blocks for the full news / social sentiment pages: page
// header, summary strip, filter chips, the sort toggle and the sorting logic.

import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export type SortKey = "influence" | "newest" | "sentiment";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "influence", label: "Influence" },
  { key: "newest", label: "Newest" },
  { key: "sentiment", label: "Sentiment" },
];

export type SentimentBucket = "Positive" | "Neutral" | "Negative";

export const SENTIMENT_BUCKETS: SentimentBucket[] = [
  "Positive",
  "Neutral",
  "Negative",
];

// Buckets an item by its labelled sentiment; anything unlabelled or unknown
// counts as neutral, matching how the backend labels items.
export function sentimentBucket(sentiment?: string): SentimentBucket {
  if (sentiment === "Positive") return "Positive";
  if (sentiment === "Negative") return "Negative";
  return "Neutral";
}

type Sortable = {
  date?: string;
  influence?: number;
  sentiment_score?: number;
};

export function sortItems<T extends Sortable>(items: T[], key: SortKey): T[] {
  const sorted = [...items];
  if (key === "newest") {
    sorted.sort((a, b) => {
      const ta = a.date ? Date.parse(a.date) : 0;
      const tb = b.date ? Date.parse(b.date) : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
  } else if (key === "sentiment") {
    sorted.sort(
      (a, b) => (b.sentiment_score ?? -1) - (a.sentiment_score ?? -1),
    );
  } else {
    sorted.sort((a, b) => (b.influence ?? -1) - (a.influence ?? -1));
  }
  return sorted;
}

// Back link, icon, title and subtitle shared by both source pages.
export function SourcePageHeader({
  ticker,
  icon: Icon,
  title,
  subtitle,
}: {
  ticker: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <Link
        to={`/asset/${ticker}`}
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {ticker}
      </Link>
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-brand-fg flex items-center gap-3">
          <Icon className="w-7 h-7 shrink-0 text-brand-primary" />
          {title}
        </h1>
        <p className="text-sm text-brand-muted-fg mt-1">{subtitle}</p>
      </div>
    </>
  );
}

// Grid of stat pills so the page stands alone without going back.
export function SummaryStrip({
  pills,
}: {
  pills: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      {pills.map((pill) => (
        <div
          key={pill.label}
          className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3"
        >
          <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1">
            {pill.label}
          </div>
          <div className="text-sm font-semibold text-brand-fg">
            {pill.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// A toggleable filter chip; shows its item count when provided.
export function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? "bg-brand-primary/10 text-brand-primary border-brand-primary/40"
          : "border-brand-border/60 text-brand-muted-fg hover:text-brand-fg hover:border-brand-border"
      }`}
    >
      {label}
      {count != null && (
        <span className="ml-1.5 font-mono tabular-nums opacity-70">
          {count}
        </span>
      )}
    </button>
  );
}

// All / Positive / Neutral / Negative chip group.
export function SentimentFilterChips({
  total,
  counts,
  value,
  onChange,
}: {
  total: number;
  counts: Record<SentimentBucket, number>;
  value: SentimentBucket | "All";
  onChange: (value: SentimentBucket | "All") => void;
}) {
  return (
    <>
      <FilterChip
        active={value === "All"}
        onClick={() => onChange("All")}
        label="All"
        count={total}
      />
      {SENTIMENT_BUCKETS.map((bucket) => (
        <FilterChip
          key={bucket}
          active={value === bucket}
          onClick={() => onChange(bucket)}
          label={bucket}
          count={counts[bucket]}
        />
      ))}
    </>
  );
}

// All tiers / T1 / T2 / T3 chip group (news only).
export function TierFilterChips({
  counts,
  value,
  onChange,
}: {
  counts: Record<number, number>;
  value: number;
  onChange: (tier: number) => void;
}) {
  return (
    <>
      <FilterChip
        active={value === 0}
        onClick={() => onChange(0)}
        label="All tiers"
      />
      {[1, 2, 3].map((tier) => (
        <FilterChip
          key={tier}
          active={value === tier}
          onClick={() => onChange(tier)}
          label={`T${tier}`}
          count={counts[tier] ?? 0}
        />
      ))}
    </>
  );
}

// Segmented sort control shared by both pages.
export function SortToggle({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-brand-border/60 bg-brand-bg/55 p-0.5 flex-wrap">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            value === opt.key
              ? "bg-brand-primary/15 text-brand-primary"
              : "text-brand-muted-fg hover:text-brand-fg"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Bordered list container shared by both pages' source rows.
export function SourceList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-brand-border/40 rounded-2xl border border-brand-border/60 bg-brand-bg/40 overflow-x-auto">
      {children}
    </ul>
  );
}

// Soft-card empty state used when nothing was analysed or nothing matches.
export function EmptyStateCard({ message }: { message: string }) {
  return (
    <div className="soft-card w-full p-5">
      <p className="text-brand-muted-fg text-sm italic">{message}</p>
    </div>
  );
}
