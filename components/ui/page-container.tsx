import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  maxWidth?: "default" | "wide" | "narrow" | "full";
  padding?: "default" | "compact" | "none";
}

const maxWidthMap = {
  default: "max-w-7xl",         // 1280px - standard dashboards, cards, forms
  wide: "max-w-[1500px]",       // 1500px - wide tables (replacing max-w-375 safely), complex reports
  narrow: "max-w-4xl",          // 896px - profiles, auth, simple forms
  full: "max-w-full",           // full width
};

const paddingMap = {
  default: "p-4 sm:p-6 lg:p-8",
  compact: "p-3 sm:p-4 lg:p-6",
  none: "p-0",
};

export const PageContainer = React.forwardRef<HTMLDivElement, PageContainerProps>(
  ({ maxWidth = "default", padding = "default", className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "mx-auto w-full min-w-0 transition-all",
          maxWidthMap[maxWidth],
          paddingMap[padding],
          className
        )}
        {...props}
      />
    );
  }
);
PageContainer.displayName = "PageContainer";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  breadcrumbs,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        {breadcrumbs && <div className="mb-1 text-xs text-slate-500">{breadcrumbs}</div>}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-xs sm:text-sm text-slate-500 line-clamp-2">{description}</p>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-2.5 self-start sm:self-center">
          {actions}
        </div>
      )}
    </div>
  );
}

