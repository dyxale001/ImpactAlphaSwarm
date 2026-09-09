import { Check, Loader2 } from "lucide-react";
import type {
  AnalysisLoadingStage,
  AnalysisProgress,
} from "../../types/analysisLifecycle";

type MilestoneStatus = "complete" | "active" | "pending";

type AnalysisMilestone = {
  id: string;
  label: string;
  status: MilestoneStatus;
};

type AnalysisMilestoneGroup = {
  id: AnalysisLoadingStage;
  items: AnalysisMilestone[];
};

function getCurrentMilestoneGroup(
  stage: AnalysisLoadingStage,
  progress: AnalysisProgress | null | undefined,
) {
  const phase = progress?.phase;
  const activeBranches = new Set(progress?.active ?? []);
  const selectedMessage = progress?.message.startsWith("Selected ") ?? false;
  const analysisStarted = phase === "analysis";
  const synthesisStarted = phase === "synthesis";
  const outputStarted = phase === "output";
  const complete = phase === "complete";

  const preparingStatus: MilestoneStatus =
    selectedMessage ||
    analysisStarted ||
    synthesisStarted ||
    outputStarted ||
    complete
      ? "complete"
      : phase === "initializing"
        ? "active"
        : "pending";
  const branchStatus = (branch: string): MilestoneStatus => {
    if (synthesisStarted || outputStarted || complete) return "complete";
    if (analysisStarted && !activeBranches.has(branch)) return "complete";
    if (analysisStarted && activeBranches.has(branch)) return "active";
    return "pending";
  };

  const groups: AnalysisMilestoneGroup[] = [
    {
      id: "preparing",
      items: [
        {
          id: "preparing",
          label: "Preparing your analysis",
          status: preparingStatus,
        },
      ],
    },
    {
      id: "processing",
      items: [
        {
          id: "quant",
          label: "Analysing market data",
          status: branchStatus("quant"),
        },
        {
          id: "sentiment",
          label: "Analysing sentiment",
          status: branchStatus("sentiment"),
        },
        {
          id: "synthesis",
          label: "Synthesising results",
          status:
            complete || outputStarted
              ? "complete"
              : synthesisStarted
                ? "active"
                : "pending",
        },
        {
          id: "output",
          label: "Preparing results",
          status: complete ? "complete" : outputStarted ? "active" : "pending",
        },
      ],
    },
    {
      id: "results",
      items: [
        {
          id: "results",
          label: "Loading results",
          status: stage === "results" ? "active" : "pending",
        },
      ],
    },
  ];

  return groups.find((group) => group.id === stage);
}

const STAGES: ReadonlyArray<{ id: AnalysisLoadingStage; label: string }> = [
  { id: "preparing", label: "Preparing analysis" },
  { id: "processing", label: "Processing analysis" },
  { id: "results", label: "Loading results" },
];

interface AssetsAnalysisLoadingProps {
  stage: AnalysisLoadingStage;
  progress?: AnalysisProgress | null;
}

