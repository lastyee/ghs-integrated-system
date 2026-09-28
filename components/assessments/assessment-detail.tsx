"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";

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
}: {
  assessmentId: string;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<ApiAssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Editable scores state per studentId
  const [scoreInputs, setScoreInputs] = useState<Record<string, { score: string; feedback: string }>>({});
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
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

      // Initialize inputs from existing scores
      const initialInputs: Record<string, { score: string; feedback: string }> = {};
      for (const s of assessmentData.scores) {
        initialInputs[s.studentId] = {
          score: s.score !== null ? String(s.score) : "",
          feedback: s.feedback ?? "",
        };
      }

      // If user is admin/staff and we have students/enrollments, load enrolled students
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

        for (const st of allStudents) {
          if (enrolledStudentIds.has(st.id) && !initialInputs[st.id]) {
            initialInputs[st.id] = { score: "", feedback: "" };
          }
        }
      }

      setScoreInputs(initialInputs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat detail.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    fetchAssessment();
  }, [fetchAssessment]);

  // Compute table rows
  const rows: StudentRowData[] = useMemo(() => {
    if (!assessment) return [];

    const existingScoresMap = new Map(assessment.scores.map((s) => [s.studentId, s]));
    const studentList: StudentRowData[] = [];

    // First add existing scores
    for (const s of assessment.scores) {
      studentList.push({
        studentId: s.studentId,
        nim: s.student.nim,
        studentName: s.student.name,
        scoreId: s.id,
        score: s.score,
        feedback: s.feedback,
      });
    }

    // Next add students in scoreInputs that don't have a score record yet (unscored enrolled students)
    for (const [stId] of Object.entries(scoreInputs)) {
      if (!existingScoresMap.has(stId)) {
        // Find if we have student info
        studentList.push({
          studentId: stId,
          nim: "-",
          studentName: `Peserta (${stId.substring(0, 8)})`,
          scoreId: null,
          score: null,
          feedback: null,
        });
      }
    }

    return studentList;
  }, [assessment, scoreInputs]);

  const handleSaveScore = async (studentId: string, existingScoreId: string | null) => {
    if (!assessment) return;
    const input = scoreInputs[studentId] ?? { score: "", feedback: "" };

    setInputErrors((prev) => ({ ...prev, [studentId]: "" }));
    setActionMessage(null);

    if (input.score.trim() === "") {
      setInputErrors((prev) => ({ ...prev, [studentId]: "Nilai tidak boleh kosong." }));
      return;
    }

    const numScore = Number(input.score);
    if (!Number.isFinite(numScore)) {
      setInputErrors((prev) => ({ ...prev, [studentId]: "Nilai harus berupa angka numerik." }));
      return;
    }

    if (numScore < 0 || numScore > assessment.maxScore) {
      setInputErrors((prev) => ({
        ...prev,
        [studentId]: `Nilai harus antara 0 dan ${assessment.maxScore}.`,
      }));
      return;
    }

    setSavingStudentId(studentId);

    try {
      if (existingScoreId) {
        // PATCH existing score
        const res = await fetch(`/api/assessments/${assessment.id}/scores/${existingScoreId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score: numScore,
            feedback: input.feedback.trim() || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Gagal memperbarui nilai.");
        }

        setActionMessage("Nilai berhasil diperbarui.");
      } else {
        // POST new score
        const res = await fetch(`/api/assessments/${assessment.id}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId,
            score: numScore,
            feedback: input.feedback.trim() || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Gagal menyimpan nilai.");
        }

        setActionMessage("Nilai berhasil disimpan.");
      }

      await fetchAssessment();
    } catch (err: unknown) {
      setInputErrors((prev) => ({
        ...prev,
        [studentId]: err instanceof Error ? err.message : "Terjadi kesalahan.",
      }));
    } finally {
      setSavingStudentId(null);
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
  const deleteBlockedReason = assessment.status === "COMPLETED"
    ? "Assessment COMPLETED tidak dapat dihapus."
    : assessment.scores.length > 0
      ? `Assessment memiliki ${assessment.scores.length} nilai.`
      : null;

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
              disabled={Boolean(deleteBlockedReason)}
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              title={deleteBlockedReason ?? undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Trash2 className="size-4" />
              Hapus Assessment
            </button>
            {deleteBlockedReason && (
              <p className="text-xs text-slate-500">{deleteBlockedReason}</p>
            )}
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
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-[#102f50]">Daftar Nilai Peserta</h2>
          <p className="mt-1 text-xs text-slate-500">
            Input dan tinjauan nilai mahasiswa untuk sesi {assessment.name}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="text-sm font-medium">Belum ada data peserta yang terdaftar untuk sesi ini.</p>
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
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const inputVal = scoreInputs[row.studentId]?.score ?? "";
                  const feedbackVal = scoreInputs[row.studentId]?.feedback ?? "";
                  const isScored = row.score !== null;
                  const isSaving = savingStudentId === row.studentId;
                  const rowErr = inputErrors[row.studentId];

                  return (
                    <tr key={row.studentId} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-[#123b63]">
                        {row.nim}
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#102f50]">
                        {row.studentName}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={assessment.maxScore}
                            value={inputVal}
                            onChange={(e) =>
                              setScoreInputs((prev) => ({
                                ...prev,
                                [row.studentId]: {
                                  score: e.target.value,
                                  feedback: prev[row.studentId]?.feedback ?? "",
                                },
                              }))
                            }
                            placeholder="-"
                            className={`h-9 w-20 rounded-lg border px-2.5 text-sm focus:outline-none ${
                              rowErr ? "border-[#c94242]" : "border-slate-200"
                            }`}
                          />
                          <span className="text-xs text-slate-400">/ {assessment.maxScore}</span>
                        </div>
                        {rowErr && (
                          <p className="mt-1 text-xs text-[#c94242]">{rowErr}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <input
                          type="text"
                          value={feedbackVal}
                          onChange={(e) =>
                            setScoreInputs((prev) => ({
                              ...prev,
                              [row.studentId]: {
                                score: prev[row.studentId]?.score ?? "",
                                feedback: e.target.value,
                              },
                            }))
                          }
                          placeholder="Catatan opsional..."
                          className="h-9 w-full min-w-40 rounded-lg border border-slate-200 px-3 text-xs focus:outline-none"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isScored
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-[#fff6d9] text-[#a57c00] border border-[#f5df9e]"
                          }`}
                        >
                          {isScored ? "SCORED" : "NOT SCORED"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSaveScore(row.studentId, row.scoreId)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0c233c] disabled:opacity-50"
                        >
                          <Save className="size-3.5" />
                          {isSaving ? "Menyimpan..." : row.scoreId ? "Update" : "Simpan"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {deleteOpen && (
        <DeleteConfirmationDialog
          title="Hapus assessment ini?"
          recordName={assessment.name}
          description="Assessment ini masih berstatus OPEN dan belum memiliki nilai. Data assessment akan dihapus permanen."
          confirmLabel="Hapus Permanen"
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
