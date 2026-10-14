"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Trash2, Edit2, X, Plus, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";

export interface ApiScoreItem {
  id: string;
  assessmentId: string;
  studentId: string;
  score: number | null;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    nim: string;
    name: string;
  };
}

export interface ApiAssessmentDetail {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  description: string | null;
  type: string;
  maxScore: number;
  status: "OPEN" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  class: {
    id: string;
    name: string;
    batch: {
      id: string;
      name: string;
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
  };
  scores: ApiScoreItem[];
}

interface StudentRowData {
  studentId: string;
  nim: string;
  studentName: string;
  scoreId: string | null;
  score: number | null;
  feedback: string | null;
}

export function AssessmentDetail({
  assessmentId,
  canDelete = false,
  canDeleteScores = false,
  canCreateScores = false,
  isStudent = false,
  currentStudentId,
}: {
  assessmentId: string;
  canDelete?: boolean;
  canDeleteScores?: boolean;
  canCreateScores?: boolean;
  isStudent?: boolean;
  currentStudentId?: string;
}) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<ApiAssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [enrolledStudents, setEnrolledStudents] = useState<Array<{ id: string; nim: string; name: string }>>([]);
  const [scoreModal, setScoreModal] = useState<{
    isOpen: boolean;
    scoreId: string | null;
    studentId: string;
    score: string;
    feedback: string;
  }>({
    isOpen: false,
    scoreId: null,
    studentId: "",
    score: "",
    feedback: "",
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchAssessment = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    setNotFound(false);

    try {
      const [resAssessment, resStudents, resEnrollments] = await Promise.all([
        fetch(`/api/assessments/${assessmentId}`),
        fetch("/api/students"),
        fetch("/api/enrollments"),
      ]);

      if (resAssessment.status === 401 || resAssessment.status === 403) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      if (resAssessment.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (!resAssessment.ok) {
        throw new Error(`Gagal memuat assessment (HTTP ${resAssessment.status})`);
      }

      const assessmentData: ApiAssessmentDetail = await resAssessment.json();
      setAssessment(assessmentData);

      if (resStudents.ok && resEnrollments.ok) {
        const studentsData = await resStudents.json();
        const enrollmentsData = await resEnrollments.json();
        const allStudents = studentsData.data || [];
        const allEnrollments = enrollmentsData.data || [];

        const batchId = assessmentData.class.batch.id;
        const enrolledStudentIds = new Set(
          allEnrollments
            .filter((e: { batchId: string }) => e.batchId === batchId)
            .map((e: { studentId: string }) => e.studentId)
        );

        const enrolled = allStudents.filter((st: { id: string }) => enrolledStudentIds.has(st.id));
        setEnrolledStudents(enrolled);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat detail.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAssessment();
  }, [fetchAssessment]);

  // Compute table rows
  const rows: StudentRowData[] = useMemo(() => {
    if (!assessment) return [];

    let filteredScores = assessment.scores;
    if (isStudent && currentStudentId) {
      filteredScores = filteredScores.filter(s => s.studentId === currentStudentId);
    }

    return filteredScores.map((s) => ({
      studentId: s.studentId,
      nim: s.student.nim,
      studentName: s.student.name,
      scoreId: s.id,
      score: s.score,
      feedback: s.feedback,
    }));
  }, [assessment, isStudent, currentStudentId]);

  const closeScoreModal = () => {
    if (submitLoading) return;
    setScoreModal({ isOpen: false, scoreId: null, studentId: "", score: "", feedback: "" });
    setFormErrors({});
    setSubmitError(null);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessment) return;

    const errs: Record<string, string> = {};
    if (!scoreModal.studentId) errs.studentId = "Peserta wajib dipilih.";
    if (scoreModal.score.trim() === "") {
      errs.score = "Nilai wajib diisi.";
    } else {
      const numScore = Number(scoreModal.score);
      if (!Number.isFinite(numScore)) {
        errs.score = "Nilai harus berupa angka numerik.";
      } else if (numScore < 0 || numScore > assessment.maxScore) {
        errs.score = `Nilai harus antara 0 dan ${assessment.maxScore}.`;
      }
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    try {
      setSubmitLoading(true);
      setSubmitError(null);
      setFormErrors({});
      setActionMessage(null);

      const numScore = Number(scoreModal.score);
      const isExisting = !!scoreModal.scoreId;

      if (isExisting) {
        const res = await fetch(`/api/assessments/${assessment.id}/scores/${scoreModal.scoreId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score: numScore,
            feedback: scoreModal.feedback.trim() || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Gagal memperbarui nilai.");
        }
        setActionMessage("Nilai berhasil diperbarui.");
      } else {
        const res = await fetch(`/api/assessments/${assessment.id}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: scoreModal.studentId,
            score: numScore,
            feedback: scoreModal.feedback.trim() || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Gagal menyimpan nilai. Mungkin nilai untuk peserta ini sudah ada.");
        }
        setActionMessage("Nilai berhasil disimpan.");
      }

      closeScoreModal();
      await fetchAssessment();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8 text-center text-slate-500">
        <div className="inline-block size-8 animate-spin rounded-full border-4 border-solid border-[#102f50] border-r-transparent align-[-0.125em]" />
        <p className="mt-4 text-sm font-medium">Memuat detail assessment...</p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <h2 className="text-lg font-bold">Akses Ditolak (403)</h2>
          <p className="mt-1 text-sm text-red-700">
            Anda tidak memiliki izin untuk melihat sesi penilaian ini.
          </p>
          <Link
            href="/assessments"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-sm font-semibold text-white"
          >
            <ArrowLeft className="size-4" /> Kembali ke Assessment
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !assessment) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#102f50]">Data Tidak Ditemukan (404)</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sesi assessment dengan ID yang diminta tidak ditemukan di database.
          </p>
          <Link
            href="/assessments"
            className="mt-5 inline-flex rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Kembali ke daftar
          </Link>
        </div>
      </div>
    );
  }

  const scoredCount = assessment.scores.filter((s) => s.score !== null).length;
  const totalScores = assessment.scores.length;
  const averageScore =
    scoredCount > 0
      ? (
          assessment.scores.reduce((acc, s) => acc + (s.score ?? 0), 0) / scoredCount
        ).toFixed(1)
      : "-";
  const deleteAssessment = async () => {
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `Gagal menghapus assessment (HTTP ${response.status}).`);
      }
      router.push("/assessments");
      router.refresh();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus assessment.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <Link
        href="/assessments"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:underline"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Assessment
      </Link>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">
            Dashboard / Assessment / {assessment.id}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">{assessment.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Detail informasi sesi penilaian dan daftar perolehan nilai peserta
          </p>
        </div>
        {canDelete && (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
            >
              <Trash2 className="size-4" />
              Hapus Assessment
            </button>
          </div>
        )}
      </div>

      {actionMessage && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionMessage}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <CheckCircle2 className="size-4 text-[#c94242]" />
          <h2 className="font-bold text-[#102f50]">Assessment Information</h2>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Nama Assessment</p>
            <p className="mt-1 text-sm font-semibold text-[#102f50]">{assessment.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Type</p>
            <p className="mt-1 text-sm font-semibold text-[#102f50]">{assessment.type}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mata Pelajaran</p>
            <p className="mt-1 text-sm font-semibold text-[#102f50]">
              [{assessment.subject.code}] {assessment.subject.name}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Kelas / Batch</p>
            <p className="mt-1 text-sm font-semibold text-[#102f50]">
              {assessment.class.name} ({assessment.class.batch.name})
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Nilai Maksimum</p>
            <p className="mt-1 text-sm font-semibold text-[#102f50]">{assessment.maxScore}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Status Sesi</p>
            <p className="mt-1">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  assessment.status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-[#fff6d9] text-[#a57c00] border border-[#f5df9e]"
                }`}
              >
                {assessment.status}
              </span>
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">Deskripsi / Catatan</p>
            <p className="mt-1 text-sm text-slate-700">
              {assessment.description || "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-500">Total Dinilai</p>
          <p className="mt-2 text-2xl font-bold text-[#102f50]">{scoredCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-500">Total Peserta Record</p>
          <p className="mt-2 text-2xl font-bold text-[#102f50]">{totalScores}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-500">Rata-rata Nilai</p>
          <p className="mt-2 text-2xl font-bold text-[#102f50]">{averageScore}</p>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-[#102f50]">
              {isStudent ? "Nilai Saya" : "Daftar Nilai Peserta"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isStudent
                ? "Perolehan nilai Anda untuk assessment ini"
                : `Input dan tinjauan nilai mahasiswa untuk sesi ${assessment.name}`
              }
            </p>
          </div>
          {canCreateScores && (
            <button
              type="button"
              onClick={() => setScoreModal({ isOpen: true, scoreId: null, studentId: "", score: "", feedback: "" })}
              className="inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0c233c] transition-colors"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Berikan Nilai</span>
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="text-sm font-medium">Belum ada nilai peserta.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">NIM</th>
                  <th className="px-5 py-3 font-semibold">Nama Mahasiswa</th>
                  <th className="px-5 py-3 font-semibold">Nilai (Maks. {assessment.maxScore})</th>
                  <th className="px-5 py-3 font-semibold">Feedback / Catatan</th>
                  {(!isStudent || canCreateScores || canDeleteScores) && (
                    <th className="px-5 py-3 font-semibold">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  return (
                    <tr key={row.studentId} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-[#123b63]">
                        {row.nim}
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#102f50]">
                        {row.studentName}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-700">{row.score !== null ? row.score : "-"}</span>
                        <span className="text-xs text-slate-400"> / {assessment.maxScore}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-slate-600">{row.feedback || "-"}</span>
                      </td>
                      {(!isStudent || canCreateScores || canDeleteScores) && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {canCreateScores && (
                              <button
                                type="button"
                                onClick={() => setScoreModal({
                                  isOpen: true,
                                  scoreId: row.scoreId,
                                  studentId: row.studentId,
                                  score: row.score !== null ? String(row.score) : "",
                                  feedback: row.feedback || ""
                                })}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                <Edit2 className="size-3.5" />
                                Edit
                              </button>
                            )}
                            {canDeleteScores && row.scoreId && (
                              <SoftDeleteAction
                                endpoint={`/api/assessments/${assessmentId}/scores/${row.scoreId}`}
                                recordName="Nilai"
                                identifier={`${row.studentName} / ${row.nim}`}
                                description="Nilai akan disembunyikan dari data aktif. Riwayat penilaian tetap tersimpan."
                                onDeleted={fetchAssessment}
                              />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Berikan Nilai */}
      {scoreModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleSaveModal} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-[#102f50]">
                {scoreModal.scoreId ? "Edit Nilai Peserta" : "Berikan Nilai Peserta"}
              </h2>
              <button type="button" onClick={closeScoreModal} disabled={submitLoading} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            {submitError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {submitError}
              </div>
            )}

            <div className="mt-4 grid gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Peserta *</label>
                <select
                  value={scoreModal.studentId}
                  onChange={(e) => setScoreModal(prev => ({ ...prev, studentId: e.target.value }))}
                  disabled={submitLoading || !!scoreModal.scoreId}
                  className={`mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm focus:outline-none ${formErrors.studentId ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                >
                  <option value="" disabled>Pilih Peserta</option>
                  {enrolledStudents.map(st => (
                    <option key={st.id} value={st.id}>{st.name} — {st.nim}</option>
                  ))}
                  {/* Fallback for existing scored student not in enrolledList */}
                  {scoreModal.studentId && !enrolledStudents.some(st => st.id === scoreModal.studentId) && (
                    <option value={scoreModal.studentId}>
                      {rows.find(r => r.studentId === scoreModal.studentId)?.studentName || "Peserta"} — {rows.find(r => r.studentId === scoreModal.studentId)?.nim || "-"}
                    </option>
                  )}
                </select>
                {formErrors.studentId && <p className="mt-1 text-xs text-red-600">{formErrors.studentId}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Nilai *</label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min="0"
                    max={assessment.maxScore}
                    value={scoreModal.score}
                    onChange={(e) => setScoreModal(prev => ({ ...prev, score: e.target.value }))}
                    disabled={submitLoading}
                    placeholder={`0 - ${assessment.maxScore}`}
                    className={`h-10 w-full rounded-lg border bg-white px-3 pr-12 text-sm focus:outline-none ${formErrors.score ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                    / {assessment.maxScore}
                  </span>
                </div>
                {formErrors.score && <p className="mt-1 text-xs text-red-600">{formErrors.score}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Catatan</label>
                <input
                  type="text"
                  value={scoreModal.feedback}
                  onChange={(e) => setScoreModal(prev => ({ ...prev, feedback: e.target.value }))}
                  disabled={submitLoading}
                  placeholder="Catatan nilai / feedback opsional"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={closeScoreModal} disabled={submitLoading} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Batal
              </button>
              <button type="submit" disabled={submitLoading} className="inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition disabled:opacity-50">
                {submitLoading && <Loader2 className="size-4 animate-spin" />}
                Simpan Nilai
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteOpen && (
        <DeleteConfirmationDialog
          recordName={assessment.name}
          description="Assessment dan seluruh nilai historisnya akan tetap tersimpan."
          pending={deletePending}
          error={deleteError}
          onCancel={() => {
            if (!deletePending) setDeleteOpen(false);
          }}
          onConfirm={deleteAssessment}
        />
      )}
    </div>
  );
}
