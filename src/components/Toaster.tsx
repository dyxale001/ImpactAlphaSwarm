import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`max-w-sm rounded-3xl border border-border bg-popover p-4 shadow-xl shadow-black/10 transition-opacity duration-200 ${
            toast.variant === "destructive" ? "border-danger/30 bg-danger/10 text-danger" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              {toast.title && <p className="font-semibold">{toast.title}</p>}
              {toast.description && <p className="text-sm text-muted-foreground">{toast.description}</p>}
            </div>
            <button onClick={() => dismiss(toast.id)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
