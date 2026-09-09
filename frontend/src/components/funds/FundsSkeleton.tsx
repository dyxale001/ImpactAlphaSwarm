/** Loading placeholder for the funds grid, shaped like the card it replaces.
 *
 *  Shaped like it deliberately: six generic bars in a card told the reader
 *  something was coming but not what, and the grid then jumped as the real
 *  cards came in at a different height. Badge row, name, two lines of
 *  classification, the risk scale's pips, a two-column figure grid and a split
 *  footer — the same blocks in the same order, so the swap is a fill rather
 *  than a relayout. */
export default function FundsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="soft-card flex animate-pulse flex-col gap-4 p-5">
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5">
              <div className="h-4 w-20 rounded-md bg-brand-border/25" />
              <div className="h-4 w-16 rounded-md bg-brand-border/20" />
            </div>
            <div className="h-4 w-4/5 rounded bg-brand-border/30" />
            <div className="h-3 w-1/3 rounded bg-brand-border/20" />
            <div className="h-3 w-3/5 rounded bg-brand-border/20" />
          </div>

          {/* The five pips of the risk scale, at their real size */}
          <div className="flex flex-col gap-1.5">
            <div className="h-2.5 w-40 rounded bg-brand-border/20" />
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((pip) => (
                <div key={pip} className="h-1.5 w-5 rounded-full bg-brand-border/30" />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {[0, 1, 2, 3].map((cell) => (
              <div key={cell} className="flex flex-col gap-1">
                <div className="h-2.5 w-16 rounded bg-brand-border/20" />
                <div className="h-3 w-12 rounded bg-brand-border/30" />
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-brand-border/40 pt-3">
            <div className="h-2.5 w-32 rounded bg-brand-border/20" />
            <div className="h-2.5 w-20 rounded bg-brand-border/25" />
          </div>
        </div>
      ))}
    </div>
  );
}
