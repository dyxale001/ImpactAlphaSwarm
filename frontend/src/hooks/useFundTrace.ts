import { useCallback, useEffect, useRef, useState } from "react";
import { explainFundTrace, type FundTraceResponse } from "../services/api/fundCatalogue";
import { FUND_TRACE_EMPTY, FUND_TRACE_FAILED } from "../utils/fundsCopy";

// One fund's reasoning trace: personal, and written on command, the way the
// Compare page's paragraph is (useComparisonTrace).
//
// Nothing is stored. The panel opens on the button, and `explain` asks the
// server to write a fresh paragraph; it lives in this page's state until the
// reader leaves, and a later visit starts from the button again.

/** `write` asks the server for the paragraph. The catalogue's endpoint unless
 *  given; a reader's uploaded fund passes its own. Keep it stable (a module
 *  function), since a new one each render would re-create `explain`. */
export function useFundTrace(
  fundId: string | undefined,
  write: (fundId: string) => Promise<FundTraceResponse> = explainFundTrace,
) {
  const [trace, setTrace] = useState<FundTraceResponse | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The fund the latest answer belongs to, so a slow reply for the fund the
  // reader just left never lands on the one they opened next.
  const current = useRef(fundId);

  useEffect(() => {
    current.current = fundId;
    setTrace(null);
    setError(null);
    setIsWriting(false);
  }, [fundId]);

  const explain = useCallback(() => {
    if (!fundId) return;
    const asked = fundId;
    setIsWriting(true);
    setError(null);
    write(asked)
      .then((res) => {
        if (current.current !== asked) return;
        setTrace(res);
        if (res.available && !res.trace) setError(FUND_TRACE_EMPTY);
      })
      .catch((e) => {
        if (current.current !== asked) return;
        console.error("Error writing the fund trace:", e);
        setError(FUND_TRACE_FAILED);
      })
      .finally(() => {
        if (current.current === asked) setIsWriting(false);
      });
  }, [fundId, write]);

  return { trace, isWriting, error, explain };
}
