import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 border font-semibold transition-colors",
  {
    variants: {
      variant: {
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        danger: "border-red-200 bg-red-50 text-red-700",
        info: "border-blue-200 bg-blue-50 text-blue-700",
        neutral: "border-slate-200 bg-slate-100 text-slate-700",
        crimson: "border-red-200 bg-red-50 text-[#BF120E]",
        navy: "border-slate-200 bg-slate-100 text-[#102F50]",
        gold: "border-amber-200 bg-amber-50 text-amber-900",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-0.5 text-[11px]",
        lg: "px-3 py-1 text-xs",
      },
      shape: {
        pill: "rounded-full",
        rounded: "rounded-md",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
      shape: "pill",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, shape, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size, shape, className }))}
      {...props}
    />
  );
}

