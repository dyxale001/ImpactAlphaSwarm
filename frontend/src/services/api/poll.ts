import type { AnalysisStatus } from "../../types/analysisLifecycle";

export async function pollUntilComplete(
  runId: string,
  getStatus: (id: string) => Promise<AnalysisStatus>,
  getResult: (id: string) => Promise<any>,
  onProgress?: (status: AnalysisStatus) => void,
  intervalMs = 3000,
) {
  while (true) {
    let s: AnalysisStatus;
    try {
      s = await getStatus(runId);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    onProgress?.(s);
    if (s.status === "complete") return await getResult(runId);
    if (s.status === "failed") throw new Error("analysis failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
