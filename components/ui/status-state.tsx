import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";

type StateProps = {
  title?: string;
  description?: string;
};

export function LoadingState({
  title = "Memuat data",
  description = "Mohon tunggu sebentar.",
}: StateProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
      <LoaderCircle className="size-5 animate-spin text-[#123b63]" aria-hidden="true" />
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-sm">{description}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  title = "Belum ada data",
  description = "Data akan ditampilkan setelah tersedia.",
}: StateProps) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <Inbox className="mx-auto mb-3 size-7 text-slate-400" aria-hidden="true" />
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function ErrorState({
  title = "Data belum dapat ditampilkan",
  description = "Silakan coba lagi nanti.",
}: StateProps) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-red-700">{description}</p>
        </div>
      </div>
    </div>
  );
}
