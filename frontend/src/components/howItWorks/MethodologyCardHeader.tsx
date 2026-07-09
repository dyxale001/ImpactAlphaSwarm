import type { ComponentType } from "react";

// Shared header for a methodology card: an icon badge, a title, and a subtitle.
export default function MethodologyCardHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-brand-border/50 pb-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
        <Icon className="h-5 w-5 text-brand-primary" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-brand-fg">{title}</h2>
        <p className="text-sm text-brand-muted-fg">{subtitle}</p>
      </div>
    </div>
  );
}
