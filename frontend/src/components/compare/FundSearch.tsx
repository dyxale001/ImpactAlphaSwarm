import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { CatalogueFund } from "../../services/api/fundCatalogue";
import { VEHICLE_LABEL } from "../../utils/fundsCopy";

// Jump to a fund by name, JSE code or manager. The fund twin of CompanySearch,
// with the same field, dropdown and keys, so the two halves of the Compare toggle
// are searched the same way. That includes browsing: focused with nothing typed,
// it lists `browseGroups` (the reader's matched funds, then the catalogue by
// region and asset class) in one scrolling list.

const MAX_RESULTS = 8;

export interface FundBrowseGroup {
  label: string;
  funds: CatalogueFund[];
}

export default function FundSearch({
  funds,
  exclude,
  onSelect,
  disabled,
  placeholder = "Search funds",
  browseGroups,
}: {
  funds: CatalogueFund[];
  exclude: string[];
  onSelect: (fundId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** What the box lists when it is focused with nothing typed. */
  browseGroups?: FundBrowseGroup[];
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

  const browsing = !query.trim() && Boolean(browseGroups?.some((g) => g.funds.length));
  // What the arrow keys move through: the ranked matches, or every browsed row in
  // the order drawn (a matched fund also appears under its group).
  const options = useMemo(
    () => (browsing ? (browseGroups ?? []).flatMap((g) => g.funds) : results),
    [browsing, browseGroups, results],
  );

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    if (!browsing || !isOpen) return;
    containerRef.current
      ?.querySelector(`[data-option="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, browsing, isOpen]);

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

      {isOpen && browsing && (
        <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-brand-border/60 bg-brand-card shadow-lg sm:w-[26rem]">
          {(() => {
            let index = -1;
            return (browseGroups ?? [])
              .filter((g) => g.funds.length)
              .map((g) => (
                <div key={g.label}>
                  <p className="sticky top-0 bg-brand-card px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                    {g.label}
                  </p>
                  {g.funds.map((f) => {
                    index += 1;
                    const i = index;
                    return (
                      <FundRow
                        key={`${g.label}:${f.fund_id}`}
                        fund={f}
                        index={i}
                        active={i === activeIndex}
                        onHover={() => setActiveIndex(i)}
                        onChoose={() => choose(f)}
                      />
                    );
                  })}
                </div>
              ));
          })()}
        </div>
      )}

      {isOpen && !browsing && query.trim() && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-brand-border/60 bg-brand-card shadow-lg sm:w-[26rem]">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm italic text-brand-muted-fg">No funds match "{query.trim()}".</p>
          ) : (
            results.map((f, i) => (
              <FundRow
                key={f.fund_id}
                fund={f}
                index={i}
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onChoose={() => choose(f)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FundRow({
  fund,
  index,
  active,
  onHover,
  onChoose,
}: {
  fund: CatalogueFund;
  index: number;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      data-option={index}
      onMouseEnter={onHover}
      onClick={onChoose}
      className={`flex w-full flex-col px-4 py-2.5 text-left transition-colors ${active ? "bg-brand-primary/10" : ""}`}
    >
      <span className="flex items-baseline gap-2">
        {fund.jse_code && <span className="shrink-0 font-mono text-sm font-bold text-brand-fg">{fund.jse_code}</span>}
        <span className="min-w-0 truncate text-sm text-brand-fg">{fund.name}</span>
      </span>
      <span className="text-[11px] text-brand-muted-fg">
        {VEHICLE_LABEL[fund.vehicle] ?? fund.vehicle} · {fund.fund_house}
      </span>
    </button>
  );
}
