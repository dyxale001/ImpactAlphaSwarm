export default function AdminBadgesSkeleton() {
  return (
    <div className="relative space-y-8 p-8 min-h-screen bg-brand-bg text-brand-fg animate-pulse">
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center text-brand-fg">
        Loading badges...
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-3">
            <div className="h-4 w-16 rounded bg-brand-border/35" />
            <div className="h-8 w-44 rounded bg-brand-border/40" />
            <div className="h-4 w-lg max-w-full rounded bg-brand-border/30" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-9 w-36 rounded-full bg-brand-border/30" />
            <div className="h-9 w-32 rounded-full bg-brand-border/30" />
            <div className="h-9 w-24 rounded-full bg-brand-border/30" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="h-10 w-20 rounded-full bg-brand-border/35" />
          <div className="h-10 w-36 rounded-full bg-brand-border/30" />
          <div className="h-10 w-28 rounded-full bg-brand-border/30" />
          <div className="h-10 w-44 rounded-full bg-brand-border/30" />
          <div className="h-10 w-24 rounded-full bg-brand-border/30" />
        </div>

        <div className="bg-background border border-brand-border rounded-brand overflow-hidden shadow-card">
          <div className="border-b border-brand-border/50 bg-brand-bg/50 px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="h-5 w-28 rounded bg-brand-border/35" />
              <div className="h-4 w-80 rounded bg-brand-border/30" />
            </div>
            <div className="h-10 w-40 rounded-full bg-brand-border/30" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border/50 bg-brand-bg/50">
                  <th className="p-5">
                    <div className="h-3 w-14 rounded bg-brand-border/35" />
                  </th>
                  <th className="p-5">
                    <div className="h-3 w-16 rounded bg-brand-border/35" />
                  </th>
                  <th className="p-5">
                    <div className="h-3 w-24 rounded bg-brand-border/35" />
                  </th>
                  <th className="p-5">
                    <div className="h-3 w-20 rounded bg-brand-border/35" />
                  </th>
                  <th className="p-5">
                    <div className="h-3 w-20 rounded bg-brand-border/35" />
                  </th>
                  <th className="p-5">
                    <div className="h-3 w-20 rounded bg-brand-border/35" />
                  </th>
                  <th className="p-5 text-right">
                    <div className="ml-auto h-3 w-20 rounded bg-brand-border/35" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="hover:bg-brand-bg/30">
                    <td className="p-5">
                      <div className="h-11 w-11 rounded-2xl bg-brand-border/30" />
                    </td>
                    <td className="p-5">
                      <div className="h-4 w-32 rounded bg-brand-border/35" />
                    </td>
                    <td className="p-5">
                      <div className="h-4 w-72 max-w-full rounded bg-brand-border/30" />
                    </td>
                    <td className="p-5">
                      <div className="h-4 w-32 rounded bg-brand-border/30" />
                    </td>
                    <td className="p-5">
                      <div className="h-4 w-28 rounded bg-brand-border/30" />
                    </td>
                    <td className="p-5">
                      <div className="h-4 w-36 rounded bg-brand-border/30" />
                    </td>
                    <td className="p-5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-8 w-16 rounded-lg bg-brand-border/30" />
                        <div className="h-8 w-16 rounded-lg bg-brand-border/30" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
