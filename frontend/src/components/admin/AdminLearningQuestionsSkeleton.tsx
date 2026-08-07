export default function AdminLearningQuestionsSkeleton() {
  return (
    <div className="relative space-y-8 p-4 sm:p-6 lg:p-8 min-h-screen bg-brand-bg text-brand-fg animate-pulse">
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center text-brand-fg">
        Loading quiz questions...
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-3">
            <div className="h-4 w-16 rounded bg-brand-border/35" />
            <div className="h-8 w-64 rounded bg-brand-border/40" />
            <div className="h-4 w-[32rem] max-w-full rounded bg-brand-border/30" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-9 w-36 rounded-full bg-brand-border/30" />
            <div className="h-9 w-24 rounded-full bg-brand-border/30" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="h-10 w-20 rounded-full bg-brand-border/35" />
          <div className="h-10 w-36 rounded-full bg-brand-border/30" />
          <div className="h-10 w-28 rounded-full bg-brand-border/30" />
          <div className="h-10 w-44 rounded-full bg-brand-border/30" />
        </div>

        <div className="space-y-6">
          <div className="rounded-brand border border-brand-border bg-background shadow-card p-6 space-y-4">
            <div className="h-5 w-32 rounded bg-brand-border/35" />
            <div className="h-12 rounded-lg bg-brand-border/30" />
            <div className="h-28 rounded-lg bg-brand-border/20" />
          </div>

          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-brand border border-brand-border bg-background shadow-card p-5 space-y-3"
              >
                <div className="h-4 w-3/4 rounded bg-brand-border/35" />
                <div className="h-4 w-24 rounded bg-brand-border/30" />
                <div className="flex items-center gap-2">
                  <div className="h-8 w-16 rounded-full bg-brand-border/30" />
                  <div className="h-8 w-16 rounded-full bg-brand-border/30" />
                  <div className="h-8 w-24 rounded-full bg-brand-border/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
