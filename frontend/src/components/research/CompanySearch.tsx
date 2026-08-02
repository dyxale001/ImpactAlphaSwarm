import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { UniverseAsset } from "../../hooks/useUniverseAssets";

// Jump straight to a company by ticker or name. The drill-down (universe, then
// company) is still there for browsing, but it should never be the only way to
// reach a company you already have in mind.

const MAX_RESULTS = 8;

export default function CompanySearch({
  assets,
  onSelect,
  disabled,
}: {
  assets: UniverseAsset[];
  onSelect: (ticker: string, universe: string | null) => void;
  disabled?: boolean;
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

  // Reset the highlighted row whenever the result set changes, otherwise Enter
  // can fire on a stale index after the query narrows.
  useEffect(() => setActiveIndex(0), [query]);

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
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[activeIndex]);
    }
  }

  const showDropdown = isOpen && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg pointer-events-none" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder="Search companies"
          aria-label="Search companies"
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

      {showDropdown && (
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
                <span className="text-xs text-brand-muted-fg truncate">
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
