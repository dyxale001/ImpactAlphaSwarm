import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
    <div className="w-full max-w-[520px] rounded-xl bg-white p-5 shadow-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        Fund categories open to you
      </h3>

      <p className="mt-1.5 text-[13px] leading-relaxed text-forest-900">{preview.panel}</p>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <li
            key={category.code}
            className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-forest-900"
          >
            {category.name}
          </li>
        ))}
      </ul>

      {preview.bracket?.ceiling_label && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
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
        className="mt-3 inline-block text-[12px] font-semibold text-forest-900 hover:underline"
      >
        Explore them in Funds →
      </Link>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">{preview.not_licensed}</p>
    </div>
  );
}
