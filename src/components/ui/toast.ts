import type { ReactNode } from "react";

export type ToastActionElement = ReactNode;

export type ToastProps = {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive" | "success" | "warning";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
