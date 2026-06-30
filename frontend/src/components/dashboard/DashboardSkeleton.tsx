export default function DashboardSkeleton() {
  return (
    <div className="relative space-y-6 pt-10 px-8 pb-10 max-w-7xl mx-auto animate-pulse">
      <div className="pointer-events-none fixed inset-y-0 left-64 right-0 z-30 flex items-center justify-center text-brand-fg">
        Loading...
      </div>

      <div className="bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-3">
            <div className="h-8 w-64 rounded bg-brand-border/40" />
            <div className="h-4 w-96 max-w-full rounded bg-brand-border/30" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-9 w-40 rounded-full bg-brand-border/30" />
            <div className="h-9 w-24 rounded-full bg-brand-border/30" />
            <div className="h-9 w-28 rounded-full bg-brand-border/30" />
          </div>
        </div>
      </div>

      <div className="rounded-lg p-6 bg-accent/50 border border-brand-border/40">
        <div className="h-4 w-32 rounded bg-brand-border/40 mb-5" />
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          <div className="h-48 rounded-2xl bg-brand-border/35" />
          <div className="space-y-3">
            <div className="h-7 w-24 rounded bg-brand-border/35" />
            <div className="h-5 w-40 rounded bg-brand-border/30" />
            <div className="h-16 rounded-xl bg-brand-border/30" />
            <div className="h-9 rounded-full bg-brand-border/30" />
            <div className="h-20 rounded-2xl bg-brand-border/30" />
          </div>
        </div>
      </div>

      <div>
        <div className="h-8 w-80 rounded bg-brand-border/35 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-brand-border/40 bg-brand-bg/70 p-4 space-y-3"
            >
              <div className="h-5 w-24 rounded bg-brand-border/35" />
              <div className="h-4 w-40 rounded bg-brand-border/30" />
              <div className="h-16 rounded-xl bg-brand-border/30" />
              <div className="h-3 w-20 rounded bg-brand-border/35" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg p-4 border border-brand-border/40 bg-brand-bg/60">
        <div className="h-4 w-full rounded bg-brand-border/30" />
      </div>
    </div>
  );
}
