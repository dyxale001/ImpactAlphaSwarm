export default function AdminEditUserSkeleton() {
  return (
    <div className="relative p-4 sm:p-6 lg:p-8 min-h-screen bg-brand-bg text-brand-fg animate-pulse">
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center text-brand-fg">
        Loading user details...
      </div>

      <div className="max-w-xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 rounded bg-brand-border/40" />
          <div className="h-4 w-16 rounded bg-brand-border/30" />
        </div>

        <div className="rounded-lg border border-brand-border bg-background shadow-card p-6 space-y-5">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-brand-border/35" />
            <div className="h-12 rounded-lg bg-brand-border/30" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-brand-border/35" />
            <div className="h-12 rounded-lg bg-brand-border/30" />
          </div>
          <div className="h-12 w-44 rounded-lg bg-brand-border/30 mt-4" />
        </div>
      </div>
    </div>
  );
}
