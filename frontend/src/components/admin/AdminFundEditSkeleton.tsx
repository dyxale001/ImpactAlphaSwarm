import LoadingRegion from "../LoadingRegion";

export default function AdminFundEditSkeleton() {
  return <LoadingRegion label="Loading fund details…"><div className="space-y-5">
    <div className="space-y-2"><div className="h-7 w-72 max-w-full rounded bg-brand-border/30" /><div className="h-3 w-48 max-w-full rounded bg-brand-border/20" /></div>
    <div className="soft-card space-y-4 p-5"><div className="h-5 w-32 rounded bg-brand-border/30" /><div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 10 }, (_, i) => <div key={i} className="space-y-2"><div className="h-3 w-24 rounded bg-brand-border/25" /><div className="h-10 rounded-lg border border-brand-border/60 bg-brand-border/15" /></div>)}
    </div></div>
    {[0, 1].map(i => <div key={i} className="soft-card space-y-4 p-5"><div className="h-5 w-40 rounded bg-brand-border/30" /><div className="h-24 rounded bg-brand-border/20" /></div>)}
  </div></LoadingRegion>;
}
