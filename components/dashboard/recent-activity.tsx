type AuditActivity = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: Date;
  user: { name: string | null } | null;
};

export function RecentActivity({ entries = [] }: { entries?: AuditActivity[] }) {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <div className="border-b border-[#EEEEEE] px-5 py-4">
        <h2 className="text-sm font-bold text-[#1B1B1B]">Aktivitas Terbaru</h2>
        <p className="mt-0.5 text-xs text-slate-500">Aktivitas yang tercatat pada audit log.</p>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Belum ada aktivitas tercatat.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {entries.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="rounded-md bg-slate-100 p-2 text-slate-600">
                <span className="text-xs font-bold" aria-hidden="true">{item.action.slice(0, 2)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">{item.action} · {item.entity}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.user?.name ?? "Akun tidak tersedia"} · {item.entityId}
                </p>
              </div>
              <time className="hidden text-[11px] text-slate-500 sm:inline-flex" dateTime={item.createdAt.toISOString()}>
                {item.createdAt.toLocaleString("id-ID")}
              </time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
