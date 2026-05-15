// simple poll helper
export async function pollUntilComplete(
  runId: string,
  getStatus: (id: string) => Promise<any>,
  getResult: (id: string) => Promise<any>,
  onProgress?: (status: string) => void,
  intervalMs = 3000
) {
  while (true) {
    const s = await getStatus(runId);
    const status = s.status ?? s?.status;
    onProgress?.(status);
    if (status === "complete") return await getResult(runId);
    if (status === "failed") throw new Error("analysis failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}