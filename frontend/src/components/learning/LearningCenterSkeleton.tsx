export default function LearningCenterSkeleton() {
  return (
    // Match the default My Roadmap view. Placeholders carry no user progress.
    <div
      aria-hidden="true"
      className="relative mx-auto max-w-7xl motion-safe:animate-pulse space-y-6 px-4 sm:px-6 lg:px-8 pb-16 pt-6 lg:pt-10"
    >
      <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-3 w-28 rounded bg-white/15" />
            <div className="h-9 w-56 max-w-full rounded bg-white/15" />
            <div className="h-4 w-full max-w-2xl rounded bg-white/10" />
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 w-24 rounded-[14px] bg-white/8" />
            ))}
          </div>
        </div>
      </div>

      <div className="h-11 w-full rounded-[20px] bg-forest-50 sm:w-60 sm:rounded-full" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {[0, 1].map((i) => (
          <div key={i} className="as-card space-y-4 p-6">
            <div className="h-4 w-32 rounded bg-forest-50" />
            <div className="h-6 w-3/4 rounded bg-forest-50" />
            <div className="h-4 w-full rounded bg-forest-50" />
            <div className="h-9 w-40 rounded-full bg-forest-50" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`as-card h-24 md:w-[45%] ${i % 2 ? "md:ml-auto" : ""}`} />
        ))}
      </div>
    </div>
  );
}
