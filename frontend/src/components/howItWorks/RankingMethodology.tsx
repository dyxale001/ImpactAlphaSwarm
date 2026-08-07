import { ListOrdered, Gauge, Scale, Layers, UserCheck, Info } from "lucide-react";
import MethodologyCardHeader from "./MethodologyCardHeader";
import MethodologyStep from "./MethodologyStep";
import { TERM_COPY, CONVERGENCE_HEADLINE } from "../../data/signalCopy";

// How the list is ORDERED. This is the page's most important section: the app no
// longer publishes a single 0-100 score, so "how is this calculated?" is really a
// question about the four factors that decide placement.
//
// Copy comes from data/signalCopy.ts — the same source the dashboard scorecard
// uses — so this page can never drift from what the cards actually say.
export default function RankingMethodology() {
  const terms = [
    { key: "signal_strength" as const, icon: Gauge },
    { key: "convergence" as const, icon: Scale },
    { key: "data_sufficiency" as const, icon: Layers },
    { key: "profile_fit" as const, icon: UserCheck },
  ];

  return (
    <div id="ranking" className="soft-card w-full space-y-5 p-6" style={{ scrollMarginTop: "1.5rem" }}>
      <MethodologyCardHeader
        icon={ListOrdered}
        title="How the list is ordered"
        subtitle="Four measurements decide placement. There is no single overall score."
      />

      <div className="rounded-2xl border border-brand-border/50 bg-brand-bg/40 px-4 py-3">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-brand-muted-fg">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
          <span>
            We deliberately do <span className="font-semibold text-brand-fg">not</span>{" "}
            give an asset one overall grade. A single number reads as a verdict on
            the asset's quality, and that judgement is not one this app makes.
            Instead the four measurements below are shown to you, and their
            combination decides only the <em>order</em> of the list.
          </span>
        </p>
      </div>

      <div className="pt-1">
        {terms.map(({ key, icon }, i) => (
          <MethodologyStep
            key={key}
            n={i + 1}
            icon={icon}
            title={`${TERM_COPY[key].label}: ${TERM_COPY[key].question}`}
            isLast={i === terms.length - 1}
          >
            <p>{TERM_COPY[key].detail}</p>
          </MethodologyStep>
        ))}
      </div>

      <div className="space-y-3 border-t border-brand-border/50 pt-5">
        <p className="text-sm font-semibold text-brand-fg">
          How the four are combined
        </p>
        <p className="text-sm leading-relaxed text-brand-muted-fg">
          The four are multiplied together, so a weak reading on any one of them
          pulls an asset down rather than being averaged away. Price data and
          news/social tone are weighted equally when measuring strength and
          agreement.
        </p>
        <p className="text-sm leading-relaxed text-brand-muted-fg">
          The headline you see on a card, for example “
          {CONVERGENCE_HEADLINE.agree_strongly}” or “
          {CONVERGENCE_HEADLINE.conflict}”, is the agreement reading in words.
          When the two signals contradict each other the asset moves{" "}
          <span className="font-semibold text-brand-fg">down</span> the list, and
          we say so rather than quietly adjusting the number.
        </p>
        <div className="rounded-2xl border border-brand-border/50 bg-brand-bg/40 px-4 py-3">
          <p className="text-sm leading-relaxed text-brand-muted-fg">
            <span className="font-semibold text-brand-fg">
              What is objective here, and what is not.
            </span>{" "}
            The measurements are reproducible: given the same public price and
            news data, anyone applying the same published formulas gets the same
            numbers. How those measurements are weighted against each other is our
            editorial choice, so we show it to you instead of claiming it is
            objective. Nothing on this page predicts a future price.
          </p>
        </div>
      </div>
    </div>
  );
}
