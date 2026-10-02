export function SystemOverview({
  items = [],
}: {
  items?: Array<{ label: string; value: number }>;
}) {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white p-5 shadow-xs">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-[#1B1B1B]">Ringkasan Sistem</h2>
        <p className="mt-0.5 text-xs text-slate-500">Jumlah aktual berdasarkan data tersimpan.</p>
      </div>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <span className="text-xs font-medium text-slate-600">{item.label}</span>
            <span className="text-sm font-bold text-[#1B1B1B]">{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
