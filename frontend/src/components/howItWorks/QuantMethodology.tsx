import { BarChart3, Calculator, Ruler, Tags, ShieldCheck } from "lucide-react";
import MethodologyCardHeader from "./MethodologyCardHeader";
import MethodologyStep from "./MethodologyStep";
import { RAW_METRICS, RSI_BANDS, BETA_BANDS } from "../../data/quantExplainers";

// The quantitative walkthrough. This replaced a "documentation coming soon"
// placeholder that promised to explain how the metrics "become a score" — which
// would now describe something the app deliberately no longer does. The quant layer
// produces disclosed facts (values, peer positions, definitional bands), not a
// composite rating.
//
// Metric definitions and band wording are imported from data/quantExplainers.ts —
// the same source the asset page uses — so this page cannot drift from the panel.
export default function QuantMethodology() {
  return (
    <div id="quant" className="soft-card w-full space-y-5 p-6" style={{ scrollMarginTop: "1.5rem" }}>
      <MethodologyCardHeader
        icon={BarChart3}
        title="The price measurements"
        subtitle="Facts about recent price behaviour, deliberately not a rating."
      />

      <div className="pt-1">
        <MethodologyStep n={1} icon={Calculator} title="Measure each asset">
          <p>
            For every asset we pull roughly a year of daily prices and compute a
            standard set of measurements using published formulas:
          </p>
          <ul className="mt-1 space-y-1.5">
            {RAW_METRICS.map((m) => (
              <li key={m.key}>
                <span className="font-semibold text-brand-fg">{m.label}</span>:{" "}
                {m.detail}
              </li>
            ))}
          </ul>
          <p>
            These are reproducible: the same window and the same formula give the
            same answer, whoever runs it.
          </p>
        </MethodologyStep>

        <MethodologyStep
          n={2}
          icon={Ruler}
          title="Compare against today's candidates"
        >
          <p>
            A raw number like a Sharpe ratio of 1.2 means little on its own, so we
            report{" "}
            <span className="font-semibold text-brand-fg">
              where it sits among the other assets analysed in the same run
            </span>, for example “78th percentile”. That is a factual count, not a
            judgement.
          </p>
          <p>
            Only measurements where “more” unambiguously means more of one thing
            are ranked this way: momentum, risk-adjusted return, and stability. If
            a run has too few comparable assets for a ranking to mean anything, we
            show the facts and say the ranking was not possible rather than
            inventing a position.
          </p>
        </MethodologyStep>

        <MethodologyStep n={3} icon={Tags} title="Report context, not verdicts">
          <p>
            Two measurements are deliberately{" "}
            <span className="font-semibold text-brand-fg">never ranked</span>,
            because for them “higher” is not “better”; both extremes are simply
            notable. They are shown as definitional labels instead:
          </p>
          <ul className="mt-1 space-y-1.5">
            <li>
              <span className="font-semibold text-brand-fg">RSI</span>:{" "}
              {Object.values(RSI_BANDS).join(" · ")}
            </li>
            <li>
              <span className="font-semibold text-brand-fg">Beta</span>:{" "}
              {Object.values(BETA_BANDS).join(" · ")}
            </li>
          </ul>
          <p>
            Saying “RSI 28 is in the conventional oversold range” is true by
            convention, much like saying 28°C is above room temperature. It is not
            a claim about what the price will do next.
          </p>
        </MethodologyStep>

        <MethodologyStep
          n={4}
          icon={ShieldCheck}
          title="Why there is no single quant score"
          isLast
        >
          <p>
            An earlier version folded these measurements into one quantitative
            score where higher meant better. We removed it. Rules such as
            “oversold, therefore add points” bundle a forecast and a value
            judgement into a single number, a recommendation dressed up as data.
          </p>
          <p>
            What remains is every underlying measurement, its position among
            today's candidates, and a plain-language explanation of what it
            measures, so you can form your own view.
          </p>
        </MethodologyStep>
      </div>
    </div>
  );
}
