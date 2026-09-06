import { Check, Loader2, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { DECKS, isDeckId } from "../../../dashboard/decks";

/**
 * The edit-mode toolbar, pinned to the bottom of the viewport.
 *
 * Sticky rather than in the page flow: the widget being arranged can be anywhere
 * down a long dashboard, and a Done button at the very bottom would mean
 * scrolling past everything to finish.
 */
export default function EditModeBar({
  deck,
  widgetCount,
  isSaving,
  saveError,
  onAdd,
  onReset,
  onDone,
}: {
  deck: string | null;
  widgetCount: number;
  isSaving: boolean;
  saveError: string | null;
  onAdd: () => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const deckName = deck && isDeckId(deck) ? DECKS[deck].name : null;

  return (
    <div className="sticky bottom-4 z-50 mx-auto w-fit max-w-full px-4">
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-brand-border/60 bg-brand-card/95 px-3 py-2 shadow-xl backdrop-blur-xl">
        <span className="hidden px-2 text-[11px] text-brand-muted-fg sm:inline">
          {widgetCount} widget{widgetCount === 1 ? "" : "s"}
        </span>

        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1.5 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a widget
        </button>

        {/* Only offered when there is a deck to go back to. Someone who started
            from scratch has no "my deck" to reset to, and a button that would
            silently pick one for them is worse than no button. */}
        {deckName ? (
          <button
            type="button"
            onClick={onReset}
            title={`Put back the widgets from ${deckName}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-border/60 px-3 py-1.5 text-xs font-medium text-brand-muted-fg transition-colors hover:border-brand-primary/40 hover:text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to {deckName}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-brand-bg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          <Check className="h-3.5 w-3.5" />
          Done
        </button>

        {/* Saving is debounced and usually invisible. It only earns space here
            when it is in flight or has failed. */}
        {isSaving ? (
          <span className="inline-flex items-center gap-1.5 px-2 text-[11px] text-brand-muted-fg">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving
          </span>
        ) : null}
        {saveError ? (
          <span className="inline-flex items-center gap-1.5 px-2 text-[11px] text-semantic-danger">
            <TriangleAlert className="h-3 w-3" />
            Not saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
