import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { UniverseAsset } from "../../hooks/useUniverseAssets";

// Jump straight to a company by ticker or name. The drill-down (universe, then
// company) is still there for browsing, but it should never be the only way to
// reach a company you already have in mind.
//
// With `browseGroups`, the box also browses: focused and empty, it lists every
// group (Compare passes the watchlist first, then each sector) in a scrolling
// list, so a reader who does not know what to type can still see what there is.
// Typing narrows it to the ranked matches as before. Without the prop nothing
// changes, which keeps Whale Watching's search exactly as it was.

const MAX_RESULTS = 8;

export interface BrowseGroup {
  label: string;
  assets: UniverseAsset[];
}

export default function CompanySearch({
  assets,
  onSelect,
  disabled,
  placeholder = "Search companies",
  browseGroups,
}: {
  assets: UniverseAsset[];
  onSelect: (ticker: string, universe: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Opt-in: what the box lists when it is focused with nothing typed. */
  browseGroups?: BrowseGroup[];
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = assets
      .map((a) => {
        const ticker = a.ticker.toLowerCase();
        const name = (a.name ?? "").toLowerCase();
        // Rank exact and prefix matches above substring ones, so typing "AA"
        // surfaces AA before every company with "aa" buried in its name.
        if (ticker === q) return { a, rank: 0 };
        if (ticker.startsWith(q)) return { a, rank: 1 };
        if (name.startsWith(q)) return { a, rank: 2 };
        if (ticker.includes(q) || name.includes(q)) return { a, rank: 3 };
        return null;
      })
      .filter((r): r is { a: UniverseAsset; rank: number } => r !== null)
      .sort((x, y) => x.rank - y.rank || x.a.ticker.localeCompare(y.a.ticker));
    return scored.slice(0, MAX_RESULTS).map((r) => r.a);
  }, [assets, query]);

  const browsing = !query.trim() && Boolean(browseGroups?.some((g) => g.assets.length));
  // What the arrow keys move through: the ranked matches, or every browsed row in
  // the order drawn (a stock can appear twice, under the watchlist and its sector).
  const options = useMemo(
    () => (browsing ? (browseGroups ?? []).flatMap((g) => g.assets) : results),
    [browsing, browseGroups, results],
  );

  // Reset the highlighted row whenever the result set changes, otherwise Enter
  // can fire on a stale index after the query narrows.
  useEffect(() => setActiveIndex(0), [query]);

  // Keep the highlighted row in view while arrowing through the long browse list.
  useEffect(() => {
    if (!browsing || !isOpen) return;
    containerRef.current
      ?.querySelector(`[data-option="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, browsing, isOpen]);

  // Close on an outside click so the dropdown does not hang over the page.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function choose(asset: UniverseAsset) {
    setQuery("");
    setIsOpen(false);
    onSelect(asset.ticker, asset.universe);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (!options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && isOpen) {
      e.preventDefault();
      choose(options[activeIndex]);
    }
  }

  const showDropdown = isOpen && (query.trim().length > 0 || browsing);

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg pointer-events-none" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-full border border-brand-border/60 bg-brand-card pl-9 pr-9 py-2 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:border-brand-primary/50 disabled:opacity-50 transition-colors"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDropdown && browsing && (
        <div className="absolute z-20 mt-2 w-full max-h-80 overflow-y-auto rounded-2xl border border-brand-border/60 bg-brand-card shadow-lg">
          {(() => {
            let index = -1;
            return (browseGroups ?? [])
              .filter((g) => g.assets.length)
              .map((g) => (
                <div key={g.label}>
                  <p className="sticky top-0 bg-brand-card px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                    {g.label}
                  </p>
                  {g.assets.map((a) => {
                    index += 1;
                    const i = index;
                    return (
                      <button
                        key={`${g.label}:${a.ticker}`}
                        type="button"
                        data-option={i}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => choose(a)}
                        className={`w-full text-left px-4 py-2 flex items-baseline gap-2 transition-colors ${
                          i === activeIndex ? "bg-brand-primary/10" : ""
                        }`}
                      >
                        <span className="text-sm font-bold font-mono text-brand-fg shrink-0">{a.ticker}</span>
                        <span className="text-xs text-brand-muted-fg min-w-0 truncate">{a.name}</span>
                      </button>
                    );
                  })}
                </div>
              ));
          })()}
        </div>
      )}

      {showDropdown && !browsing && (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-brand-border/60 bg-brand-card shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-brand-muted-fg italic">
              No companies match "{query.trim()}".
            </p>
          ) : (
            results.map((a, i) => (
              <button
                key={a.ticker}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(a)}
                className={`w-full text-left px-4 py-2.5 flex items-baseline gap-2 transition-colors ${
                  i === activeIndex ? "bg-brand-primary/10" : ""
                }`}
              >
                <span className="text-sm font-bold font-mono text-brand-fg shrink-0">
                  {a.ticker}
                </span>
                <span className="text-xs text-brand-muted-fg min-w-0 truncate">
                  {a.name}
                </span>
                {a.isNew && (
                  <span className="ml-auto shrink-0 rounded-full bg-brand-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary">
                    New
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
