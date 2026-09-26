import { systemOverview } from "@/lib/mock-data";

export function SystemOverview() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white p-5 shadow-xs">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-[#1B1B1B]">Ringkasan Sistem</h2>
        <p className="mt-0.5 text-xs text-slate-500">Gambaran singkat kondisi operasional sistem</p>
      </div>
      <div className="space-y-4">
        {systemOverview.map((item) => (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-slate-600">{item.label}</span>
              <span className="text-xs font-bold text-[#1B1B1B]">{item.value}</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label={item.label}
              aria-valuenow={item.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
