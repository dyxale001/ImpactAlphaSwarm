import LearnPopover from '../components/learning/LearnPopover';
import { useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  METHODOLOGY_CAVEAT,
  METHODOLOGY_SECTIONS,
} from "../components/howItWorks/methodologySections";
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
    // Reading width (768px) inside the shared 1280px frame, pinned to the same
    // left edge as every other page rather than centred.
    <div className="mx-auto max-w-7xl *:max-w-3xl space-y-8 px-4 sm:px-6 lg:px-8 pb-20 pt-6 lg:pt-10 animate-fade-in-up">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm font-semibold text-brand-muted-fg transition-colors hover:text-brand-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        {ticker ? `Back to ${ticker.toUpperCase()} analysis` : "Back"}
      </button>

      <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold text-brand-muted-fg">
          How it works
        </p>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em] text-forest-900">
          {SCORECARD_ENABLED
            ? "How these numbers are built"
            : "How we derive the score"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">
          {SCORECARD_ENABLED ? (
            <>
              Two independent engines measure every stock: a{" "}
              <span className="font-semibold text-brand-fg">Sentiment</span>{" "}
              signal (what people and the press are saying) and a set of{" "}
              <span className="font-semibold text-brand-fg">price</span>{" "}
              measurements (the technicals and risk). This page walks through how
              each measurement is produced, and how they decide the order of your
              list, so nothing about what you see is a black box.
            </>
          ) : (
            <>
              Each asset analysis combines two independent engines: a{" "}
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
      {/* The lessons behind the book button, as on the stock page. */}
      <LearnPopover context="stock.methodology" className="shrink-0" />
      </header>

      {/* The same sections the stock page's "How is this calculated?" dialog shows
          one at a time, stacked, with the ordering first: it is the question users
          are actually asking when they tap through from a card. */}
      {METHODOLOGY_SECTIONS.map(({ key, title, Content }) => (
        <section
          key={key}
          id={key}
          aria-labelledby={`${key}-title`}
          className="as-card space-y-8 p-5 sm:p-6"
          style={{ scrollMarginTop: "1.5rem" }}
        >
          <h2 id={`${key}-title`} className="text-xl font-bold tracking-[-0.01em] text-forest-900">
            {title}
          </h2>
          <Content />
        </section>
      ))}

      <p className="text-xs leading-relaxed text-brand-muted-fg">{METHODOLOGY_CAVEAT}</p>
    </div>
  );
}
