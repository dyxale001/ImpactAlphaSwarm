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
  onAdd,
  onClose,
}: {
  open: boolean;
  available: WidgetDef[];
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
        className="absolute inset-0 bg-brand-fg/30 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add a widget"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-brand-border/60 bg-brand-card shadow-xl focus:outline-none"
      >
        {/* The header takes the forest hero the dashboard's own panels use, so
            the library reads as part of this product rather than a system
            sheet that happens to have slid in over it. */}
        <header className="hero-card sticky top-0 z-10 flex items-start justify-between gap-3 rounded-none px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-brand-bg">Add a widget</h2>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-brand-accent">
              {available.length === 0
                ? "Everything is placed"
                : `${available.length} available`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-brand-bg/70 transition-colors hover:bg-white/10 hover:text-brand-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
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
                {/* A lime rule beside each group name: the accent is the one
                    thing carrying the brand through a long neutral list. */}
                <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-brand-primary">
                  <span
                    className="h-3 w-1 shrink-0 rounded-full bg-brand-accent"
                    aria-hidden="true"
                  />
                  {group}
                </h3>
                {widgets.map((widget) => {
                  const Icon = widget.icon;
                  return (
                    <button
                      key={widget.id}
                      type="button"
                      onClick={() => onAdd(widget.id)}
                      className="group flex w-full items-start gap-3 rounded-2xl border border-brand-border/50 bg-brand-bg/50 p-3 text-left transition-all hover:border-brand-accent hover:bg-brand-accent/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                    >
                      {/* Forest disc, going lime on hover: the row you are
                          about to add lights up in the accent it will carry. */}
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-primary transition-colors group-hover:bg-brand-accent">
                        <Icon className="h-3.5 w-3.5 text-white transition-colors group-hover:text-brand-fg" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-brand-fg">
                          {widget.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-brand-muted-fg">
                          {widget.blurb}
                        </span>
                        {widget.needsTicker ? (
                          <span className="mt-1.5 inline-block rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] text-white">
                            Picks its own asset
                          </span>
                        ) : null}
                      </span>
                      <Plus className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted-fg transition-colors group-hover:text-brand-primary" />
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
