import { recentActivities } from "@/lib/mock-data";

export function RecentActivity() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <div className="border-b border-[#EEEEEE] px-5 py-4">
        <h2 className="text-sm font-bold text-[#1B1B1B]">Aktivitas Terbaru</h2>
        <p className="mt-0.5 text-xs text-slate-500">Log operasional aktivitas sistem</p>
      </div>
      <div className="divide-y divide-slate-100">
        {recentActivities.map((item) => {
          const Icon = item.icon;
          return (
            <div key={`${item.activity}-${item.time}`} className="flex items-center gap-3 px-5 py-3.5">
              <div className="rounded-md bg-slate-100 p-2 text-slate-600">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">{item.activity}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.user} <span className="mx-1 text-slate-300">•</span> {item.time}
                </p>
              </div>
              <span className="hidden rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 sm:inline-flex">
                {item.status}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
