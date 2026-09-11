import type { LucideIcon } from "lucide-react";

/**
 * A state that is not a list of funds: nothing loaded, nothing matched,
 * nothing left after the filters, or a request that failed.
 *
 * One component because there were five of these and all five rendered as the
 * same sentence of grey italic text in a card, with no heading, no icon and no
 * way out. They are different situations: an empty catalogue is a fact about
 * how far the transcription has got, a filtered-empty grid is something the
 * reader did and can undo, and a failed request is worth asking again. Given
 * one shape they are at least legibly different from a list, and given a
 * heading they say which of the five happened.
 *
 * The action is optional and is the whole reason this is not a paragraph. The
 * filtered-empty copy has promised "clear one and the list widens" since it was
 * written, with nothing on screen to clear anything with.
 */
export default function FundsNotice({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /** `warning` for a request that failed, which is a different claim from a
   *  category that is simply empty. */
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="soft-card flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          tone === "warning" ? "bg-warning/15 text-warning-strong" : "bg-brand-bg text-forest-500"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="max-w-md text-[13px] font-bold text-brand-primary">{title}</p>
      <p className="max-w-md text-xs leading-relaxed text-brand-secondary">{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 rounded-full border border-brand-border/60 bg-brand-surface px-4 py-1.5 text-xs font-bold text-brand-primary transition-colors hover:border-brand-primary/40"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
