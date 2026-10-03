"use client";

import Link from "next/link";
import { AlertCircle, Eye, FileCheck2, MoreHorizontal, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
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
  maxScore: number;
  status: AssessmentSessionStatus;
};

const emptyForm: FormValues = {
  name: "",
  description: "",
  type: AssessmentType.ASSIGNMENT,
  classId: "",
  subjectId: "",
  maxScore: 100,
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

export function AssessmentsPage({ canDelete = false }: { canDelete?: boolean }) {
  const { showToast } = useToast();
  const [assessments, setAssessments] = useState<ApiAssessment[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const [query, setQuery] = useState("");
  const [type, setType] = useState<"ALL" | AssessmentType>("ALL");
  const [subjectId, setSubjectId] = useState("ALL");
  const [classId, setClassId] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | AssessmentSessionStatus>("ALL");

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ApiAssessment | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    try {
      const [resAssessments, resClasses, resSubjects] = await Promise.all([
        fetch("/api/assessments"),
        fetch("/api/classes"),
        fetch("/api/subjects"),
      ]);

      if (resAssessments.status === 403) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      if (!resAssessments.ok) {
        throw new Error(`Gagal memuat assessment (HTTP ${resAssessments.status})`);
      }

      const assessmentsData = await resAssessments.json();
      setAssessments(assessmentsData);

      if (resClasses.ok) {
        const classesData = await resClasses.json();
        setClasses(classesData.data || classesData || []);
      }

      if (resSubjects.ok) {
        const subjectsData = await resSubjects.json();
        setSubjects(subjectsData.data || subjectsData || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return assessments.filter((item) => {
      const matchQuery =
        !query.trim() ||
        `${item.name} ${item.subject.name} ${item.class.name} ${item.class.batch.name} ${item.type}`
          .toLowerCase()
          .includes(query.toLowerCase());
      const matchType = type === "ALL" || item.type === type;
      const matchSubject = subjectId === "ALL" || item.subjectId === subjectId;
      const matchClass = classId === "ALL" || item.classId === classId;
      const matchStatus = status === "ALL" || item.status === status;
      return matchQuery && matchType && matchSubject && matchClass && matchStatus;
    });
  }, [assessments, classId, query, status, subjectId, type]);

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
      maxScore: item.maxScore,
      status: item.status,
    });
    setErrors({});
    setEditingId(item.id);
    setModal("edit");
    setOpenMenu(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof FormValues, string>> = {};
    if (!form.name.trim()) nextErrors.name = "Nama assessment wajib diisi.";
    if (!form.type) nextErrors.type = "Type wajib dipilih.";
    if (!form.classId) nextErrors.classId = "Kelas wajib dipilih.";
    if (!form.subjectId) nextErrors.subjectId = "Mata pelajaran wajib dipilih.";
    if (!form.maxScore || form.maxScore <= 0) {
      nextErrors.maxScore = "Nilai maksimum harus lebih besar dari 0.";
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
            classId: form.classId,
            subjectId: form.subjectId,
            maxScore: Number(form.maxScore),
            status: form.status,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
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
        name: err instanceof Error ? err.message : "Gagal menyimpan data.",
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

  const totalCount = assessments.length;
  const activeCount = assessments.filter((a) => a.status === "OPEN").length;
  const completedCount = assessments.filter((a) => a.status === "COMPLETED").length;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Assessment</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Assessment</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola penilaian dan nilai peserta</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b03535] transition-colors"
        >
          <Plus className="size-4" />
          Tambah Assessment
        </button>
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

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(140px,.7fr))_auto] xl:items-end">
          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Assessment</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, mata pelajaran, kelas..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#102f50] focus:outline-none"
              />
            </span>
          </label>
          <Select
            label="Type"
            value={type}
            onChange={(v) => setType(v as "ALL" | AssessmentType)}
            options={["ALL", ...types]}
          />
          <Select
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            options={[
              { value: "ALL", label: "Semua Subject" },
              ...subjects.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="Class"
            value={classId}
            onChange={setClassId}
            options={[
              { value: "ALL", label: "Semua Kelas" },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as "ALL" | AssessmentSessionStatus)}
            options={["ALL", ...statuses]}
          />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setType("ALL");
              setSubjectId("ALL");
              setClassId("ALL");
              setStatus("ALL");
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
            {loading ? "Memuat data..." : `${filtered.length} assessment ditemukan`}
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="inline-block size-8 animate-spin rounded-full border-4 border-solid border-[#102f50] border-r-transparent align-[-0.125em]" />
            <p className="mt-4 text-sm font-medium">Memuat data assessment...</p>
          </div>
        ) : filtered.length === 0 ? (
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
                  {filtered.map((item) => (
                    <AssessmentRow
                      key={item.id}
                      item={item}
                      openMenu={openMenu}
                      setOpenMenu={setOpenMenu}
                      onEdit={openEdit}
                      canDelete={canDelete}
                      onDelete={requestDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((item) => (
                <AssessmentCard
                  key={item.id}
                  item={item}
                  openMenu={openMenu}
                  setOpenMenu={setOpenMenu}
                  onEdit={openEdit}
                  canDelete={canDelete}
                  onDelete={requestDelete}
                />
              ))}
            </div>
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
          submitting={submitting}
          onChange={(field, val) => setForm((c) => ({ ...c, [field]: val }))}
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
      <span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>
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
}: {
  item: ApiAssessment;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onEdit: (item: ApiAssessment) => void;
  canDelete: boolean;
  onDelete: (item: ApiAssessment) => void;
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
}: {
  item: ApiAssessment;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onEdit: (item: ApiAssessment) => void;
  canDelete: boolean;
  onDelete: (item: ApiAssessment) => void;
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
}: {
  item: ApiAssessment;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onEdit: (item: ApiAssessment) => void;
  canDelete: boolean;
  onDelete: (item: ApiAssessment) => void;
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
  submitting,
  onChange,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  values: FormValues;
  errors: Partial<Record<keyof FormValues, string>>;
  classes: ApiClass[];
  subjects: ApiSubject[];
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
              type="number"
              min="1"
              value={values.maxScore}
              onChange={(e) => onChange("maxScore", Number(e.target.value))}
              className={`h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                errors.maxScore ? "border-[#c94242]" : "border-slate-200"
              }`}
            />
            {errors.maxScore && (
              <span className="mt-1 block text-xs text-[#c94242]">{errors.maxScore}</span>
            )}
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Kelas *</span>
            <select
              value={values.classId}
              onChange={(e) => onChange("classId", e.target.value)}
              className={`h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                errors.classId ? "border-[#c94242]" : "border-slate-200"
              }`}
            >
              <option value="">Pilih Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.batch?.name ? `(${c.batch.name})` : ""}
                </option>
              ))}
            </select>
            {errors.classId && (
              <span className="mt-1 block text-xs text-[#c94242]">{errors.classId}</span>
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
