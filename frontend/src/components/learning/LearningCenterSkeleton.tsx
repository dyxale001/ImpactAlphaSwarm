import "./LearningRoadmap.css";

export default function LearningCenterSkeleton() {
  return (
    <>
      {/* Match the default My Roadmap view. Placeholders carry no user progress. */}
      <div
        aria-hidden="true"
        className="relative mx-auto max-w-7xl motion-safe:animate-pulse space-y-8 px-4 sm:px-6 lg:px-8 pb-16 pt-4 lg:pt-6"
      >
        <div className="hero-card overflow-hidden px-5 sm:px-7 pt-8 pb-12 sm:pb-16">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-28 rounded bg-white/15" />
              <div className="h-9 w-full max-w-xl rounded bg-white/15" />
              <div className="h-4 w-full max-w-2xl rounded bg-white/10" />
              <div className="h-4 w-2/3 rounded bg-white/10" />
            </div>
            <div className="shrink-0 self-start rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="h-3 w-20 rounded bg-white/15" />
              <div className="mt-2 h-7 w-20 rounded bg-white/10" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-brand-border pb-3">
          <div className="h-10 w-32 rounded-full bg-brand-primary/25" />
          <div className="h-10 w-24 rounded-full bg-brand-border/30" />
          <div className="h-10 w-36 rounded-full bg-brand-border/30" />
        </div>

        <div className="learning-journey space-y-8">
          {/* Learning level, completion summary and next badge milestone. */}
          <div className="rounded-3xl border border-brand-border bg-brand-card p-5 shadow-card sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0 space-y-4">
                <div className="h-8 w-48 max-w-full rounded-full bg-brand-primary/10" />
                <div className="h-8 w-full max-w-sm rounded bg-brand-border/35" />
                <div className="space-y-2">
                  <div className="h-4 w-full rounded bg-brand-border/25" />
                  <div className="h-4 w-3/4 rounded bg-brand-border/25" />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="h-4 w-36 rounded bg-brand-border/30" />
                  <div className="h-4 w-16 rounded bg-brand-border/30" />
                  <div className="h-4 w-24 rounded bg-brand-border/30" />
                </div>
                <div className="h-2.5 w-full rounded-full bg-brand-border/25" />
              </div>
              <div className="min-w-0 self-center space-y-3">
                <div className="flex gap-3 rounded-2xl border border-brand-border/60 p-4">
                  <div className="h-11 w-11 shrink-0 rounded-full bg-brand-primary/10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-24 max-w-full rounded bg-brand-border/30" />
                    <div className="h-4 w-full rounded bg-brand-border/35" />
                    <div className="h-3 w-4/5 rounded bg-brand-border/25" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-brand-border/20" />
                <div className="h-3 w-4/5 rounded bg-brand-border/20" />
              </div>
            </div>
          </div>

          {/* Your Next Step with the article and quiz actions. */}
          <div className="rounded-3xl bg-brand-primary p-5 shadow-card sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-3 w-28 rounded bg-brand-accent/30" />
                <div className="h-7 w-full max-w-md rounded bg-white/20" />
                <div className="h-4 w-full max-w-xl rounded bg-white/10" />
                <div className="h-4 w-2/3 rounded bg-white/10" />
              </div>
              <div className="flex shrink-0 flex-col gap-2 self-start">
                <div className="h-11 w-36 rounded-full bg-brand-accent/30" />
                <div className="h-11 w-36 rounded-full border border-white/20 bg-white/5" />
              </div>
            </div>
          </div>

          {/* Optional Financial Tools reference below Next Step. */}
          <div className="flex flex-col gap-4 rounded-3xl border border-brand-border bg-brand-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-40 max-w-full rounded bg-brand-border/30" />
              <div className="h-5 w-32 rounded bg-brand-border/35" />
              <div className="h-4 w-full max-w-xl rounded bg-brand-border/25" />
            </div>
            <div className="h-11 w-48 shrink-0 self-start rounded-full bg-brand-primary/10" />
          </div>

          {/* Reuse the real journey's desktop branches and mobile vertical path. */}
          <div>
            <div className="mb-8 h-6 w-48 rounded bg-brand-border/35" />
            <div className="journey-path">
              {[0, 1].map((category) => (
                <div key={category} className="journey-category">
                  <div className="journey-milestone">
                    <span className="journey-milestone-icon" />
                    <div className="min-w-0 space-y-3 rounded-3xl border border-brand-border bg-brand-card p-5 shadow-card">
                      <div className="h-3 w-32 max-w-full rounded bg-brand-border/30" />
                      <div className="h-6 w-48 max-w-full rounded bg-brand-border/35" />
                      <div className="h-4 w-4/5 rounded bg-brand-border/25" />
                    </div>
                  </div>
                  <div className="journey-lessons">
                    {[0, 1].map((lesson) => (
                      <div
                        key={lesson}
                        className={`journey-stop ${lesson % 2 ? "journey-stop-right" : "journey-stop-left"}`}
                      >
                        <span className="journey-node" />
                        <div className="journey-lesson space-y-3 rounded-2xl border border-brand-border/70 bg-brand-card p-5">
                          <div className="h-3 w-24 max-w-full rounded bg-brand-border/30" />
                          <div className="h-5 w-3/4 rounded bg-brand-border/35" />
                          <div className="h-4 w-full rounded bg-brand-border/25" />
                          <div className="h-4 w-2/3 rounded bg-brand-border/25" />
                          <div className="flex flex-wrap gap-2 pt-1">
                            <div className="h-11 w-32 rounded-full bg-brand-border/25" />
                            <div className="h-11 w-28 rounded-full bg-brand-primary/10" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
