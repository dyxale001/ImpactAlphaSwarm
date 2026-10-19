import { useWhaleTrace } from "../../hooks/useWhaleTrace";
import { WhaleSummaryBox } from "./WhaleSummaryBox";

// The Big investors tab's AI summary, in the shared whale summary box. Only the prose
// is fetched here; the headline figures sit in the tiles right above it, so the box
// does not repeat them. It ends with a "So this means" sentence saying what the reader
// can look into next, never what to do with the shares.

export function InstitutionalTracePanel({ ticker }: { ticker: string }) {
  const { trace, isLoading, error } = useWhaleTrace(ticker, "institutions");

  return (
    <WhaleSummaryBox
      trace={trace}
      isLoading={isLoading}
      error={error}
      headingPrefix="Holdings as of"
      fallbackHeading="Latest 13F filing"
      ageTitle="Funds report once a quarter, up to 45 days after it ends, so they may have traded since."
      badge="13F filing"
      footnote={{
        model:
          "Written by AI from this stock's latest 13F filing. It describes who reported owning the stock, not the share price.",
        template:
          "Assembled from this stock's latest 13F filing by a fixed template, because the AI summary could not be written. It describes who reported owning the stock, not the share price.",
      }}
    />
  );
}

// The filing's headline figures, in the order the tiles above show them.