export default function AssetsAnalysisLoading({
  stage,
  progress,
}: AssetsAnalysisLoadingProps) {
  const activeIndex = STAGES.findIndex((item) => item.id === stage);

  return (
    <div
      className="relative max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-10"
      aria-busy="true"
    >
      <div className="pointer-events-none fixed inset-y-0 left-0 lg:left-64 right-0 z-30 flex items-center justify-center px-4 sm:px-6">
        <section className="w-full max-w-lg space-y-4 rounded-lg border border-brand-border bg-brand-card p-4 sm:p-6 text-center text-brand-fg">
          <div
            role="status"
            aria-atomic="true"
            className="flex items-center justify-center gap-2"
          >
            <Loader2
              className="h-4 w-4 shrink-0 text-brand-primary motion-safe:animate-spin"
              aria-hidden="true"
            />
            <h1 className="text-sm font-semibold text-brand-fg">
              {STAGES[activeIndex].label}
            </h1>
          </div>
          <ol
            className="grid grid-cols-3 gap-3 sm:gap-5"
            aria-label="Analysis lifecycle"
          >
            {STAGES.map((item, index) => {
              const complete = index < activeIndex;
              const active = index === activeIndex;
              return (
                <li
                  key={item.id}
                  aria-current={active ? "step" : undefined}
                  className="space-y-2"
                >
                  <div
                    aria-hidden="true"
                    className={`h-1 rounded-full ${
                      complete
                        ? "bg-brand-primary"
                        : active
                          ? "bg-brand-primary/60"
                          : "bg-brand-border/30"
                    }`}
                  />
                  <div
                    className={`flex items-start justify-center gap-2 text-xs ${active || complete ? "text-brand-fg" : "text-brand-muted-fg"}`}
                  >
                    {complete ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-brand-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${active ? "bg-brand-primary" : "bg-brand-border/40"}`}
                      />
                    )}
                    <span>
                      {item.label}
                      <span className="sr-only">
                        {" "}
                        —{" "}
                        {complete ? "complete" : active ? "active" : "pending"}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="space-y-1 border-t border-brand-border/60 pt-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-muted-fg">
              Live analysis
            </p>
            <div className="space-y-2" aria-live="polite">
              {(() => {
                const currentDetailGroup = getCurrentMilestoneGroup(
                  stage,
                  progress,
                );

                return currentDetailGroup ? (
                  <ul className="space-y-1.5">
                    {currentDetailGroup.items.map((milestone) => (
                      <li
                        key={milestone.id}
                        className={`flex items-center gap-2 text-[11px] leading-relaxed ${
                          milestone.status === "complete"
                            ? "text-brand-primary"
                            : milestone.status === "active"
                              ? "font-semibold text-brand-primary"
                              : "text-brand-muted-fg/60"
                        }`}
                      >
                        {milestone.status === "complete" ? (
                          <Check
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              milestone.status === "active"
                                ? "bg-brand-primary"
                                : "bg-brand-border/40"
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <span>{milestone.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null;
              })()}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-brand-muted-fg">
            Combining market signals and sentiment into personalised results.
            This may take a few minutes—results appear automatically.
          </p>
        </section>
      </div>

      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div aria-hidden="true" className="hero-card px-5 sm:px-7 py-6">
          <div className="space-y-3">
            <div className="h-3 w-40 rounded bg-white/15" />
            <div className="h-8 w-36 rounded bg-white/15" />
            <div className="h-4 w-full max-w-2xl rounded bg-white/10" />
            <div className="h-7 w-64 max-w-full rounded-full bg-white/10" />
          </div>
        </div>
        {/* Decorative placeholders mirror the Assets top pick, shortlist and ranked rows. */}
        <div aria-hidden="true" className="mt-6 space-y-6">
          <div className="hero-card p-6">
            <div className="h-3 w-32 rounded bg-white/15 mb-4" />
            <div className="grid gap-6 md:grid-cols-[200px_1fr]">
              <div className="h-48 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="h-full rounded-xl bg-white/10" />
              </div>
              <div className="space-y-3 min-w-0">
                <div className="h-7 w-24 rounded bg-white/15" />
                <div className="h-6 w-40 rounded-full bg-white/10" />
                <div className="h-6 w-28 rounded bg-white/15" />
                <div className="h-16 rounded-xl bg-white/10" />
                <div className="h-9 w-36 rounded-full bg-white/10" />
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="rounded-lg border border-brand-border/40 bg-brand-bg/70 p-4 space-y-3"
              >
                <div className="h-5 w-20 rounded bg-brand-border/35" />
                <div className="h-3 w-3/4 rounded bg-brand-border/25" />
                <div className="h-20 rounded-xl bg-brand-border/20" />
                <div className="h-3 w-full rounded bg-brand-border/25" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-brand-border/40 bg-brand-bg/60 divide-y divide-brand-border/40 px-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-5 py-5">
                <div className="h-4 w-12 rounded bg-brand-border/30" />
                <div className="h-4 flex-1 rounded bg-brand-border/20" />
                <div className="h-6 w-20 rounded-full bg-brand-border/25" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
