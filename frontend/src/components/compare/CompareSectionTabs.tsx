import { TAB_OVERVIEW, TAB_TONE, TAB_YOURS } from "../../data/compareCopy";

// The three panels under the written comparison: the price and listing figures,
// what people are saying, and the reader's own run. The stock page's section tabs
// (AnalysisTabs), copied rather than shared because that one is local to its page:
// lime for the chosen tab, one pill that scrolls sideways rather than wrapping.
// The trace sits above these, outside any tab, because it speaks to all three.

export const COMPARE_TABS = ["overview", "tone", "yours"] as const;
export type CompareTab = (typeof COMPARE_TABS)[number];

export function isCompareTab(value: string | null): value is CompareTab {
  return (COMPARE_TABS as readonly string[]).includes(value ?? "");
}

const LABELS: Record<CompareTab, string> = {
  overview: TAB_OVERVIEW,
  tone: TAB_TONE,
  yours: TAB_YOURS,
};

export const tabId = (tab: CompareTab) => `compare-tab-${tab}`;
export const panelId = (tab: CompareTab) => `compare-panel-${tab}`;

export default function CompareSectionTabs({
  value,
  onChange,
}: {
  value: CompareTab;
  onChange: (tab: CompareTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Comparison sections"
      className="self-start inline-flex max-w-full items-center overflow-x-auto no-scrollbar rounded-full border border-brand-border/60 bg-brand-bg/55 p-0.5"
    >
      {COMPARE_TABS.map((tab) => (
        <button
          key={tab}
          id={tabId(tab)}
          type="button"
          role="tab"
          aria-selected={value === tab}
          aria-controls={panelId(tab)}
          onClick={(event) => {
            onChange(tab);
            event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
          }}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            value === tab ? "bg-brand-accent text-brand-fg" : "text-brand-muted-fg hover:text-brand-fg"
          }`}
        >
          {LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
