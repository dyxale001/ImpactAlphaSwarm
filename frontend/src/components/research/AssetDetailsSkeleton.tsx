export default function AssetDetailsSkeleton() {
  return (
    <div className="relative max-w-5xl mx-auto pt-10 px-8 pb-20 space-y-8 animate-pulse">
      <div className="pointer-events-none fixed inset-y-0 left-64 right-0 z-30 flex items-center justify-center text-brand-fg">
        Loading asset data...
      </div>

      <div className="h-5 w-40 rounded bg-brand-border/35" />

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="h-10 w-56 rounded bg-brand-border/40" />
          <div className="h-8 w-40 rounded bg-brand-border/35" />
        </div>

        <div className="soft-card w-full p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="h-40 w-40 rounded-full bg-brand-border/35 shrink-0" />
            <div className="flex-1 space-y-4">
              <div className="h-4 w-56 rounded bg-brand-border/35" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4 space-y-2">
                  <div className="h-3 w-24 rounded bg-brand-border/35" />
                  <div className="h-4 w-full rounded bg-brand-border/30" />
                  <div className="h-4 w-4/5 rounded bg-brand-border/30" />
                  <div className="h-4 w-3/5 rounded bg-brand-border/30" />
                </div>
                <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4 space-y-3">
                  <div className="h-3 w-24 rounded bg-brand-border/35" />
                  <div className="h-4 w-full rounded bg-brand-border/30" />
                  <div className="h-4 w-full rounded bg-brand-border/30" />
                  <div className="h-8 w-2/3 rounded bg-brand-border/30" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="soft-card w-full p-5 space-y-4">
          <div className="h-3 w-32 rounded bg-brand-border/35" />
          <div className="h-4 w-72 rounded bg-brand-border/30" />
          <div className="h-2 w-full rounded bg-brand-border/30" />
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4 space-y-2"
              >
                <div className="h-3 w-16 rounded bg-brand-border/35" />
                <div className="h-4 w-20 rounded bg-brand-border/30" />
              </div>
            ))}
          </div>
        </div>

        <div className="soft-card w-full p-5 space-y-4">
          <div className="h-3 w-36 rounded bg-brand-border/35" />
          <div className="h-4 w-72 rounded bg-brand-border/30" />
          <div className="h-2 w-full rounded bg-brand-border/30" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4 space-y-2"
              >
                <div className="h-3 w-20 rounded bg-brand-border/35" />
                <div className="h-4 w-24 rounded bg-brand-border/30" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
