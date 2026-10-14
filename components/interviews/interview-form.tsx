"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Video, FileText, Loader2, X, Search } from "lucide-react";

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
  const [selectedAppRecord, setSelectedAppRecord] = useState<ApplicationOption | null>(null);

  const defaultAppId = initialApplicationId || preselectedApplicationId || "";
  const [applicationId, setApplicationId] = useState(defaultAppId);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [scheduledAt, setScheduledAt] = useState("");
  const [method, setMethod] = useState("Online");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== debouncedSearchQuery) {
        setDebouncedSearchQuery(searchQuery);
        setPage(1);
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery, debouncedSearchQuery]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingApps(true);

    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      ...(debouncedSearchQuery.trim() ? { search: debouncedSearchQuery.trim() } : {}),
    });

    fetch(`/api/applications?${params.toString()}`)
      .then(async (res) => {
        if (!isMounted) return;
        if (res.ok) {
          const json = await res.json();
          const list: ApplicationOption[] = Array.isArray(json) ? json : (json.data || []);
          if (json.pagination) {
            setTotal(json.pagination.total);
            setTotalPages(json.pagination.totalPages);
          } else {
            setTotal(list.length);
            setTotalPages(1);
          }

          // Filter out REJECTED or WITHDRAWN
          const valid = list.filter(
            (a: ApplicationOption) =>
              a.status !== "REJECTED" && a.status !== "WITHDRAWN"
          );

          // If defaultAppId is provided and not in valid list, fetch it directly
          if (defaultAppId && !valid.some((a) => a.id === defaultAppId)) {
            try {
              const detailRes = await fetch(`/api/applications/${defaultAppId}`);
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                if (
                  detailData &&
                  detailData.id &&
                  detailData.status !== "REJECTED" &&
                  detailData.status !== "WITHDRAWN"
                ) {
                  const preloadedItem: ApplicationOption = {
                    id: detailData.id,
                    status: detailData.status,
                    student: {
                      id: detailData.student?.id || "",
                      nim: detailData.student?.nim || "",
                      name: detailData.student?.name || "",
                    },
                    vacancy: {
                      id: detailData.vacancy?.id || "",
                      title: detailData.vacancy?.title || "",
                      employer: {
                        id: detailData.vacancy?.employer?.id || "",
                        name: detailData.vacancy?.employer?.name || "",
                      },
                    },
                  };
                  valid.unshift(preloadedItem);
                  setSelectedAppRecord(preloadedItem);
                }
              }
            } catch {
              // Ignore preselected fetch error
            }
          }

          setApplications(valid);
          setApplicationId((prev) => {
            if (!prev && valid.length > 0) {
              const chosenId = defaultAppId || valid[0].id;
              const foundRecord = valid.find((a) => a.id === chosenId);
              if (foundRecord) setSelectedAppRecord(foundRecord);
              return chosenId;
            }
            if (defaultAppId) {
              return defaultAppId;
            }
            return prev;
          });
        } else {
          setApplications([]);
        }
      })
      .catch(() => {
        if (isMounted) setApplications([]);
      })
      .finally(() => {
        if (isMounted) setLoadingApps(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, page, debouncedSearchQuery, defaultAppId]);

  // Merge current selectedAppRecord if it's not present in the current paginated/searched list
  const displayedOptions = [...(applications || [])];
  if (
    selectedAppRecord &&
    !displayedOptions.some((a) => a.id === selectedAppRecord.id)
  ) {
    displayedOptions.unshift(selectedAppRecord);
  }

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

            {/* Server-side Search Input */}
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                id="interview-application-search"
                data-testid="interview-application-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kandidat (nama, NIM, posisi, perusahaan)..."
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
              />
            </div>

            {loadingApps && applications === null ? (
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                Memuat data lamaran aktif...
              </div>
            ) : (
              <select
                id="interview-application-select"
                data-testid="interview-application-select"
                value={applicationId}
                onChange={(e) => {
                  const val = e.target.value;
                  setApplicationId(val);
                  const chosen = displayedOptions.find((a) => a.id === val);
                  if (chosen) setSelectedAppRecord(chosen);
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                required
              >
                {displayedOptions.length === 0 ? (
                  <option value="">
                    {searchQuery
                      ? "Tidak ada lamaran yang cocok dengan pencarian"
                      : "Tidak ada lamaran aktif tersedia"}
                  </option>
                ) : (
                  displayedOptions.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.student.name} ({app.student.nim}) — {app.vacancy.title} @{" "}
                      {app.vacancy.employer.name}
                    </option>
                  ))
                )}
              </select>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Halaman {page} dari {totalPages} ({total} total lamaran)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loadingApps}
                    className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium hover:bg-slate-50 disabled:opacity-40"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loadingApps}
                    className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium hover:bg-slate-50 disabled:opacity-40"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
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
              disabled={submitting || displayedOptions.length === 0}
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
