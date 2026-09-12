/**
 * Loading placeholder for one fund's page.
 *
 * The page loaded behind `FundsSkeleton` until now — six card placeholders in a
 * three-column grid, for a page that is a single fund. It told the reader
 * something was coming and then the layout it arrived in bore no relation to
 * it.
 *
 * Three blocks, in the order the page renders them: the forest hero (dark, with
 * the risk scale's five pips at their real size), the tab strip, and the first
 * row of tiles. The hero placeholder is dark rather than grey because the hero
 * itself is: a light block that turns forest a moment later is a flash, not a
 * load.
 */
export default function FundDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {/* The hero, on its own ground */}
      <div className="hero-card animate-pulse overflow-hidden px-6 py-7">
        <div className="flex flex-col gap-3">
          <div className="h-4 w-24 rounded-md bg-white/15" />
          <div className="h-6 w-3/5 rounded bg-white/20" />
          <div className="h-3 w-2/5 rounded bg-white/12" />
          <div className="mt-2 flex flex-col gap-2">
            <div className="h-2.5 w-44 rounded bg-white/12" />
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((pip) => (
                <div key={pip} className="h-1.5 w-5 rounded-full bg-white/25" />
              ))}
            </div>
          </div>
          <div className="mt-3 h-2.5 w-64 rounded bg-white/12" />
        </div>
      </div>

      {/* The tab strip */}
      <div className="flex gap-1.5">
        {[76, 88, 96].map((width) => (
          <div
            key={width}
            className="h-8 animate-pulse rounded-full bg-brand-border/25"
            style={{ width }}
          />
        ))}
      </div>

      {/* The first row of tiles, at their real spans */}
      <div className="bento-grid">
        <div className="soft-card col-span-6 flex animate-pulse flex-col gap-2 p-5">
          <div className="h-3 w-40 rounded bg-brand-border/30" />
          <div className="h-2.5 w-full rounded bg-brand-border/20" />
          <div className="h-2.5 w-4/5 rounded bg-brand-border/20" />
        </div>
        {[0, 1, 2].map((tile) => (
          <div
            key={tile}
            className="soft-card col-span-6 flex animate-pulse flex-col gap-3 p-5 md:col-span-3 lg:col-span-2"
          >
            <div className="h-3 w-28 rounded bg-brand-border/30" />
            <div className="h-7 w-20 rounded bg-brand-border/25" />
            <div className="h-2.5 w-32 rounded bg-brand-border/20" />
            <div className="h-2.5 w-24 rounded bg-brand-border/20" />
          </div>
        ))}
      </div>
    </div>
  );
}
