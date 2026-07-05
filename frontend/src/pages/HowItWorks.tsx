import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SentimentMethodology from "../components/howItWorks/SentimentMethodology";
import QuantMethodology from "../components/howItWorks/QuantMethodology";

// Transparency page: explains exactly how the sentiment (and, later, quant)
// scores on the full analysis page are derived. Reached from the asset details
// page, so `ticker` is available for back-navigation context.
export default function HowItWorks() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();

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
          How we derive the score
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">
          Every recommendation combines two independent engines: a{" "}
          <span className="font-semibold text-brand-fg">Sentiment</span> signal
          (what people and the press are saying) and a{" "}
          <span className="font-semibold text-brand-fg">Quantitative</span>{" "}
          signal (the technicals and risk). This page walks through exactly how
          each number is built, so nothing about the final score is a black box.
        </p>
      </div>

      <SentimentMethodology />
      <QuantMethodology />

      <p className="text-center text-[12px] text-brand-muted-fg">
        Scores are for research and education only and are not financial advice.
      </p>
    </div>
  );
}
