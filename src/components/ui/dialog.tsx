import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

interface ContentProps {
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-2xl">{children}</div>
    </div>
  );
}

export function DialogContent({ children, className }: ContentProps) {
  return <div className={"rounded-3xl border border-border bg-popover p-6 shadow-xl " + (className ?? "")}>{children}</div>;
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="space-y-2 mb-4">{children}</div>;
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={"text-lg font-semibold " + (className ?? "")}>{children}</h2>;
}

export function DialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={"text-sm text-muted-foreground " + (className ?? "")}>{children}</p>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap gap-2 justify-end">{children}</div>;
}
