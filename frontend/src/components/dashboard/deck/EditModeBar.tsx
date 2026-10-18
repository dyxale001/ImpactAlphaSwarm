import { Check, Loader2, Plus, TriangleAlert } from "lucide-react";

/**
 * The edit-mode toolbar, pinned to the bottom of the viewport.
 *
 * Sticky rather than in the page flow: the widget being arranged can be anywhere
 * down a long dashboard, and a Done button at the very bottom would mean
 * scrolling past everything to finish.
 */
export default function EditModeBar({
  widgetCount,
  isSaving,
  saveError,
  onAdd,
  onDone,
}: {
  widgetCount: number;
  isSaving: boolean;
  saveError: string | null;
  onAdd: () => void;
  onDone: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-50 mx-auto w-fit max-w-full px-4">
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-forest-900/10 bg-white/95 px-3 py-2 shadow-float backdrop-blur-xl">
        <span className="hidden px-2 text-xs text-brand-muted-fg sm:inline">
          {widgetCount} widget{widgetCount === 1 ? "" : "s"}
        </span>

        <button
          type="button"
          onClick={onAdd}
          className="as-btn as-btn-sm as-btn-lime"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a widget
        </button>

        <button
          type="button"
          onClick={onDone}
          className="as-btn as-btn-sm as-btn-primary"
        >
          <Check className="h-3.5 w-3.5" />
          Done
        </button>

        {/* Saving is debounced and usually invisible. It only earns space here
            when it is in flight or has failed. */}
        {isSaving ? (
          <span className="inline-flex items-center gap-1.5 px-2 text-xs text-brand-muted-fg">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving
          </span>
        ) : null}
        {saveError ? (
          <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold text-down">
            <TriangleAlert className="h-3 w-3" />
            Not saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
