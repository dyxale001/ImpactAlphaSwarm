import type { ButtonHTMLAttributes } from "react";

/**
 * The five button shapes the Settings page uses, so every card's footer reads
 * the same, now the platform's own buttons.
 *
 * Forest is the one primary; the outline pill is secondary; the text button is
 * for cancel; and the two red variants exist only on the deactivate card, so
 * red means "leaves the account" and nothing else.
 */

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryButton({ className = "", ...props }: Props) {
  return <button type="button" {...props} className={`as-btn as-btn-primary ${className}`} />;
}

export function SecondaryButton({ className = "", ...props }: Props) {
  return <button type="button" {...props} className={`as-btn as-btn-secondary ${className}`} />;
}

export function TextButton({ className = "", ...props }: Props) {
  return <button type="button" {...props} className={`as-btn as-btn-text ${className}`} />;
}

export function DangerOutlineButton({ className = "", ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={`as-btn border-down/45 bg-white text-down hover:bg-down-bg ${className}`}
    />
  );
}

export function DangerButton({ className = "", ...props }: Props) {
  return <button type="button" {...props} className={`as-btn bg-down text-white hover:opacity-90 ${className}`} />;
}
