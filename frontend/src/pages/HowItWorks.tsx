import { useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SentimentMethodology from "../components/howItWorks/SentimentMethodology";
import QuantMethodology from "../components/howItWorks/QuantMethodology";
import RankingMethodology from "../components/howItWorks/RankingMethodology";
import { SCORECARD_ENABLED } from "../hooks/useDashboardStats";

// Transparency page: explains how everything shown on the analysis page is
// derived. Reached from the asset details page, so `ticker` is available for
// back-navigation context.
//
// Kept in step with the ordering the app actually uses: when the disclosed
// four-factor ranking is live the page leads with it, because "how is this
// calculated?" is then a question about placement, not about a single score. Under
// the legacy score the original framing is shown instead, so the page never
// describes something the user is not seeing.
export default function HowItWorks() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { hash } = useLocation();

  // Each card on the asset page links to its OWN explanation (#ranking,
  // #sentiment, #quant), so honour the hash on arrival. Browsers do not scroll to
  // an anchor that is rendered after the initial paint, hence doing it here.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-8 pb-20 pt-10 animate-fade-in-up">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm font-semibold text-brand-muted-fg transition-colors hover:text-brand-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        {ticker ? `Back to ${ticker.toUpperCase()} analysis` : "Back"}
      </button>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-brand-primary">
          How it works
        </p>
        <h1 className="text-3xl font-bold text-brand-fg">
          {SCORECARD_ENABLED
            ? "How these numbers are built"
            : "How we derive the score"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">
          {SCORECARD_ENABLED ? (
            <>
              Two independent engines measure every asset: a{" "}
              <span className="font-semibold text-brand-fg">Sentiment</span>{" "}
              signal (what people and the press are saying) and a set of{" "}
              <span className="font-semibold text-brand-fg">price</span>{" "}
              measurements (the technicals and risk). This page walks through how
              each measurement is produced, and how they decide the order of your
              list — so nothing about what you see is a black box.
            </>
          ) : (
            <>
              Every recommendation combines two independent engines: a{" "}
              <span className="font-semibold text-brand-fg">Sentiment</span>{" "}
              signal (what people and the press are saying) and a{" "}
              <span className="font-semibold text-brand-fg">Quantitative</span>{" "}
              signal (the technicals and risk). This page walks through exactly
              how each number is built, so nothing about the final score is a
              black box.
            </>
          )}
        </p>
      </div>

      {/* Ordering first: it is the question users are actually asking when they
          tap through from a card. */}
      {SCORECARD_ENABLED && <RankingMethodology />}
      <SentimentMethodology />
      <QuantMethodology />

      <p className="text-center text-[12px] text-brand-muted-fg">
        Scores are for research and education only and are not financial advice.
      </p>
    </div>
  );
}
