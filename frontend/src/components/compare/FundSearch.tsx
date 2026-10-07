import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { CatalogueFund } from "../../services/api/fundCatalogue";
import { VEHICLE_LABEL } from "../../utils/fundsCopy";

// Jump to a fund by name, JSE code or manager. The fund twin of CompanySearch,
// with the same field, dropdown and keys, so the two halves of the Compare toggle
// are searched the same way.

const MAX_RESULTS = 8;

export default function FundSearch({
  funds,
  exclude,
  onSelect,
  disabled,
  placeholder = "Search funds",
}: {
  funds: CatalogueFund[];
  exclude: string[];
  onSelect: (fundId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return funds
      .filter((f) => !exclude.includes(f.fund_id))
      .map((f) => {
        const code = (f.jse_code ?? "").toLowerCase();
        const name = f.name.toLowerCase();
        const house = (f.fund_house ?? "").toLowerCase();
        if (code && code === q) return { f, rank: 0 };
        if (code.startsWith(q)) return { f, rank: 1 };
        if (name.startsWith(q)) return { f, rank: 2 };
        if (name.includes(q) || house.includes(q) || code.includes(q)) return { f, rank: 3 };
        return null;
      })
      .filter((r): r is { f: CatalogueFund; rank: number } => r !== null)
      .sort((a, b) => a.rank - b.rank || a.f.name.localeCompare(b.f.name))
      .slice(0, MAX_RESULTS)
      .map((r) => r.f);
  }, [funds, exclude, query]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function choose(fund: CatalogueFund) {
    setQuery("");
    setIsOpen(false);
    onSelect(fund.fund_id);
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

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted-fg" />
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
          className="w-full rounded-full border border-brand-border/60 bg-brand-card py-2 pl-9 pr-9 text-sm text-brand-fg transition-colors placeholder:text-brand-muted-fg focus:border-brand-primary/50 focus:outline-none disabled:opacity-50"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg transition-colors hover:text-brand-fg"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && query.trim() && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-brand-border/60 bg-brand-card shadow-lg sm:w-[26rem]">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm italic text-brand-muted-fg">No funds match "{query.trim()}".</p>
          ) : (
            results.map((f, i) => (
              <button
                key={f.fund_id}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(f)}
                className={`flex w-full flex-col px-4 py-2.5 text-left transition-colors ${
                  i === activeIndex ? "bg-brand-primary/10" : ""
                }`}
              >
                <span className="flex items-baseline gap-2">
                  {f.jse_code && (
                    <span className="shrink-0 font-mono text-sm font-bold text-brand-fg">{f.jse_code}</span>
                  )}
                  <span className="min-w-0 truncate text-sm text-brand-fg">{f.name}</span>
                </span>
                <span className="text-[11px] text-brand-muted-fg">
                  {VEHICLE_LABEL[f.vehicle] ?? f.vehicle} · {f.fund_house}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
