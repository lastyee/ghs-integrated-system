import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SummaryBarItem {
  id?: string;
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "navy" | "gold" | "success" | "warning" | "danger" | "info";
  badgeText?: string;
}

const toneValueColors: Record<NonNullable<SummaryBarItem["tone"]>, string> = {
  default: "text-slate-900",
  primary: "text-[#BF120E]",
  navy: "text-[#102F50]",
  gold: "text-[#B45309]",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-red-700",
  info: "text-blue-700",
};

const toneIconColors: Record<NonNullable<SummaryBarItem["tone"]>, string> = {
  default: "text-slate-400 bg-slate-100",
  primary: "text-[#BF120E] bg-red-50",
  navy: "text-[#102F50] bg-slate-100",
  gold: "text-amber-700 bg-amber-50",
  success: "text-emerald-700 bg-emerald-50",
  warning: "text-amber-700 bg-amber-50",
  danger: "text-red-700 bg-red-50",
  info: "text-blue-700 bg-blue-50",
};

export interface SummaryBarProps extends React.HTMLAttributes<HTMLDivElement> {
  items: SummaryBarItem[];
}

export function SummaryBar({ items, className, ...props }: SummaryBarProps) {
  if (!items || items.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-xs",
        className
      )}
      {...props}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:items-center md:divide-x md:divide-slate-200/80 md:gap-0">
        {items.map((item, idx) => {
          const tone = item.tone ?? "default";
          const Icon = item.icon;

          return (
            <div
              key={item.id ?? `${item.label}-${idx}`}
              className={cn(
                "flex items-center gap-3 rounded-lg p-2.5 sm:px-4 sm:py-2",
                "md:flex-1 md:rounded-none md:first:pl-2 md:last:pr-2"
              )}
            >
              {Icon && (
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    toneIconColors[tone]
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-4.5" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {item.label}
                  </p>
                  {item.badgeText && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
                      {item.badgeText}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-lg sm:text-2xl font-bold tracking-tight",
                    toneValueColors[tone]
                  )}
                >
                  {item.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

