import { useWhaleTrace } from "../../hooks/useWhaleTrace";
import { WhaleSummaryBox } from "./WhaleSummaryBox";

// The Big investors tab's AI summary, in the shared whale summary box.
//
// The figures along the top are the ones the tiles above already show, passed in
// rather than refetched, so the header cannot disagree with them. Only the prose is
// fetched here. It ends with a "So this means" sentence saying what the reader can look
// into next, never what to do with the shares.

interface Props {
  ticker: string;
  /** Fractions, as the ownership endpoint returns them (0.863 is 86.3%). */
  institutionsPct: number | null;
  institutionsCount: number | null;
  insidersPct: number | null;
}

export function InstitutionalTracePanel({
  ticker,
  institutionsPct,
  institutionsCount,
  insidersPct,
}: Props) {
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
      figures={
        <FilingFigures
          institutionsPct={institutionsPct}
          institutionsCount={institutionsCount}
          insidersPct={insidersPct}
        />
      }
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
function FilingFigures({
  institutionsPct,
  institutionsCount,
  insidersPct,
}: Omit<Props, "ticker">) {
  const parts: string[] = [];
  if (institutionsPct != null) {
    parts.push(`${(institutionsPct * 100).toFixed(1)}% held by institutions`);
  }
  if (institutionsCount != null) {
    parts.push(
      `${institutionsCount.toLocaleString("en-US")} ${institutionsCount === 1 ? "institution" : "institutions"}`,
    );
  }
  if (insidersPct != null) {
    parts.push(`insiders ${(insidersPct * 100).toFixed(1)}%`);
  }
  if (!parts.length) return <>No headline figures in this filing.</>;
  return <>{parts.join(" · ")}</>;
}
