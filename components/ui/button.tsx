import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-[#BF120E] text-white shadow-xs hover:bg-[#a00f0c] focus-visible:ring-[#BF120E]",
        navy:
          "bg-[#102F50] text-white shadow-xs hover:bg-[#0c243e] focus-visible:ring-[#102F50]",
        secondary:
          "border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-slate-400",
        outline:
          "border border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-slate-400",
        ghost:
          "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
        danger:
          "bg-red-600 text-white shadow-xs hover:bg-red-700 focus-visible:ring-red-600",
        dangerOutline:
          "border border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 focus-visible:ring-red-400",
        gold:
          "bg-[#FFD618] text-[#1B1B1B] shadow-xs hover:bg-[#e6c015] focus-visible:ring-[#FFD618]",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-md",
        md: "h-10 px-4 py-2 text-xs sm:text-sm",
        lg: "h-11 px-5 text-sm sm:text-base",
        icon: "size-9 p-0 rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

