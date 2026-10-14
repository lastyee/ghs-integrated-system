"use client";

import Link from "next/link";
import { AlertCircle, Eye, FileCheck2, MoreHorizontal, Plus, RotateCcw, Search, Trash2, X, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";
import { useToast } from "@/components/common/toast-provider";
import { AssessmentType, AssessmentSessionStatus } from "@prisma/client";

export interface ApiAssessment {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  description: string | null;
  type: AssessmentType;
  maxScore: number;
  status: AssessmentSessionStatus;
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
  _count?: {
    scores: number;
  };
}

export interface ApiClass {
  id: string;
  name: string;
  batch?: {
    id: string;
    name: string;
  };
}

export interface ApiSubject {
  id: string;
  name: string;
  code: string;
}

type FormValues = {
  name: string;
  description: string;
  type: AssessmentType;
  classId: string;
  subjectId: string;
  studentId: string;
  maxScore: string;
  status: AssessmentSessionStatus;
};

const emptyForm: FormValues = {
  name: "",
  description: "",
  type: AssessmentType.ASSIGNMENT,
  classId: "",
  subjectId: "",
  studentId: "",
  maxScore: "",
  status: AssessmentSessionStatus.OPEN,
};

const types: AssessmentType[] = [
  AssessmentType.ASSIGNMENT,
  AssessmentType.PRACTICAL,
  AssessmentType.EXAM,
  AssessmentType.INTERVIEW,
  AssessmentType.OTHER,
];

const statuses: AssessmentSessionStatus[] = [
  AssessmentSessionStatus.OPEN,
  AssessmentSessionStatus.COMPLETED,
];

export function AssessmentsPage({ canDelete = false, canCreate = false }: { canDelete?: boolean; canCreate?: boolean }) {
  const { showToast } = useToast();
  const [assessments, setAssessments] = useState<ApiAssessment[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [type, setType] = useState<"ALL" | AssessmentType>("ALL");
  const [subjectId, setSubjectId] = useState("ALL");
  const [classId, setClassId] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | AssessmentSessionStatus>("ALL");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    completed: 0,
  });

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues | "general", string>>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ApiAssessment | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [allStudents, setAllStudents] = useState<Array<{ id: string; nim: string; name: string }>>([]);
  const [allEnrollments, setAllEnrollments] = useState<Array<{ studentId: string; batchId: string }>>([]);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [selectedAssessmentForScore, setSelectedAssessmentForScore] = useState<ApiAssessment | null>(null);
  const [scoreForm, setScoreForm] = useState({ studentId: "", assessmentId: "", score: "", feedback: "" });
  const [scoreErrors, setScoreErrors] = useState<Record<string, string>>({});
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const [scoreNotice, setScoreNotice] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (query !== debouncedQuery) {
        setDebouncedQuery(query);
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [query, debouncedQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        ...(type !== "ALL" ? { type } : {}),
        ...(subjectId !== "ALL" ? { subjectId } : {}),
        ...(classId !== "ALL" ? { classId } : {}),
        ...(status !== "ALL" ? { status } : {}),
      });

      const [resAssessments, resClasses, resSubjects, resStudents, resEnrollments] = await Promise.all([
        fetch(`/api/assessments?${params.toString()}`),
        fetch("/api/classes"),
        fetch("/api/subjects"),
        fetch("/api/students?limit=100"),
        fetch("/api/enrollments"),
      ]);

      if (resAssessments.status === 403) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      if (!resAssessments.ok) {
        throw new Error(`Gagal memuat assessment (HTTP ${resAssessments.status})`);
      }

      const assessmentsJson = await resAssessments.json();
      const list = Array.isArray(assessmentsJson) ? assessmentsJson : (assessmentsJson.data || []);
      setAssessments(list);

      if (assessmentsJson.pagination) {
        setTotal(assessmentsJson.pagination.total);
        setTotalPages(assessmentsJson.pagination.totalPages);
      } else {
        setTotal(list.length);
        setTotalPages(1);
      }

      if (assessmentsJson.stats) {
        setStats({
          total: assessmentsJson.stats.total ?? list.length,
          open: assessmentsJson.stats.open ?? assessmentsJson.stats.active ?? 0,
          completed: assessmentsJson.stats.completed ?? 0,
        });
      }

      if (resClasses.ok) {
        const classesData = await resClasses.json();
        setClasses(classesData.data || classesData || []);
      }

      if (resSubjects.ok) {
        const subjectsData = await resSubjects.json();
        setSubjects(subjectsData.data || subjectsData || []);
      }
      if (resStudents.ok) {
        const d = await resStudents.json();
        const list = (d.data || d || []).slice().sort((a: { name: string }, b: { name: string }) =>
          a.name.localeCompare(b.name)
        );
        setAllStudents(list);
      }
      if (resEnrollments.ok) {
        const d = await resEnrollments.json();
        setAllEnrollments(d.data || d || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, type, subjectId, classId, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm(emptyForm);
    setErrors({});
    setEditingId(null);
    setModal("create");
  };

  const openEdit = (item: ApiAssessment) => {
    setForm({
      name: item.name,
      description: item.description ?? "",
      type: item.type,
      classId: item.classId,
      subjectId: item.subjectId,
      studentId: "",
      maxScore: String(item.maxScore),
      status: item.status,
    });
    setErrors({});
    setEditingId(item.id);
    setModal("edit");
    setOpenMenu(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof FormValues | "general", string>> = {};
    if (!form.name.trim()) nextErrors.name = "Nama assessment wajib diisi.";
    if (!form.type) nextErrors.type = "Type wajib dipilih.";
    if (modal === "create" && !form.studentId) nextErrors.studentId = "Peserta wajib dipilih.";
    if (modal === "edit" && !form.classId) nextErrors.classId = "Kelas wajib dipilih.";
    if (!form.subjectId) nextErrors.subjectId = "Mata pelajaran wajib dipilih.";
    const numMaxScore = Number(form.maxScore);
    if (!form.maxScore || Number.isNaN(numMaxScore) || numMaxScore <= 0) {
      nextErrors.maxScore = "Nilai maksimum harus berupa angka lebih besar dari 0.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setNotice("");

    try {
      if (modal === "create") {
        const res = await fetch("/api/assessments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
            type: form.type,
            studentId: form.studentId,
            subjectId: form.subjectId,
            maxScore: Number(form.maxScore),
            status: form.status,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.errors) {
            const fieldErrors: Partial<Record<keyof FormValues | "general", string>> = {};
            for (const [key, val] of Object.entries(errData.errors)) {
              if (Array.isArray(val) && val.length > 0) {
                fieldErrors[key as keyof FormValues] = val[0];
              }
            }
            if (errData.message) fieldErrors.general = errData.message;
            setErrors(fieldErrors);
            return;
          }
          throw new Error(errData.message || "Gagal membuat assessment.");
        }

        setNotice("Assessment berhasil dibuat.");
      } else if (modal === "edit" && editingId) {
        const res = await fetch(`/api/assessments/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
            type: form.type,
            classId: form.classId,
            subjectId: form.subjectId,
            maxScore: Number(form.maxScore),
            status: form.status,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Gagal memperbarui assessment.");
        }

        setNotice("Assessment berhasil diperbarui.");
      }

      setModal(null);
      await fetchData();
    } catch (err: unknown) {
      setErrors((prev) => ({
        ...prev,
        general: err instanceof Error ? err.message : "Gagal menyimpan data.",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const requestDelete = (item: ApiAssessment) => {
    setOpenMenu(null);
    setDeleteError(null);
    setDeleteCandidate(item);
  };

  const deleteAssessment = async () => {
    if (!deleteCandidate) return;

    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/assessments/${deleteCandidate.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `Gagal menghapus assessment (HTTP ${response.status}).`);
      }

      setDeleteCandidate(null);
      showToast("success", "Assessment berhasil disembunyikan dari data aktif.");
      await fetchData();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus assessment.");
    } finally {
      setDeletePending(false);
    }
  };

  const availableStudentsForScore = useMemo(() => {
    if (!scoreForm.assessmentId) return allStudents;
    const a = selectedAssessmentForScore || assessments.find(x => x.id === scoreForm.assessmentId);
    if (!a?.class?.batch?.id) return [];
    const enrolledIds = new Set(allEnrollments.filter(e => e.batchId === a.class.batch.id).map(e => e.studentId));
    return allStudents.filter(s => enrolledIds.has(s.id));
  }, [scoreForm.assessmentId, selectedAssessmentForScore, assessments, allEnrollments, allStudents]);

  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!scoreForm.studentId) errs.studentId = "Peserta wajib dipilih.";
    if (!scoreForm.assessmentId) errs.assessmentId = "Assessment wajib dipilih.";

    const selectedAssessment = selectedAssessmentForScore || assessments.find(a => a.id === scoreForm.assessmentId);
    if (!scoreForm.score.trim()) {  errs.score = "Nilai wajib diisi.";
    } else {
      const numScore = Number(scoreForm.score);
      if (!Number.isFinite(numScore)) {
        errs.score = "Nilai harus berupa angka numerik.";
      } else if (numScore < 0 || (selectedAssessment && numScore > selectedAssessment.maxScore)) {
        errs.score = `Nilai harus antara 0 dan ${selectedAssessment?.maxScore || 100}.`;
      }
    }

    if (Object.keys(errs).length > 0) {
      setScoreErrors(errs);
      return;
    }

    setScoreSubmitting(true);
    setScoreError(null);
    setScoreNotice(null);
    setScoreErrors({});

    try {
      const res = await fetch(`/api/assessments/${scoreForm.assessmentId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: scoreForm.studentId,
          score: Number(scoreForm.score),
          feedback: scoreForm.feedback.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Gagal menyimpan nilai. Mungkin nilai untuk peserta ini sudah ada.");
      }

      setScoreNotice("Nilai berhasil diberikan kepada peserta.");
      setScoreForm({ studentId: "", assessmentId: "", score: "", feedback: "" });

      await fetchData();
    } catch (err: unknown) {
      setScoreError(err instanceof Error ? err.message : "Gagal menyimpan nilai.");
    } finally {
      setScoreSubmitting(false);
    }
  };

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <h2 className="text-lg font-bold">Akses Ditolak (403)</h2>
          <p className="mt-1 text-sm text-red-700">
            Anda tidak memiliki izin untuk mengakses halaman Penilaian (Assessment).
          </p>
        </div>
      </div>
    );
  }

  const totalCount = stats.total;
  const activeCount = stats.open;
  const completedCount = stats.completed;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Assessment</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Assessment</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola penilaian dan nilai peserta</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b03535] transition-colors"
          >
            <Plus className="size-4" />
            Tambah Assessment
          </button>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Assessment"
          value={String(totalCount)}
          description="Total sesi penilaian terdaftar"
          icon={FileCheck2}
          tone="navy"
        />
        <StatCard
          label="Active (Open)"
          value={String(activeCount)}
          description="Sesi penilaian aktif"
          icon={FileCheck2}
          tone="yellow"
        />
        <StatCard
          label="Completed"
          value={String(completedCount)}
          description="Sesi penilaian selesai"
          icon={FileCheck2}
          tone="blue"
        />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[2fr_1fr_1fr_1fr_auto] xl:items-end">
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Cari Assessment</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, mata pelajaran, kelas..."
                className="h-10 w-full min-w-0 rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#102f50] focus:outline-none"
              />
            </span>
          </label>
          <Select
            label="Type"
            value={type}
            onChange={(v) => {
              setType(v as "ALL" | AssessmentType);
              setPage(1);
            }}
            options={["ALL", ...types]}
          />
          <Select
            label="Subject"
            value={subjectId}
            onChange={(v) => {
              setSubjectId(v);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: "Semua Subject" },
              ...subjects.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="Class"
            value={classId}
            onChange={(v) => {
              setClassId(v);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: "Semua Kelas" },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v as "ALL" | AssessmentSessionStatus);
              setPage(1);
            }}
            options={["ALL", ...statuses]}
          />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDebouncedQuery("");
              setType("ALL");
              setSubjectId("ALL");
              setClassId("ALL");
              setStatus("ALL");
              setPage(1);
            }}
            className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="size-4" />
            Reset Filter
          </button>
        </div>
      </section>

      {notice && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchData}
            className="rounded bg-red-100 px-3 py-1 font-semibold text-red-700 hover:bg-red-200"
          >
            Coba Lagi
          </button>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-[#102f50]">Daftar Assessment</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Memuat data..." : `${total} assessment ditemukan`}
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="inline-block size-8 animate-spin rounded-full border-4 border-solid border-[#102f50] border-r-transparent align-[-0.125em]" />
            <p className="mt-4 text-sm font-medium">Memuat data assessment...</p>
          </div>
        ) : assessments.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-500">
            <p className="text-sm font-semibold text-slate-700">Belum ada assessment yang ditemukan.</p>
            <p className="mt-1 text-xs text-slate-500">
              Silakan buat assessment baru dengan tombol &quot;Tambah Assessment&quot; di atas.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-225 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      "Assessment",
                      "Type",
                      "Subject",
                      "Class",
                      "Batch",
                      "Max Score",
                      "Progress",
                      "Status",
                      "Action",
                    ].map((h) => (
                      <th key={h} className="px-5 py-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assessments.map((item) => (
                    <AssessmentRow
                      key={item.id}
                      item={item}
                      openMenu={openMenu}
                      setOpenMenu={setOpenMenu}
                      onEdit={openEdit}
                      canDelete={canDelete}
                      onDelete={requestDelete}
                      onScore={(it) => {
                        setSelectedAssessmentForScore(it);
                        setScoreForm({ studentId: "", assessmentId: it.id, score: "", feedback: "" });
                        setScoreNotice(null);
                        setScoreError(null);
                        setScoreErrors({});
                        setScoreModalOpen(true);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {assessments.map((item) => (
                <AssessmentCard
                  key={item.id}
                  item={item}
                  openMenu={openMenu}
                  setOpenMenu={setOpenMenu}
                  onEdit={openEdit}
                  canDelete={canDelete}
                  onDelete={requestDelete}
                  onScore={(it) => {
                    setSelectedAssessmentForScore(it);
                    setScoreForm({ studentId: "", assessmentId: it.id, score: "", feedback: "" });
                    setScoreNotice(null);
                    setScoreError(null);
                    setScoreErrors({});
                    setScoreModalOpen(true);
                  }}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                <span className="text-sm text-slate-500">
                  Halaman {page} dari {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {modal && (
        <AssessmentModal
          mode={modal}
          values={form}
          errors={errors}
          classes={classes}
          subjects={subjects}
          students={allStudents}
          submitting={submitting}
          onChange={(field, val) => {
            setForm((c) => ({ ...c, [field]: val }));
            if (errors[field as keyof FormValues | "general"]) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next[field as keyof FormValues | "general"];
                delete next.general;
                return next;
              });
            }
          }}
          onSubmit={submit}
          onClose={() => setModal(null)}
        />
      )}
      {deleteCandidate && (
        <DeleteConfirmationDialog
          recordName={deleteCandidate.name}
          description="Assessment dan seluruh nilai historisnya akan tetap tersimpan."
          pending={deletePending}
          error={deleteError}
          onCancel={() => {
            if (!deletePending) setDeleteCandidate(null);
          }}
          onConfirm={deleteAssessment}
        />
      )}

      {scoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleScoreSubmit} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-bold text-[#102f50]">Berikan Penilaian</h2>
                <p className="mt-1 text-xs text-slate-500">Berikan nilai kepada peserta secara individual</p>
              </div>
              <button type="button" onClick={() => { setScoreModalOpen(false); setSelectedAssessmentForScore(null); }} disabled={scoreSubmitting} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            {scoreNotice && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                {scoreNotice}
              </div>
            )}
            {scoreError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {scoreError}
              </div>
            )}

            <div className="mt-4 grid gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">1. Peserta *</label>
                <select
                  value={scoreForm.studentId}
                  onChange={(e) => {
                    setScoreForm(prev => ({ ...prev, studentId: e.target.value, assessmentId: "" }));
                  }}
                  disabled={scoreSubmitting}
                  className={`mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm focus:outline-none ${scoreErrors.studentId ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                >
                  <option value="" disabled>Pilih Peserta</option>
                  {availableStudentsForScore.map(st => (
                    <option key={st.id} value={st.id}>{st.name} — {st.nim}</option>
                  ))}
                </select>
                {scoreErrors.studentId && <p className="mt-1 text-xs text-red-600">{scoreErrors.studentId}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">2. Assessment *</label>
                {(() => {
                  const sel = selectedAssessmentForScore || assessments.find(a => a.id === scoreForm.assessmentId);
                  if (!sel) return <div className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">-</div>;
                  return (
                    <div className="mt-1 flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                      {sel.name} — {sel.subject.name} {sel.class?.batch?.name ? `— ${sel.class.batch.name}` : ""}
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">3. Nilai *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={scoreForm.score}
                    onChange={(e) => setScoreForm(prev => ({ ...prev, score: e.target.value }))}
                    disabled={scoreSubmitting}
                    placeholder="Contoh: 85"
                    className={`mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm focus:outline-none ${scoreErrors.score ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                  />
                  {scoreErrors.score && <p className="mt-1 text-xs text-red-600">{scoreErrors.score}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">4. Nilai Maksimum</label>
                  <input
                    type="text"
                    value={(selectedAssessmentForScore || assessments.find(a => a.id === scoreForm.assessmentId))?.maxScore || "-"}
                    disabled
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">5. Catatan</label>
                <input
                  type="text"
                  value={scoreForm.feedback}
                  onChange={(e) => setScoreForm(prev => ({ ...prev, feedback: e.target.value }))}
                  disabled={scoreSubmitting}
                  placeholder="Catatan / feedback untuk peserta (opsional)"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => { setScoreModalOpen(false); setSelectedAssessmentForScore(null); }} disabled={scoreSubmitting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Batal
              </button>
              <button type="submit" disabled={scoreSubmitting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition disabled:opacity-50 min-w-[140px]">
                {scoreSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Nilai</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: readonly (string | { value: string; label: string })[];
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
      >
        {options.map((opt) => {
          const val = typeof opt === "string" ? opt : opt.value;
          const lbl = typeof opt === "string" ? (opt === "ALL" ? `Semua ${label}` : opt) : opt.label;
          return (
            <option key={val} value={val}>
              {lbl}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function AssessmentRow({
  item,
  openMenu,
  setOpenMenu,
  onEdit,
  canDelete,
  onDelete,
  onScore,
}: {
  item: ApiAssessment;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onEdit: (item: ApiAssessment) => void;
  canDelete: boolean;
  onDelete: (item: ApiAssessment) => void;
  onScore: (item: ApiAssessment) => void;
}) {
  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-5 py-4 font-semibold text-[#102f50]">
        <Link href={`/assessments/${item.id}`} className="hover:underline">
          {item.name}
        </Link>
      </td>
      <td className="px-5 py-4">
        <TypeBadge type={item.type} />
      </td>
      <td className="px-5 py-4 text-slate-600">{item.subject.name}</td>
      <td className="px-5 py-4 text-slate-600">{item.class.name}</td>
      <td className="px-5 py-4 text-slate-600">{item.class.batch.name}</td>
      <td className="px-5 py-4 font-medium text-slate-700">{item.maxScore}</td>
      <td className="px-5 py-4 text-slate-600">{item._count?.scores ?? 0} dinilai</td>
      <td className="px-5 py-4">
        <StatusBadge status={item.status} />
      </td>
      <td className="relative px-5 py-4">
        <Actions
          item={item}
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          onEdit={onEdit}
          canDelete={canDelete}
          onDelete={onDelete}
          onScore={onScore}
        />
      </td>
    </tr>
  );
}

function AssessmentCard({
  item,
  openMenu,
  setOpenMenu,
  onEdit,
  canDelete,
  onDelete,
  onScore,
}: {
  item: ApiAssessment;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onEdit: (item: ApiAssessment) => void;
  canDelete: boolean;
  onDelete: (item: ApiAssessment) => void;
  onScore: (item: ApiAssessment) => void;
}) {
  return (
    <article className="p-5">
      <div className="flex justify-between gap-3">
        <div>
          <Link href={`/assessments/${item.id}`} className="font-semibold text-[#102f50] hover:underline">
            {item.name}
          </Link>
          <p className="mt-1 text-xs text-[#123b63]">
            {item.type} · Max {item.maxScore}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {item.subject.name} · {item.class.name} ({item.class.batch.name})
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">{item._count?.scores ?? 0} peserta dinilai</span>
        <Actions
          item={item}
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          onEdit={onEdit}
          canDelete={canDelete}
          onDelete={onDelete}
          onScore={onScore}
        />
      </div>
    </article>
  );
}

function Actions({
  item,
  openMenu,
  setOpenMenu,
  onEdit,
  canDelete,
  onDelete,
  onScore,
}: {
  item: ApiAssessment;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onEdit: (item: ApiAssessment) => void;
  canDelete: boolean;
  onDelete: (item: ApiAssessment) => void;
  onScore: (item: ApiAssessment) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/assessments/${item.id}`}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
        aria-label={`Lihat ${item.name}`}
      >
        <Eye className="size-4" />
      </Link>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === item.id ? null : item.id)}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          aria-label={`Menu ${item.name}`}
        >
          <MoreHorizontal className="size-4" />
        </button>
        {openMenu === item.id && (
          <div className="absolute right-0 top-10 z-10 w-56 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg">
            <Link
              href={`/assessments/${item.id}`}
              className="block rounded-md px-3 py-2 hover:bg-slate-50 font-medium"
            >
              Detail Nilai
            </Link>
            {item.status === "OPEN" && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onScore(item);
                }}
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-50 font-medium text-[#102f50]"
              >
                Berikan Nilai
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-50 font-medium text-slate-700"
            >
              Edit Info
            </button>
            {canDelete && (
              <>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-medium text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="size-3.5" />
                  Hapus
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: AssessmentType }) {
  return (
    <span className="inline-flex rounded-full bg-[#e8f2f8] px-2.5 py-1 text-[11px] font-semibold text-[#357092]">
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: AssessmentSessionStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        status === "COMPLETED"
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-[#fff6d9] text-[#a57c00] border border-[#f5df9e]"
      }`}
    >
      {status}
    </span>
  );
}

function AssessmentModal({
  mode,
  values,
  errors,
  classes,
  subjects,
  students,
  submitting,
  onChange,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  values: FormValues;
  errors: Partial<Record<keyof FormValues | "general", string>>;
  classes: ApiClass[];
  subjects: ApiSubject[];
  students?: Array<{ id: string; nim: string; name: string }>;
  submitting: boolean;
  onChange: (field: keyof FormValues, val: string | number) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-bold text-[#102f50]">
              {mode === "create" ? "Tambah Assessment" : "Edit Assessment"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Formulir informasi sesi penilaian peserta
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {errors.general && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#c94242]/30 bg-red-50 p-3 text-xs text-[#c94242]">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-[#c94242]" />
            <span>{errors.general}</span>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              Nama Assessment *
            </span>
            <input
              value={values.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="Contoh: FINAL TEST / Mid Assignment"
              className={`h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                errors.name ? "border-[#c94242]" : "border-slate-200"
              }`}
            />
            {errors.name && (
              <span className="mt-1 block text-xs text-[#c94242]">{errors.name}</span>
            )}
          </label>

          {mode === "create" ? (
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Peserta *</span>
              <select
                value={values.studentId || ""}
                onChange={(e) => onChange("studentId", e.target.value)}
                className={`h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                  errors.studentId ? "border-[#c94242]" : "border-slate-200"
                }`}
              >
                <option value="">Pilih Peserta</option>
                {students?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.nim}
                  </option>
                ))}
              </select>
              {errors.studentId && (
                <span className="mt-1 block text-xs text-[#c94242]">{errors.studentId}</span>
              )}
            </label>
          ) : (
            <div className="flex flex-col justify-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:col-span-2">
              <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Kelas Terkait
              </span>
              <span className="text-sm font-medium text-slate-700">
                {classes.find((c) => c.id === values.classId)?.name || "Tidak diketahui"}
              </span>
            </div>
          )}

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Type *</span>
            <select
              value={values.type}
              onChange={(e) => onChange("type", e.target.value as AssessmentType)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              Nilai Maksimum *
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Contoh: 100"
              value={values.maxScore}
              onChange={(e) => onChange("maxScore", e.target.value)}
              className={`h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                errors.maxScore ? "border-[#c94242]" : "border-slate-200"
              }`}
            />
            {errors.maxScore && (
              <span className="mt-1 block text-xs text-[#c94242]">{errors.maxScore}</span>
            )}
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              Mata Pelajaran *
            </span>
            <select
              value={values.subjectId}
              onChange={(e) => onChange("subjectId", e.target.value)}
              className={`h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                errors.subjectId ? "border-[#c94242]" : "border-slate-200"
              }`}
            >
              <option value="">Pilih Mata Pelajaran</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.code}] {s.name}
                </option>
              ))}
            </select>
            {errors.subjectId && (
              <span className="mt-1 block text-xs text-[#c94242]">{errors.subjectId}</span>
            )}
          </label>

          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Deskripsi</span>
            <textarea
              rows={2}
              value={values.description}
              onChange={(e) => onChange("description", e.target.value)}
              placeholder="Deskripsi penilaian atau instruksi khusus..."
              className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Status *</span>
            <select
              value={values.status}
              onChange={(e) =>
                onChange("status", e.target.value as AssessmentSessionStatus)
              }
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b03535] disabled:opacity-50"
          >
            {submitting
              ? "Menyimpan..."
              : mode === "create"
              ? "Simpan Assessment"
              : "Perbarui Assessment"}
          </button>
        </div>
      </form>
    </div>
  );
}
