import LoadingRegion from "../LoadingRegion";

export default function AdminFundsSkeleton() {
  return <LoadingRegion label="Loading fund catalogue…">
    <div className="min-w-0 space-y-2">
      <div className="h-4 w-72 max-w-full rounded bg-brand-border/25" />
      <div className="soft-card max-w-full overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="border-b border-brand-border/40 text-[11px] uppercase tracking-[0.06em] text-brand-secondary/70"><tr>
            {["Fund", "Category", "Fact sheet", "Listed", "Actions"].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
          </tr></thead>
          <tbody>{Array.from({ length: 5 }, (_, row) => <tr key={row} className="border-b border-brand-border/20 last:border-0">
            <td className="space-y-2 px-4 py-3"><div className="h-3 w-40 rounded bg-brand-border/30" /><div className="h-3 w-28 rounded bg-brand-border/20" /><div className="h-2.5 w-24 rounded bg-brand-border/20" /></td>
            <td className="px-4 py-3"><div className="h-3 w-32 rounded bg-brand-border/25" /></td>
            <td className="px-4 py-3"><div className="h-5 w-28 rounded-full bg-brand-border/25" /></td>
            <td className="px-4 py-3"><div className="h-3 w-10 rounded bg-brand-border/25" /></td>
            <td className="px-4 py-3"><div className="ml-auto h-6 w-16 rounded-md bg-brand-border/25" /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </LoadingRegion>;
}
