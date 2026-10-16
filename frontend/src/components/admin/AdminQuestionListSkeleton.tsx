import LoadingRegion from "../LoadingRegion";

export default function AdminQuestionListSkeleton() {
  return <LoadingRegion label="Loading questions…"><div className="space-y-4">
    {[0, 1].map(i => <div key={i} className="space-y-4 rounded-brand border border-brand-border bg-background p-5 shadow-card">
      <div className="h-5 w-3/4 rounded bg-brand-border/30" />
      {[0, 1, 2, 3].map(answer => <div key={answer} className="h-10 rounded-lg border border-brand-border/60 bg-brand-border/15" />)}
    </div>)}
  </div></LoadingRegion>;
}
