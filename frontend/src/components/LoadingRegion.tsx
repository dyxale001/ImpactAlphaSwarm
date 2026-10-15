import type { ReactNode } from "react";

/** One announcement per region; placeholder shapes never enter the reading order. */
export default function LoadingRegion({ label, children, className = "" }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p role="status" className="sr-only">{label}</p>
      <div aria-busy="true" aria-hidden="true" className="min-w-0 motion-safe:animate-pulse">
        {children}
      </div>
    </div>
  );
}
