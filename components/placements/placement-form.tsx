"use client";

import { useEffect, useState } from "react";
import { Building2, Calendar, FileText, Loader2, User, X } from "lucide-react";

export type StudentOption = {
  id: string;
  nim: string;
  name: string;
};

export type EmployerOption = {
  id: string;
  name: string;
};

export type VacancyOption = {
  id: string;
  title: string;
  employerId: string;
};

export type PlacementFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPlacement?: unknown) => void;
  initialStudentId?: string;
  initialEmployerId?: string;
  initialVacancyId?: string;
  initialApplicationId?: string;
  initialPosition?: string;
};

export function PlacementFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialStudentId,
  initialEmployerId,
  initialVacancyId,
  initialApplicationId,
  initialPosition,
}: PlacementFormModalProps) {
  const isApplicationContext = Boolean(initialApplicationId);

  const [studentId, setStudentId] = useState(initialStudentId || "");
  const [employerId, setEmployerId] = useState(initialEmployerId || "");
  const [vacancyId, setVacancyId] = useState(initialVacancyId || "");
  const [applicationId] = useState(initialApplicationId || "");
  const [position, setPosition] = useState(initialPosition || "");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [vacancies, setVacancies] = useState<VacancyOption[]>([]);

  const [dataLoaded, setDataLoaded] = useState(false);
  const loadingData = isOpen && !isApplicationContext && !dataLoaded;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    if (!isApplicationContext) {
      Promise.all([
        fetch("/api/students").then((r) => r.json()).catch(() => null),
        fetch("/api/employers").then((r) => r.json()).catch(() => null),
        fetch("/api/vacancies?status=OPEN").then((r) => r.json()).catch(() => null),
      ])
        .then(([studentsRes, employersRes, vacanciesRes]) => {
          if (!isMounted) return;

          const studentList = Array.isArray(studentsRes)
            ? studentsRes
            : Array.isArray(studentsRes?.data)
            ? studentsRes.data
            : [];
          setStudents(studentList);
          if (!initialStudentId && studentList.length > 0) {
            setStudentId((prev) => prev || studentList[0].id);
          }

          const employerList = Array.isArray(employersRes)
            ? employersRes
            : Array.isArray(employersRes?.data)
            ? employersRes.data
            : [];
          setEmployers(employerList);
          if (!initialEmployerId && employerList.length > 0) {
            setEmployerId((prev) => prev || employerList[0].id);
          }

          const vacancyList = Array.isArray(vacanciesRes)
            ? vacanciesRes
            : Array.isArray(vacanciesRes?.data)
            ? vacanciesRes.data
            : [];
          setVacancies(vacancyList);
          setDataLoaded(true);
        })
        .finally(() => {
          if (isMounted) setDataLoaded(true);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, isApplicationContext, initialStudentId, initialEmployerId]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!studentId) {
      setError("Silakan pilih peserta training.");
      return;
    }
    if (!employerId) {
      setError("Silakan pilih perusahaan mitra.");
      return;
    }
    if (!position.trim()) {
      setError("Posisi / jabatan kerja wajib diisi.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          employerId,
          position: position.trim(),
          vacancyId: vacancyId || null,
          applicationId: applicationId || null,
          startDate: startDate ? new Date(startDate).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          setError(
            data.message ||
              "Lamaran ini sudah memiliki record penempatan atau terjadi duplikasi data."
          );
        } else if (res.status === 403) {
          setError("Anda tidak memiliki wewenang untuk membuat data penempatan.");
        } else {
          setError(
            data.message ||
              "Gagal menyimpan data penempatan. Silakan periksa formulir Anda."
          );
        }
        return;
      }

      onSuccess(data.data);
      onClose();
    } catch {
      setError("Terjadi kesalahan jaringan. Silakan coba kembali.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="placement-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-[#102f50]" />
            <h2
              id="placement-modal-title"
              className="text-lg font-bold text-[#102f50]"
            >
              {isApplicationContext
                ? "Buat Penempatan dari Lamaran"
                : "Catat Penempatan Baru"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            data-testid="close-placement-modal-btn"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="placement-form-error"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </div>
        )}

        {loadingData ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Loader2 className="size-8 animate-spin text-[#102f50]" />
            <p className="mt-2 text-sm">Memuat data referensi...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Student Field */}
            <div>
              <label
                htmlFor="placement-student"
                className="block text-xs font-semibold text-slate-700"
              >
                Peserta Training (Mahasiswa) *
              </label>
              {isApplicationContext ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  <User className="size-4 text-slate-400" />
                  <span>Kandidat Terpilih (Sesuai Lamaran)</span>
                </div>
              ) : (
                <select
                  id="placement-student"
                  data-testid="placement-student-select"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
                >
                  <option value="">Pilih Peserta...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.nim})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Employer Field */}
            <div>
              <label
                htmlFor="placement-employer"
                className="block text-xs font-semibold text-slate-700"
              >
                Perusahaan Mitra *
              </label>
              {isApplicationContext ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  <Building2 className="size-4 text-slate-400" />
                  <span>Perusahaan Mitra Terpilih</span>
                </div>
              ) : (
                <select
                  id="placement-employer"
                  data-testid="placement-employer-select"
                  value={employerId}
                  onChange={(e) => {
                    setEmployerId(e.target.value);
                    setVacancyId("");
                  }}
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
                >
                  <option value="">Pilih Perusahaan...</option>
                  {employers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Vacancy Field (Optional) */}
            {!isApplicationContext && (
              <div>
                <label
                  htmlFor="placement-vacancy"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Lowongan Terkait (Opsional)
                </label>
                <select
                  id="placement-vacancy"
                  data-testid="placement-vacancy-select"
                  value={vacancyId}
                  onChange={(e) => {
                    const selVacId = e.target.value;
                    setVacancyId(selVacId);
                    const matched = vacancies.find((v) => v.id === selVacId);
                    if (matched && !position) {
                      setPosition(matched.title);
                    }
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
                >
                  <option value="">Tidak terikat lowongan spesifik</option>
                  {vacancies
                    .filter((v) => !employerId || v.employerId === employerId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Position Field */}
            <div>
              <label
                htmlFor="placement-position"
                className="block text-xs font-semibold text-slate-700"
              >
                Posisi / Jabatan Kerja *
              </label>
              <input
                id="placement-position"
                data-testid="placement-position-input"
                type="text"
                placeholder="Contoh: Commis Chef, Front Office Officer"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
              />
            </div>

            {/* Start Date Field */}
            <div>
              <label
                htmlFor="placement-start-date"
                className="block text-xs font-semibold text-slate-700"
              >
                Tanggal Mulai Bekerja / Penempatan
              </label>
              <div className="relative mt-1">
                <Calendar className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
                <input
                  id="placement-start-date"
                  data-testid="placement-startdate-input"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full rounded-lg border border-slate-200 py-2 pr-3 pl-9 text-sm text-slate-800 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Notes Field */}
            <div>
              <label
                htmlFor="placement-notes"
                className="block text-xs font-semibold text-slate-700"
              >
                Catatan Penempatan (Opsional)
              </label>
              <div className="relative mt-1">
                <FileText className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
                <textarea
                  id="placement-notes"
                  data-testid="placement-notes-input"
                  rows={3}
                  placeholder="Informasi logistik, persiapan berkas, atau catatan mitra..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="block w-full rounded-lg border border-slate-200 py-2 pr-3 pl-9 text-sm text-slate-800 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Informasi Status:</span>{" "}
              Data penempatan akan otomatis dimulai dengan status{" "}
              <strong className="text-[#102f50]">Persiapan (PREPARATION)</strong>.
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                data-testid="cancel-placement-btn"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="submit-placement-btn"
                className="inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#1a4470] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan Penempatan"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
