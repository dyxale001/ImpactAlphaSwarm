import type { ReactNode } from "react";
import LoadingRegion from "../LoadingRegion";

export type ReportSkeletonVariant = "Overview" | "Users" | "Learners" | "Badges" | "Assets" | "Retention" | "Chatbot";

function Bar({ className = "w-28" }: { className?: string }) {
  return <div className={`h-3 max-w-full rounded bg-brand-border/30 ${className}`} />;
}
function Panel({ children }: { children: ReactNode }) {
  return <div className="glass-card min-w-0 space-y-4 p-6"><Bar className="w-48" />{children}</div>;
}
function Kpi({ sub = false }: { sub?: boolean }) {
  return <div data-placeholder="kpi" className="glass-card min-w-0 p-5">
    <Bar className="h-4 w-28" />
    <Bar className="mt-2 h-8 w-16" />
    {sub && <Bar className="mt-1 w-24" />}
  </div>;
}
function Kpis({ count, grid, variant }: { count: number; grid: string; variant: ReportSkeletonVariant }) {
  return <div className={`grid grid-cols-2 gap-4 ${grid}`}>
    {Array.from({ length: count }, (_, i) => <Kpi key={i} sub={variant === "Learners" || ((variant === "Badges" || variant === "Assets") && i === 0)} />)}
  </div>;
}
function Chart({ rank = false }: { rank?: boolean }) {
  return <Panel><div data-placeholder="chart" className={`${rank ? "h-64" : "h-56"} flex items-end gap-3 border-b border-l border-brand-border/40 p-4`}>
    {rank ? <div className="flex w-full flex-col gap-5"><Bar className="w-4/5" /><Bar className="w-3/5" /><Bar className="w-2/5" /></div>
      : <div className="h-3/5 w-full rounded bg-brand-border/15" />}
  </div></Panel>;
}
function Table({ columns }: { columns: number }) {
  return <Panel><div data-placeholder="table" className="space-y-4">
    {Array.from({ length: 6 }, (_, row) => <div key={row} className="grid gap-4 border-b border-brand-border/30 pb-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }, (_, col) => <Bar key={col} className={row === 0 ? "w-20" : "w-3/4"} />)}
    </div>)}
  </div></Panel>;
}

export default function AdminReportsSkeleton({ variant, showLatency = false }: { variant: ReportSkeletonVariant; showLatency?: boolean }) {
  const counts = { Overview: 4, Users: 3, Learners: 2, Badges: 2, Assets: 1, Retention: 5, Chatbot: 5 };
  const grid = variant === "Overview" ? "md:grid-cols-4" : variant === "Retention" || variant === "Chatbot" ? "md:grid-cols-5" : variant === "Assets" ? "" : "md:grid-cols-3";
  return <LoadingRegion label={`Loading ${variant.toLowerCase()} report…`}>
    <div className="space-y-6" data-report-skeleton={variant}>
      <Kpis count={counts[variant]} grid={grid} variant={variant} />
      {variant === "Overview" && <>
        <Panel><div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="space-y-3 rounded-brand border border-brand-border px-4 py-3"><Bar className="w-16" /><Bar className="h-5 w-24" /></div>)}</div></Panel>
        <Panel><div className="flex flex-wrap gap-6">{[0, 1].map(i => <div key={i} className="space-y-3"><Bar className="w-16" /><Bar className="h-6 w-12" /></div>)}</div></Panel>
      </>}
      {(variant === "Users" || variant === "Badges") && <><Chart /><Table columns={variant === "Users" ? 2 : 3} /></>}
      {variant === "Learners" && <Chart rank />}
      {variant === "Assets" && <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Chart rank /><Chart rank /></div>}
      {variant === "Retention" && <Panel><div className="space-y-4">{[0, 1, 2, 3, 4].map(i => <div key={i} className="space-y-2"><Bar className="w-16" /><Bar className="w-full" /></div>)}</div></Panel>}
      {variant === "Chatbot" && <>{showLatency && <Kpi />}<Chart /><Chart rank /></>}
    </div>
  </LoadingRegion>;
}
