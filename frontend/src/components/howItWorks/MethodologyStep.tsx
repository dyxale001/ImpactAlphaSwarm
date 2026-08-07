import type { ComponentType, ReactNode } from "react";

// A single numbered step in a methodology walkthrough, with a vertical rail
// connecting it to the next step. Set `isLast` on the final step to hide the rail.
export default function MethodologyStep({
  n,
  icon: Icon,
  title,
  isLast = false,
  children,
}: {
  n: number;
  icon: ComponentType<{ className?: string }>;
  title: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-bold text-brand-primary">
          {n}
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-brand-border/60" />}
      </div>

      <div className={`flex-1 min-w-0 ${isLast ? "" : "pb-8"}`}>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-fg">
          <Icon className="h-4 w-4 shrink-0 text-brand-primary" />
          {title}
        </p>
        <div className="space-y-3 text-sm leading-relaxed text-brand-muted-fg">
          {children}
        </div>
      </div>
    </div>
  );
}
