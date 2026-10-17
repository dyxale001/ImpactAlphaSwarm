// Shared building blocks for the sentiment evidence page's news and social panels:
// summary tiles, filter chips, the sort toggle and the sorting logic.

import { sentimentVerdict } from "./sentimentDisplay";

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
  influence?: number | null;
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
// The day's headline figures as soft tiles, so the page stands alone without going
// back. `hint` qualifies a figure in small type (e.g. "top 15 shown") rather than
// inflating it, and `chip` sits beside a figure that has a word for it.
export function SummaryStrip({
  pills,
}: {
  pills: { label: string; value: React.ReactNode; hint?: string; chip?: React.ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {pills.map((pill) => (
        <div key={pill.label} className="as-inset flex flex-col gap-1 p-3 sm:p-4">
          <dt className="text-xs text-brand-muted-fg">{pill.label}</dt>
          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">
            {pill.value}
            {pill.chip}
          </dd>
          {pill.hint ? <dd className="text-xs text-brand-muted-fg">{pill.hint}</dd> : null}
        </div>
      ))}
    </dl>
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // shrink-0: on a phone the chip groups are a sideways-scrolling row
      // (FilterChipRow), where a chip would otherwise squash and wrap its count.
      className="as-fchip shrink-0"
    >
      {label}
      {count != null && (
        <span className="tabular-nums text-brand-muted-fg">{count}</span>
      )}
    </button>
  );
}

// The row the chip groups sit in, shared by both pages. One line that scrolls
// sideways on a phone and wraps from sm. Wrapped at phone width, the news page's
// eight chips took three rows above the list they filter.
export function FilterChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto no-scrollbar sm:w-auto sm:flex-wrap">
      {children}
    </div>
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
    // The shared small tab pill, as on the Stocks page's universe filter.
    <div className="as-tabs as-tabs-sm" role="group" aria-label="Sort by">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={value === opt.key}
          className="as-tab"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Bordered list container shared by both pages' source rows.
//
// brand-accent, the same outline the Reasoning Trace and Why It Ranks Here panels use,
// so a list of evidence is framed the way the conclusions drawn from it are. Kept in
// step with those: if they move, this moves.
export function SourceList({
  children,
  // Set when the list is already inside an accent-outlined panel (the social page
  // frames the day's posts the way DaySummaryPanel frames its prose). A second
  // neon border inside the first reads as a mistake, so the nested list drops to
  // the quiet inner-box treatment the AI summary box uses.
  nested = false,
}: {
  children: React.ReactNode;
  nested?: boolean;
}) {
  return (
    <ul
      className={`divide-y divide-brand-border/40 overflow-x-auto ${
        nested
          ? "rounded-[12px] border border-forest-900/10 bg-white"
          : "rounded-2xl border border-brand-accent bg-brand-bg/40"
      }`}
    >
      {children}
    </ul>
  );
}

// Soft-card empty state used when nothing was analysed or nothing matches.
export function EmptyStateCard({ message }: { message: string }) {
  return (
    <div className="as-card w-full p-4 sm:p-6">
      <p className="text-brand-muted-fg text-sm italic">{message}</p>
    </div>
  );
}

// The selected day's list: a white card headed by the day, with the filters and sort
// above the items. Shared so the news and social panels frame their lists alike.
export function EvidenceDayCard({
  title,
  caption,
  controls,
  children,
}: {
  title: string;
  caption?: string;
  controls: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="as-card w-full space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h2>
        {caption ? <span className="text-xs text-brand-muted-fg">{caption}</span> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">{controls}</div>
      {children}
    </section>
  );
}

// A sentiment figure's word as a chip, toned up, down or neutral.
export function VerdictChip({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const verdict = sentimentVerdict(score);
  const tone =
    verdict.tone === "positive" ? "chip-up" : verdict.tone === "negative" ? "chip-down" : "";
  return <span className={`chip ${tone} text-xs`}>{verdict.label}</span>;
}
