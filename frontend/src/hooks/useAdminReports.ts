import { useCallback, useEffect, useState } from "react";
import type { ReportRange } from "../services/api/adminReports";

export function useAdminReport<T>(
  fetcher: (range: ReportRange) => Promise<T>,
  range: ReportRange,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher(range);
      setData(result);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [fetcher, range]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
