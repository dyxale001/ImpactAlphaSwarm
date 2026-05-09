import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "ghost" | "destructive" | "outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50",
          variant === "ghost" && "bg-transparent hover:bg-secondary/70",
          variant === "destructive" && "bg-danger text-primary-foreground hover:bg-danger/90",
          variant === "outline" && "border border-border bg-transparent hover:bg-secondary/70",
          variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button };
