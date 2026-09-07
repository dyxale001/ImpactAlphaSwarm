import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FactsheetCrop } from "../../services/api/adminFundCatalogue";

/**
 * Pictures of the blocks on the sheet a person still has to read themselves.
 *
 * Two fields on a fact sheet are never text. The risk profile is a five-step
 * scale with the applicable step shaded, and the asset allocation is a chart.
 * Every reader refuses both — a pattern cannot see them, and the model-based
 * reader's quote check refuses them too, because a graphic has no line of text
 * to quote. So they arrive blank, with a reason that amounts to "open the PDF".
 *
 * That instruction was the real cost of the whole design: recording one sheet
 * meant finding a fee block inside a two-page document and reading a figure out
 * of a two-column table. This puts the block on the screen instead.
 *
 * **The crops carry their own headings, and that is the point rather than a
 * detail.** A fee table cropped on its row label is an image of `0.25 0.25`
 * with nothing above it — or, worse, `0.33 0.32`, which looks like a decision
 * and is not one. The backend's bands are measured to reach past the header row
 * and past the end of a chart's categories.
 *
 * Open by default. A review aid behind a click is a review aid nobody uses, and
 * the fields these belong to are blank on the form right now.
 */
export default function FactsheetCrops({ crops }: { crops: FactsheetCrop[] }) {
  const [open, setOpen] = useState(true);

  if (crops.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-brand-border/50 bg-brand-bg/40 p-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-left text-xs font-bold text-brand-primary"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        From the sheet itself ({crops.length})
      </button>

      {open && (
        <>
          <p className="text-[11px] leading-relaxed text-brand-secondary/70">
            The blocks these figures come from, cut out of the document. Nothing here was read
            for you — the risk scale and the allocation chart are drawn rather than written, so
            they have to be read by a person.
          </p>
          <div className="space-y-3">
            {crops.map((crop) => (
              <figure key={`${crop.field}-${crop.page}`} className="space-y-1">
                <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-brand-secondary/80">
                    {crop.label}
                  </span>
                  <span className="text-[10px] text-brand-secondary/60">page {crop.page}</span>
                </figcaption>
                {/* Scrolls inside its own box: these are full page width at 2x,
                    so on a narrow screen the alternative is a page that scrolls
                    sideways. */}
                <div className="overflow-x-auto rounded border border-brand-border/40 bg-white">
                  <img
                    src={`data:image/png;base64,${crop.png_base64}`}
                    alt={`${crop.label}, from page ${crop.page} of the fact sheet`}
                    className="block max-w-none"
                  />
                </div>
                {crop.note && (
                  <p className="text-[10px] leading-relaxed text-brand-secondary/60">
                    {crop.note}
                  </p>
                )}
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
