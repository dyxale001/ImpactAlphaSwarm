import { AlertTriangle } from "lucide-react";
import {
  BROWSE_FOCUS_LABEL,
  BROWSE_META_FAILED_BODY,
  BROWSE_META_FAILED_TITLE,
  FILTER_ALL,
  FILTER_ASSET_CLASS,
  FILTER_GEOGRAPHY,
  RETRY_ACTION,
} from "../../utils/fundsCopy";
import type { CatalogueFilters, CatalogueMeta } from "../../services/api/fundCatalogue";

/**
 * The classification, as three tiers of controls.
 *
 * Shown because the categories are the mechanism, not a filing system: a match
 * is "these are the categories your answers map to, and these are the funds in
 * them whose own risk label fits". A reader who can see the whole tree can see
 * what they were not shown, and why, which is the difference between a filter
 * and a recommendation.
 *
 * ## Why it replaced the tree of cards
 *
 * The old one drew every geography as a card with every asset class inside it,
 * and the filter row underneath offered the same two columns as selects. Two
 * controls wrote one filter, so they disagreed: choosing an asset class in the
 * tree un-highlighted the geography, and the row's asset-class list was
 * flattened across every geography, which let a reader pick "South African"
 * plus a class only global funds hold and get a page of nothing.
 *
 * Nesting fixes that by making the classification's own shape the interaction:
 * where it invests, then what it holds within that, then the focus within
 * that. Each tier offers only what the tier above it contains, so a
 * combination that returns nothing cannot be assembled.
 *
 * It also reaches the third tier at all. `category` is what the backend filters
 * `asisa_category` on, and no control on the page could write it — the focus
 * names existed only inside a `title` tooltip on the asset-class buttons. The
 * chips carry the classification's full stored name, because that is the value
 * the column holds; the label is its last tier, which is the part a reader is
 * choosing between.
 */
export default function CategoryNavigator({
  meta,
  isLoading,
  error,
  filters,
  onSelect,
  onRetry,
}: {
  meta: CatalogueMeta | null;
  isLoading: boolean;
  error: string | null;
  filters: CatalogueFilters;
  onSelect: (next: CatalogueFilters) => void;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {[92, 68, 84].map((width) => (
          <div
            key={width}
            className="h-8 animate-pulse rounded-full bg-brand-border/25"
            style={{ width }}
          />
        ))}
      </div>
    );
  }

  // Both halves of this used to be discarded, so a failed meta request rendered
  // no navigator and no message: a section of the page simply was not there.
  // The second sentence is the one that matters — the grid below this does not
  // depend on this request, so the page is degraded rather than broken.
  if (error || !meta) {
    return (
      <div className="flex flex-wrap items-start gap-3 rounded-brand border border-brand-border/60 bg-brand-surface/70 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-brand-primary">{BROWSE_META_FAILED_TITLE}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-secondary">
            {BROWSE_META_FAILED_BODY}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-full border border-brand-border/60 bg-brand-surface px-3 py-1.5 text-[11px] font-bold text-brand-primary transition-colors hover:border-brand-primary/40"
        >
          {RETRY_ACTION}
        </button>
      </div>
    );
  }

  const geographies = Object.keys(meta.tree);
  const geography = filters.geography ?? null;
  const assetClasses = geography ? Object.keys(meta.tree[geography] ?? {}) : [];
  const assetClass = filters.asset_class ?? null;

  // The third tier comes off `meta.categories` rather than off the tree,
  // because only that list carries the full stored name the filter needs.
  const focuses =
    geography && assetClass
      ? meta.categories.filter(
          (category) => category.tier1 === geography && category.tier2 === assetClass,
        )
      : [];

  // Each tier clears the tiers below it. Keeping a focus while its geography
  // changes is how the old pair of controls produced combinations that could
  // not match anything.
  const pickGeography = (next: string | null) =>
    onSelect({ ...filters, geography: next ?? undefined, asset_class: undefined, category: undefined });

  const pickAssetClass = (next: string) =>
    onSelect({
      ...filters,
      asset_class: assetClass === next ? undefined : next,
      category: undefined,
    });

  const pickFocus = (name: string) =>
    onSelect({ ...filters, category: filters.category === name ? undefined : name });

  return (
    <div className="flex flex-col gap-3">
      {/* Tier one, as the house segmented control. "All" is a real option
          rather than a way to clear one: at rest this page lists everything,
          and the tabs then read as a question instead of a state to escape. */}
      <div
        role="tablist"
        aria-label={FILTER_GEOGRAPHY}
        className="inline-flex flex-wrap items-center gap-0.5 self-start rounded-full border border-brand-border/60 bg-brand-surface/70 p-0.5"
      >
        <Tab label={FILTER_ALL} selected={!geography} onClick={() => pickGeography(null)} />
        {geographies.map((name) => (
          <Tab
            key={name}
            label={name}
            selected={geography === name}
            onClick={() => pickGeography(name)}
          />
        ))}
      </div>

      {/* Tiers two and three appear only under a chosen parent, which is what
          keeps the page from offering an asset class no fund in this geography
          holds. */}
      {geography && assetClasses.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-brand-muted-fg">
            {FILTER_ASSET_CLASS}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {assetClasses.map((name) => (
              <Chip
                key={name}
                label={name}
                pressed={assetClass === name}
                onClick={() => pickAssetClass(name)}
              />
            ))}
          </div>
        </div>
      )}

      {focuses.length > 0 && assetClass && (
        <div className="flex flex-col gap-2 border-l-2 border-brand-accent pl-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-brand-muted-fg">
            {BROWSE_FOCUS_LABEL.replace("{assetClass}", assetClass)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {focuses.map((category) => (
              <Chip
                key={category.code}
                label={category.tier3}
                pressed={filters.category === category.name}
                onClick={() => pickFocus(category.name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One segment of the geography control, styled as the app's other tablists. */
function Tab({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        selected
          ? "bg-brand-accent text-brand-fg"
          : "text-brand-muted-fg hover:text-brand-fg"
      }`}
    >
      {label}
    </button>
  );
}

/** A tier-two or tier-three choice. `aria-pressed` rather than `aria-selected`:
 *  these are toggles outside the tablist, and clicking the pressed one clears
 *  it. */
function Chip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
        pressed
          ? "border-brand-accent bg-brand-accent/15 font-bold text-brand-primary"
          : "border-brand-border/60 bg-brand-surface text-brand-secondary hover:border-brand-border hover:text-brand-primary"
      }`}
    >
      {label}
    </button>
  );
}
