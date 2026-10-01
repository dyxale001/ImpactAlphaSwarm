import type { WhaleTransactionDTO } from "../../services/api/analysis";
import { useWhaleTrace } from "../../hooks/useWhaleTrace";
import { WhaleSummaryBox } from "./WhaleSummaryBox";
import { dealingFigures } from "./whaleFormat";

// The Insider trading tab's AI note, in the shared whale summary box.
//
// The figures line is counted from the dealings the tab has already loaded, passed in
// rather than refetched, so it cannot disagree with the list below it. Only the prose is
// fetched here: a short technical note naming the biggest dealing and how the market
// usually reads it, written once per set of filings and stored.

interface Props {
  ticker: string;
  transactions: WhaleTransactionDTO[];
}

export function InsiderTracePanel({ ticker, transactions }: Props) {
  const { trace, isLoading, error } = useWhaleTrace(ticker, "insiders");

  return (
    <WhaleSummaryBox
      trace={trace}
      isLoading={isLoading}
      error={error}
      headingPrefix="Dealings filed up to"
      fallbackHeading="Latest insider filings"
      ageTitle="Insiders report their dealings in filings after the trade, so part of any move may already have happened."
      badge="Insider filings"
      figures={dealingFigures(transactions)}
      footnote={{
        model:
          "Written by AI from this stock's latest insider filings. It describes what insiders did, not what you should do.",
        template:
          "Assembled from this stock's latest insider filings by a fixed template, because the AI summary could not be written. It describes what insiders did, not what you should do.",
      }}
    />
  );
}
