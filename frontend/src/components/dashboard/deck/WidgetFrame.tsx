import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react";
import { SIZE_LABEL, type WidgetSize } from "../../../dashboard/layoutSchema";
import type { WidgetDef } from "../../../dashboard/widgetRegistry";
import { WidgetSlots } from "../widgets/widgetChrome";

/**
 * The chrome around one widget: its title, and in edit mode the controls that
 * move, resize and remove it.
 *
 * Reordering is native HTML5 drag-and-drop rather than a library. framer-motion
 * is already a dependency and ships a Reorder primitive, but Reorder is
 * one-dimensional and this is a two-dimensional bento grid; the grid is
 * flow-based, so a drop is only ever an array move. framer-motion is still used
 * here, but only for the `layout` prop that animates the reflow after that move.
 *
 * The drag handlers themselves live on the plain wrapper the dashboard renders
 * around this, NOT on the motion element: framer-motion claims `onDragStart` and
 * `onDragEnd` for its own pan gestures and consumes them before they reach the
 * DOM, so native drag handlers passed here would silently never fire.
 *
 * HTML5 drag fires on neither touch nor the keyboard, so the arrow buttons below
 * are not a fallback: on a phone and for a keyboard user they ARE the control,
 * and drag is the enhancement on top.
 */
export default function WidgetFrame({
  def,
  size,
  subtitle,
  index,
  total,
  isEditing,
  isDragging,
  isDropTarget,
  onMove,
  onCycleSize,
  onRemove,
  children,
}: {
  def: WidgetDef;
  size: WidgetSize;
  /** Shown after the title, e.g. the asset a ticker-scoped widget watches, so
   *  two copies of one widget read differently in the header. */
  subtitle?: string | null;
  index: number;
  total: number;
  isEditing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onMove: (to: number) => void;
  onCycleSize: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const Icon = def.icon;
  // Two places in the header a widget fills from inside itself: the stock it
  // watches (a picker, before the subtitle) and its way out to the full page
  // (top right), so every card's header reads title, context, link.
  const [subtitleSlot, setSubtitleSlot] = useState<HTMLElement | null>(null);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);

  // A widget drawing its own surface must not sit inside a second card, or it
  // reads as a panel bolted onto a panel.
  const surface = def.bare ? "" : "as-card p-5";

  return (
    <motion.section
      layout={reduceMotion ? false : "position"}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      aria-label={def.title}
      className={[
        "relative flex h-full flex-col gap-3 transition-shadow",
        surface,
        isEditing
          ? "rounded-[20px] outline-2 outline-dashed outline-offset-2 outline-lime-600"
          : "",
        isDropTarget && !isDragging ? "outline-forest-700" : "",
        isDragging ? "opacity-40" : "",
        isEditing ? "cursor-grab active:cursor-grabbing" : "",
      ].join(" ")}
    >
      {isEditing ? (
        <header className="flex items-center gap-2 border-b border-forest-900/8 pb-2">
          {/* Decorative: the whole card is the drag target, so the grip is a
              signal that it can be dragged rather than the only place to grab. */}
          <GripVertical
            className="h-4 w-4 shrink-0 text-brand-muted-fg"
            aria-hidden="true"
          />
          <Icon className="h-4 w-4 shrink-0 text-forest-700" />
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-forest-900">
            {def.title}
            {subtitle ? (
              <span className="font-normal text-brand-muted-fg"> · {subtitle}</span>
            ) : null}
          </span>

          <div className="flex shrink-0 items-center gap-1">
            {/* Move buttons carry the whole of reordering on touch and keyboard. */}
            <button
              type="button"
              onClick={() => onMove(index - 1)}
              disabled={index === 0}
              aria-label={`Move ${def.title} earlier`}
              className="rounded-full p-1 text-brand-muted-fg transition-colors hover:bg-forest-50 hover:text-forest-900 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(index + 1)}
              disabled={index === total - 1}
              aria-label={`Move ${def.title} later`}
              className="rounded-full p-1 text-brand-muted-fg transition-colors hover:bg-forest-50 hover:text-forest-900 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-700"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {/* One button that steps through the sizes this widget offers,
                rather than three that are mostly disabled. */}
            {def.sizes.length > 1 ? (
              <button
                type="button"
                onClick={onCycleSize}
                aria-label={`Resize ${def.title}, currently ${size}`}
                title={`Size: ${size}`}
                className="chip chip-dark cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-700"
              >
                {SIZE_LABEL[size]}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${def.title}`}
              className="rounded-full p-1 text-brand-muted-fg transition-colors hover:bg-down-bg hover:text-down focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>
      ) : !def.bare ? (
        // The artifacts' card header: the title, a line saying what it is (with
        // the stock picker in front of it on a ticker widget), and the way to
        // the full page on the right.
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">{def.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-brand-muted-fg">
              <span ref={setSubtitleSlot} className="inline-flex empty:hidden" />
              {def.sub ? <span>{def.sub}</span> : null}
            </p>
          </div>
          <span ref={setActionSlot} className="inline-flex shrink-0 empty:hidden" />
        </header>
      ) : null}

      {/* flex-1 so the content owns the rest of the card's height rather than
          hugging its own. A widget sharing a grid row with a taller neighbour is
          stretched to that row, and without this its dashed empty state stopped
          at its own text with bare card below it. min-h-0 undoes the automatic
          min-height flex items get, which would otherwise stop the wrapper ever
          being shorter than its content.

          Dimmed in edit mode so the controls read as the active layer, and inert
          so a click meant for the frame cannot follow a link out of the page. */}
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          isEditing ? "pointer-events-none opacity-60" : ""
        }`}
        inert={isEditing ? true : undefined}
      >
        <WidgetSlots.Provider value={{ subtitle: isEditing ? null : subtitleSlot, action: isEditing ? null : actionSlot }}>
          {children}
        </WidgetSlots.Provider>
      </div>
    </motion.section>
  );
}
