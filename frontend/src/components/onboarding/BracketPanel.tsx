import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { previewBracket, type BracketPreview } from "../../services/api/fundCatalogue";

/**
 * What the answers just given map to, shown at the end of onboarding.
 *
 * The categories are computed by the server, running the same matcher the
 * `/funds` page runs. Deriving them in the browser instead would be quicker and
 * would eventually disagree with the page it points at — and a bracket promised
 * here but not honoured there is worse than no panel.
 *
 * Nothing is saved to produce this. The answers travel with the request and a
 * user who abandons onboarding leaves nothing behind.
 *
 * The wording is the reviewed wording and describes a filter over labels other
 * people published. An earlier draft headed this "Where someone like you might
 * start"; "might start" is a soft proposal, and a proposal is precisely what
 * this product is not licensed to make.
 */
export default function BracketPanel({
  riskTolerance,
  goals,
}: {
  riskTolerance: string;
  goals: Record<string, string> | null;
}) {
  const [preview, setPreview] = useState<BracketPreview | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await previewBracket(riskTolerance, goals);
        if (!cancelled) setPreview(res);
      } catch (e) {
        // The panel is an extra at the end of a form that has already done its
        // job. Losing it must never block finishing onboarding.
        console.error("Could not preview the fund bracket:", e);
        if (!cancelled) setPreview(null);
      }
    }

    if (riskTolerance) load();
    return () => {
      cancelled = true;
    };
  }, [riskTolerance, JSON.stringify(goals)]);

  const categories = preview?.bracket?.categories ?? [];
  if (!preview || categories.length === 0) return null;

  return (
    <div className="as-card p-5 sm:p-6">
      <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">Fund categories open to you</h2>

      <p className="mt-1.5 text-sm leading-relaxed text-forest-900">{preview.panel}</p>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <li key={category.code} className="chip chip-line">
            {category.name}
          </li>
        ))}
      </ul>

      {preview.bracket?.ceiling_label && (
        <p className="mt-3 text-xs leading-relaxed text-brand-muted-fg">
          Funds are included when the manager's own published risk label is{" "}
          <span className="font-semibold text-forest-900">
            {preview.bracket.ceiling_label}
          </span>{" "}
          or lower. {preview.match_count > 0
            ? `${preview.match_count} of the funds we cover qualify today.`
            : "No fund we cover qualifies today."}
        </p>
      )}

      <Link
        to="/funds"
        className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-forest-700 hover:underline"
      >
        Explore them in Funds <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>

      <p className="mt-3 text-xs leading-relaxed text-brand-muted-fg">{preview.not_licensed}</p>
    </div>
  );
}
