export default function WatchlistSkeleton() {
  return (
    <div className="relative mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <div className="text-sm font-semibold text-brand-fg">
        Loading your watchlist...
      </div>
      <div className="motion-safe:animate-pulse space-y-8">
        <div className="hero-card px-5 pb-12 pt-8 sm:px-7 sm:pb-16">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded bg-white/15" />
            <div className="h-9 w-44 rounded bg-white/15" />
            <div className="h-4 w-[min(38rem,100%)] rounded bg-white/10" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-10 rounded-full border border-brand-border/60 bg-brand-card" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="soft-card space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-brand-border/30" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/4 rounded bg-brand-border/30" />
                    <div className="h-2.5 w-1/2 rounded bg-brand-border/20" />
                  </div>
                </div>
                <div className="h-12 rounded bg-brand-border/20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
