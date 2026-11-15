import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, disabled, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full appearance-none rounded-lg border bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-2xs transition-colors",
          "focus:outline-none focus:ring-1",
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
            : "border-slate-200 focus:border-[#102F50] focus:ring-[#102F50]",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

