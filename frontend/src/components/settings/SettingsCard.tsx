import type { ReactNode } from "react";

/**
 * The one card shell every Settings section sits in.
 *
 * Title and a one-line purpose at the top, an optional chip for a fact about
 * the card (how many answered, that a value is derived), the content, then a
 * footer with the consequence of saving on the left and the action on the
 * right. Every card saves itself: there is no page-level Save, because the
 * things on this page are written to different rows and read by different
 * parts of the product, and one button pretending otherwise would have to lie
 * about what just happened.
 *
 * The consequence line is the honest half of that: "applies on your next
 * analysis run" and "fund matches update as soon as you save" are different
 * promises, and each card makes only the one it can keep.
 */
export default function SettingsCard({
  title,
  lead,
  chip,
  tone = "default",
  consequence,
  actions,
  error,
  success,
  children,
  id,
}: {
  title: string;
  lead?: string;
  chip?: ReactNode;
  tone?: "default" | "danger";
  consequence?: ReactNode;
  actions?: ReactNode;
  error?: string | null;
  success?: string | null;
  children?: ReactNode;
  id?: string;
}) {
  const hasFooter = Boolean(consequence || actions);
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={`as-card flex flex-col gap-4 p-5 sm:p-6 ${
        tone === "danger" ? "!border-down/30" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-w-[62ch]">
          <h2
            id={id ? `${id}-title` : undefined}
            className={`text-base font-bold tracking-[-0.01em] ${
              tone === "danger" ? "text-down" : "text-forest-900"
            }`}
          >
            {title}
          </h2>
          {lead && <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">{lead}</p>}
        </div>
        {chip && <div className="shrink-0">{chip}</div>}
      </div>

      {children}

      {error && (
        <div
          role="alert"
          className="rounded-[12px] bg-down-bg px-3 py-2.5 text-sm text-down"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="rounded-[12px] bg-up-bg px-3 py-2.5 text-sm font-semibold text-up"
        >
          {success}
        </div>
      )}

      {hasFooter && (
        <div className="flex flex-col gap-3 border-t border-forest-900/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-brand-muted-fg">{consequence}</div>
          {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
        </div>
      )}
    </section>
  );
}

/** A small fact chip for a card header: the platform chip. */
export function CardChip({ children }: { children: ReactNode }) {
  return (
    <span className="chip">
      {children}
    </span>
  );
}

/** A consequence line with a leading icon, for the card footer. */
export function Consequence({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1.5 leading-relaxed">
      {icon && <span className="mt-[2px] shrink-0 text-forest-500">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
