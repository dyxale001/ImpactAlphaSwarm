export default function LearningCenterSkeleton() {
  return (
    <div className="relative mx-auto max-w-7xl animate-pulse px-6 py-8 space-y-8">
      <div className="pointer-events-none fixed inset-y-0 left-64 right-0 z-30 flex items-center justify-center text-brand-fg">
        Loading learning centre...
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
        <div className="space-y-3 max-w-3xl">
          <div className="h-4 w-28 rounded bg-brand-border/35" />
          <div className="h-8 w-96 max-w-full rounded bg-brand-border/40" />
          <div className="h-4 w-xl max-w-full rounded bg-brand-border/30" />
          <div className="h-4 w-120 max-w-full rounded bg-brand-border/30" />
        </div>
      </div>

      <section className="glass-card relative z-40 rounded-2xl p-4">
        <div className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-bg/70 px-4 py-3">
          <div className="h-4 w-4 rounded bg-brand-border/40" />
          <div className="h-4 flex-1 rounded bg-brand-border/30" />
          <div className="h-4 w-10 rounded bg-brand-border/30" />
        </div>
      </section>

      <div className="space-y-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <section key={index} className="space-y-4">
            <div className="space-y-2">
              <div className="h-6 w-48 rounded bg-brand-border/35" />
              <div className="h-4 w-80 max-w-full rounded bg-brand-border/30" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="rounded-2xl border border-brand-border bg-brand-card p-5 space-y-4 shadow-card"
                >
                  <div className="h-5 w-40 rounded bg-brand-border/35" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-brand-border/30" />
                    <div className="h-4 w-5/6 rounded bg-brand-border/30" />
                    <div className="h-4 w-2/3 rounded bg-brand-border/30" />
                  </div>
                  <div className="h-9 w-28 rounded-full bg-brand-border/30" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
