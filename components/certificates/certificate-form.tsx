"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";

type StudentOption = {
  id: string;
  name: string;
  nim: string;
};

type ProgramOption = {
  id: string;
  name: string;
  code: string;
};

type BatchOption = {
  id: string;
  name: string;
  programId: string;
};

type CertificateFormProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function CertificateForm({ open, onClose, onSuccess }: CertificateFormProps) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [studentId, setStudentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().split("T")[0]);
  const [path, setPath] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    Promise.all([
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/programs").then((r) => r.json()),
      fetch("/api/batches").then((r) => r.json()),
    ])
      .then(([studentsRes, programsRes, batchesRes]) => {
        if (!isMounted) return;
        setStudents(Array.isArray(studentsRes) ? studentsRes : studentsRes.data || []);
        setPrograms(Array.isArray(programsRes) ? programsRes : programsRes.data || []);
        setBatches(Array.isArray(batchesRes) ? batchesRes : batchesRes.data || []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Gagal memuat master data");
      })
      .finally(() => {
        if (isMounted) setLoadingOptions(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!studentId || !programId || !batchId || !certificateNumber || !issuedAt) {
      setError("Semua field bertanda * wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        studentId,
        programId,
        batchId,
        certificateNumber: certificateNumber.trim(),
        issuedAt: new Date(issuedAt).toISOString(),
      };
      if (path.trim()) {
        payload.path = path.trim();
      }

      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal menerbitkan sertifikat");
      }

      // Reset and close
      setStudentId("");
      setProgramId("");
      setBatchId("");
      setCertificateNumber("");
      setPath("");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Terjadi kesalahan sistem saat menerbitkan sertifikat");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Filter batches by selected program if selected
  const availableBatches = programId
    ? batches.filter((b) => b.programId === programId)
    : batches;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
    >
      <div className="relative w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 id="modal-title" className="text-lg font-bold text-[#102f50]">
            Terbitkan Sertifikat Baru
          </h2>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            <AlertCircle className="size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loadingOptions ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 size-5 animate-spin text-[#102f50]" />
            Memuat data siswa dan program...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="student-select" className="block text-xs font-semibold text-slate-700">
                Pilih Peserta *
              </label>
              <select
                id="student-select"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none"
              >
                <option value="">-- Pilih Peserta --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.nim})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="program-select" className="block text-xs font-semibold text-slate-700">
                  Program *
                </label>
                <select
                  id="program-select"
                  value={programId}
                  onChange={(e) => {
                    setProgramId(e.target.value);
                    setBatchId("");
                  }}
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none"
                >
                  <option value="">-- Pilih Program --</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="batch-select" className="block text-xs font-semibold text-slate-700">
                  Batch *
                </label>
                <select
                  id="batch-select"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none"
                >
                  <option value="">-- Pilih Batch --</option>
                  {availableBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="certificate-number-input" className="block text-xs font-semibold text-slate-700">
                Nomor Sertifikat *
              </label>
              <input
                id="certificate-number-input"
                type="text"
                placeholder="Contoh: GHS/2026/HTP/001"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="issued-at-input" className="block text-xs font-semibold text-slate-700">
                  Tanggal Terbit *
                </label>
                <input
                  id="issued-at-input"
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="path-input" className="block text-xs font-semibold text-slate-700">
                  Storage Path (Opsional)
                </label>
                <input
                  id="path-input"
                  type="text"
                  placeholder="Contoh: certificates/2026/GHS-001.pdf"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4066] disabled:opacity-50"
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Menerbitkan..." : "Terbitkan Sertifikat"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
