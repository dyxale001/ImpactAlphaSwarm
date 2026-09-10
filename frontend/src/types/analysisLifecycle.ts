export type AnalysisLoadingStage = "preparing" | "processing" | "results";

export type AnalysisProgress = {
  phase: "initializing" | "analysis" | "synthesis" | "output" | "complete";
  message: string;
  active: string[];
  selected_assets?: number;
};

export type AnalysisStatus = {
  id: string;
  status: "running" | "complete" | "failed";
  created_at: string;
  progress: AnalysisProgress | null;
};

export function getAnalysisExecutionIdentity(runId: string, createdAt: string) {
  return `${runId}:${createdAt}`;
}
