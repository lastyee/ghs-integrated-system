import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        disabled={disabled}
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs transition-colors",
          "placeholder:text-slate-400",
          "focus:outline-none focus:ring-1",
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
            : "border-slate-200 focus:border-[#102F50] focus:ring-[#102F50]",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

