export default function WatchlistSkeleton() {
  return (
    <div className="relative mx-auto max-w-7xl space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <div className="motion-safe:animate-pulse space-y-6">
        <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded bg-white/15" />
            <div className="h-9 w-44 rounded bg-white/15" />
            <div className="h-4 w-[min(38rem,100%)] rounded bg-white/10" />
          </div>
        </div>
        <div className="as-card space-y-3 p-3 sm:p-4">
          <div className="h-10 rounded-full bg-forest-50" />
          <div className="h-8 w-2/3 rounded-full bg-forest-50" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="as-card space-y-3 p-5">
              <div className="h-4 w-1/4 rounded bg-forest-50" />
              <div className="h-3 w-1/2 rounded bg-forest-50" />
              <div className="h-11 rounded bg-forest-50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
