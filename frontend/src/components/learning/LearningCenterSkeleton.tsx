export default function LearningCenterSkeleton() {
  return (
    <div className="relative mx-auto max-w-7xl animate-pulse space-y-8 px-8 pb-16 pt-10">
      <div className="pointer-events-none fixed inset-y-0 left-64 right-0 z-30 flex items-center justify-center text-brand-fg">
        Loading learning centre...
      </div>

      <div className="-mx-4 rounded-lg bg-brand-bg/60 p-4 px-4 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="h-4 w-28 rounded bg-brand-border/35" />
            <div className="h-9 w-[min(32rem,100%)] rounded bg-brand-border/40" />
            <div className="h-4 w-[min(42rem,100%)] rounded bg-brand-border/30" />
            <div className="h-4 w-[min(38rem,100%)] rounded bg-brand-border/30" />
          </div>

          <div className="rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
            <div className="h-3 w-20 rounded bg-brand-border/30" />
            <div className="mt-2 h-7 w-20 rounded bg-brand-border/40" />
          </div>
        </div>
      </div>

      <section className="rounded-lg bg-brand-card p-4">
        <div className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-bg/70 px-4 py-3">
          <div className="h-4 w-4 rounded bg-brand-border/40" />
          <div className="h-4 flex-1 rounded bg-brand-border/30" />
          <div className="h-4 w-10 rounded bg-brand-border/30" />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-brand-border bg-brand-card p-4">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-brand-border/35" />
          <div className="h-6 w-56 rounded bg-brand-border/30" />
          <div className="h-4 w-[min(34rem,100%)] rounded bg-brand-border/25" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="relative flex flex-col items-center gap-2.5 rounded-3xl border border-brand-border bg-brand-card p-3.5 text-center"
            >
              <div className="h-20 w-20 rounded-full bg-brand-border/30 sm:h-24 sm:w-24" />
              <div className="h-4 w-20 rounded bg-brand-border/30" />
              <div className="h-3 w-24 rounded bg-brand-border/20" />
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-8">
        {Array.from({ length: 3 }).map((_, sectionIndex) => (
          <section
            key={sectionIndex}
            className="space-y-4 rounded-lg border border-brand-border bg-brand-card p-4"
          >
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-brand-border/35" />
              <div className="h-6 w-52 rounded bg-brand-border/30" />
              <div className="h-4 w-[min(36rem,100%)] rounded bg-brand-border/25" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="rounded-2xl border border-brand-border bg-brand-bg/60 p-5"
                >
                  <div className="space-y-3">
                    <div className="h-5 w-32 rounded bg-brand-border/35" />
                    <div className="h-3 w-24 rounded bg-brand-border/25" />
                    <div className="h-4 w-full rounded bg-brand-border/25" />
                    <div className="h-4 w-5/6 rounded bg-brand-border/25" />
                    <div className="h-4 w-2/3 rounded bg-brand-border/25" />
                  </div>

                  <div className="mt-5 flex gap-3">
                    <div className="h-9 w-28 rounded-full bg-brand-border/30" />
                    <div className="h-9 w-28 rounded-full bg-brand-border/30" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
