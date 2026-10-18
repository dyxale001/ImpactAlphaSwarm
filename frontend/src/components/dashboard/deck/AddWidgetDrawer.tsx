import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import {
  WIDGET_GROUPS,
  type WidgetDef,
  type WidgetGroup,
} from "../../../dashboard/widgetRegistry";

/**
 * The widget library, as a sheet from the right.
 *
 * Grouped by where the data comes from rather than listed flat, because the
 * groups are how a reader already thinks about this app: the sidebar has a
 * watchlist, a whale-watching page and a learning centre, and these are the
 * pieces of those. Each entry carries its blurb, since a title alone does not
 * tell anyone whether "Also scored" is worth the space.
 */
export default function AddWidgetDrawer({
  open,
  available,
  placed,
  onAdd,
  onClose,
}: {
  open: boolean;
  available: WidgetDef[];
  /** Widget ids already on the board. A ticker-scoped widget stays in the list
   *  while placed, and this is what lets its row say so. */
  placed?: Set<string>;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes it, and focus moves in when it opens, so a keyboard user is
  // not left tabbing through the page behind.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const byGroup = WIDGET_GROUPS.map((group: WidgetGroup) => ({
    group,
    widgets: available.filter((w) => w.group === group),
  })).filter((g) => g.widgets.length > 0);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        aria-label="Close widget library"
        onClick={onClose}
        className="absolute inset-0 bg-forest-950/30 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add a widget"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-forest-900/10 bg-white shadow-float focus:outline-none"
      >
        {/* A light header like the platform's dialogs: one dark surface per page,
            and that is the page's own header behind this sheet. */}
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-forest-900/8 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">Add a widget</h2>
            <p className="mt-1 text-xs text-brand-muted-fg">
              {available.length === 0
                ? "Everything is placed"
                : `${available.length} available`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-brand-muted-fg transition-colors hover:bg-forest-50 hover:text-forest-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 px-5 py-5">
          {byGroup.length === 0 ? (
            <p className="text-xs leading-relaxed text-brand-muted-fg">
              You have every widget placed. Remove one to see it here again.
            </p>
          ) : (
            byGroup.map(({ group, widgets }) => (
              <section key={group} className="space-y-2">
                <h3 className="text-sm font-bold text-forest-900">{group}</h3>
                {widgets.map((widget) => {
                  const Icon = widget.icon;
                  return (
                    <button
                      key={widget.id}
                      type="button"
                      onClick={() => onAdd(widget.id)}
                      className="group flex w-full items-start gap-3 rounded-[14px] border border-forest-900/10 bg-white p-3 text-left transition-colors hover:border-forest-700 hover:bg-forest-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-forest-50 text-forest-700 transition-colors group-hover:bg-lime-500 group-hover:text-forest-800">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-forest-900">
                          {widget.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-brand-muted-fg">
                          {widget.blurb}
                        </span>
                        {widget.needsTicker ? (
                          <span className="mt-1.5 inline-flex flex-wrap gap-1">
                            <span className="chip chip-dark">
                              Picks its own stock
                            </span>
                            {/* Already on the board, and offered again on
                                purpose: another copy can watch another asset. */}
                            {placed?.has(widget.id) ? (
                              <span className="chip chip-line">
                                Add another for a different stock
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <Plus className="mt-2 h-4 w-4 shrink-0 text-brand-muted-fg transition-colors group-hover:text-forest-700" aria-hidden="true" />
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
