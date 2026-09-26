import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  description?: string;
  icon?: LucideIcon;
  tone?: "navy" | "red" | "yellow" | "blue";
};

const toneClasses = {
  navy: "bg-slate-100 text-slate-700",
  red: "bg-red-50 text-[#BF120E]",
  yellow: "bg-amber-50 text-[#946c00]",
  blue: "bg-slate-100 text-slate-600",
};

export function StatCard({ label, value, description, icon: Icon, tone = "navy" }: StatCardProps) {
  return (
    <article className="rounded-lg border border-[#EEEEEE] bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#1B1B1B]">{value}</p>
        </div>
        {Icon && (
          <div className={`rounded-md p-2 ${toneClasses[tone]}`}>
            <Icon className="size-4" aria-hidden="true" />
          </div>
        )}
      </div>
      {description && <p className="mt-2 text-xs text-slate-500">{description}</p>}
    </article>
  );
}
