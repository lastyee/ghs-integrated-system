"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Video, FileText, Loader2, X } from "lucide-react";

export type ApplicationOption = {
  id: string;
  status: string;
  student: {
    id: string;
    nim: string;
    name: string;
  };
  vacancy: {
    id: string;
    title: string;
    employer: {
      id: string;
      name: string;
    };
  };
};

type InterviewFormProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newInterview?: unknown) => void;
  initialApplicationId?: string;
  preselectedApplicationId?: string;
};

export function InterviewFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialApplicationId,
  preselectedApplicationId,
}: InterviewFormProps) {
  const [applications, setApplications] = useState<ApplicationOption[] | null>(null);

  const defaultAppId = initialApplicationId || preselectedApplicationId || "";
  const [applicationId, setApplicationId] = useState(defaultAppId);
  const [scheduledAt, setScheduledAt] = useState("");
  const [method, setMethod] = useState("Online");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeApplications = applications || [];
  const loadingApps = isOpen && applications === null;

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    fetch("/api/applications")
      .then(async (res) => {
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Filter out REJECTED or WITHDRAWN
            const valid = data.filter(
              (a: ApplicationOption) =>
                a.status !== "REJECTED" && a.status !== "WITHDRAWN"
            );
            setApplications(valid);
            if (!defaultAppId && valid.length > 0) {
              setApplicationId((prev) => prev || valid[0].id);
            }
          } else {
            setApplications([]);
          }
        } else {
          setApplications([]);
        }
      })
      .catch(() => {
        if (isMounted) setApplications([]);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, defaultAppId]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!applicationId) {
      setError("Silakan pilih lamaran kandidat.");
      return;
    }

    if (!scheduledAt) {
      setError("Jadwal tanggal dan waktu wawancara wajib diisi.");
      return;
    }

    try {
      setSubmitting(true);
      const isoDate = new Date(scheduledAt).toISOString();

      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          scheduledAt: isoDate,
          method: method.trim() || undefined,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 400) {
          setError(resData.message || "Input tidak valid. Periksa kembali form.");
        } else if (res.status === 403) {
          setError("Anda tidak memiliki izin untuk menjadwalkan wawancara.");
        } else if (res.status === 404) {
          setError("Lamaran yang dipilih tidak ditemukan.");
        } else if (res.status === 409) {
          setError(
            resData.message ||
              "Wawancara tidak dapat dijadwalkan untuk lamaran ini."
          );
        } else {
          setError(resData.message || "Terjadi kesalahan pada server.");
        }
        return;
      }

      onSuccess(resData);
      onClose();
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 id="interview-form-title" className="text-lg font-bold text-[#102f50]">
              Jadwalkan Wawancara (Interview)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Buat jadwal wawancara baru untuk kandidat lamaran
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="interview-application-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Pilih Lamaran Kandidat <span className="text-rose-500">*</span>
            </label>
            {loadingApps ? (
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                Memuat data lamaran aktif...
              </div>
            ) : (
              <select
                id="interview-application-select"
                data-testid="interview-application-select"
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                required
              >
                {safeApplications.length === 0 ? (
                  <option value="">Tidak ada lamaran aktif tersedia</option>
                ) : (
                  safeApplications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.student.name} ({app.student.nim}) — {app.vacancy.title} @{" "}
                      {app.vacancy.employer.name}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="interview-scheduled-at"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
              >
                <CalendarDays className="size-3.5 text-slate-400" />
                Jadwal Waktu <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                id="interview-scheduled-at"
                data-testid="interview-scheduled-at"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                required
              />
            </div>

            <div>
              <label
                htmlFor="interview-method"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
              >
                <Video className="size-3.5 text-slate-400" />
                Metode Wawancara
              </label>
              <input
                type="text"
                id="interview-method"
                data-testid="interview-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Contoh: Online, On-site, dsb."
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="interview-location"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <MapPin className="size-3.5 text-slate-400" />
              Lokasi / Tautan Meeting
            </label>
            <input
              type="text"
              id="interview-location"
              data-testid="interview-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Contoh: Google Meet URL, Ruang Rapat 2, Gedung A"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
            />
          </div>

          <div>
            <label
              htmlFor="interview-notes"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <FileText className="size-3.5 text-slate-400" />
              Catatan Pelaksanaan (Opsional)
            </label>
            <textarea
              id="interview-notes"
              data-testid="interview-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Instruksi untuk peserta, misal: kenakan pakaian formal, siapkan CV cetak..."
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="btn-submit-interview"
              disabled={submitting || safeApplications.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470] disabled:opacity-50"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Jadwalkan Wawancara
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
