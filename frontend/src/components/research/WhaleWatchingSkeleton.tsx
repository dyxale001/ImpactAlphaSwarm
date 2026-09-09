export default function WhaleWatchingSkeleton() {
  return (
    <div className="relative mx-auto max-w-7xl space-y-6 px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <div className="text-sm font-semibold text-brand-fg">
        Preparing whale watching...
      </div>
      <div className="motion-safe:animate-pulse space-y-6">
        <div className="hero-card px-5 pb-12 pt-8 sm:px-7 sm:pb-16">
          <div className="space-y-3">
            <div className="h-9 w-56 rounded bg-white/15" />
            <div className="h-4 w-[min(42rem,100%)] rounded bg-white/10" />
            <div className="h-4 w-[min(36rem,100%)] rounded bg-white/10" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="h-9 w-28 rounded-full bg-brand-border/30" />
          <div className="h-9 w-32 rounded-full bg-brand-border/30" />
          <div className="h-9 w-48 rounded-full bg-brand-border/30" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-brand-border/60 bg-brand-card p-5"
            >
              <div className="h-10 w-10 rounded-xl bg-brand-border/30" />
              <div className="mt-4 h-5 w-32 rounded bg-brand-border/30" />
              <div className="mt-2 h-3 w-full rounded bg-brand-border/20" />
              <div className="mt-2 h-3 w-3/4 rounded bg-brand-border/20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
