import { TAB_OVERVIEW, TAB_TONE, TAB_YOURS } from "../../data/compareCopy";

// The three panels under the written comparison: the price and listing figures,
// what people are saying, and the reader's own run. The stock page's section tabs
// (AnalysisTabs), copied rather than shared because that one is local to its page:
// an even grid on a phone so all three show, one pill from sm up.
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
      className="as-tabs grid w-full grid-cols-3 rounded-[20px] sm:inline-flex sm:w-auto sm:self-start sm:rounded-full"
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
          className="as-tab shrink-0 px-2 sm:px-4"
        >
          {LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
