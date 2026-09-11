import type { ButtonHTMLAttributes } from "react";

/**
 * The five button shapes the Settings page uses, so every card's footer reads
 * the same. Before this the page had a lime pill, a dark rounded rectangle, a
 * red-tinted pill and an outline pill all doing "primary" somewhere.
 *
 * Lime is the one primary; the outline pill is secondary; the text button is
 * for cancel; and the two red variants exist only on the deactivate card, so
 * red means "leaves the account" and nothing else.
 */

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40";

export function PrimaryButton({ className = "", ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} bg-accent/95 text-brand-fg hover:bg-accent/70 hover:shadow-glow-accent disabled:hover:shadow-none ${className}`}
    />
  );
}

export function SecondaryButton({ className = "", ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} border border-brand-border bg-brand-surface text-brand-fg hover:bg-brand-border/30 ${className}`}
    />
  );
}

export function TextButton({ className = "", ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} px-2 text-brand-primary hover:underline ${className}`}
    />
  );
}

export function DangerOutlineButton({ className = "", ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} border border-semantic-danger/45 text-semantic-danger hover:bg-semantic-danger/10 ${className}`}
    />
  );
}

export function DangerButton({ className = "", ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} bg-semantic-danger text-white hover:opacity-90 ${className}`}
    />
  );
}
