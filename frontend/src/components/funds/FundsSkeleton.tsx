/** Loading placeholder for the funds page, matching the card grid it replaces. */
export default function FundsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="soft-card flex flex-col gap-3 p-5 animate-pulse">
          <div className="h-3 w-24 rounded bg-brand-border/30" />
          <div className="h-4 w-3/4 rounded bg-brand-border/30" />
          <div className="h-3 w-1/2 rounded bg-brand-border/20" />
          <div className="h-1.5 w-28 rounded-full bg-brand-border/30" />
          <div className="h-10 rounded bg-brand-border/20" />
          <div className="h-3 w-1/3 rounded bg-brand-border/20" />
        </div>
      ))}
    </div>
  );
}
