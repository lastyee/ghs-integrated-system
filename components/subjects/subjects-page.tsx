"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Edit3, Eye, Loader2, Plus, RotateCcw, Search, Trash2, X, AlertCircle } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";

interface SubjectData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FormValues {
  code: string;
  name: string;
  description: string;
}

const emptyForm: FormValues = {
  code: "",
  name: "",
  description: "",
};

interface SubjectsPageProps {
  userRole?: string;
}

export function SubjectsPage({ userRole }: SubjectsPageProps) {
  const canMutate =
    userRole === "SUPER_ADMIN" ||
    userRole === "ADMIN" ||
    userRole === "ACADEMIC_STAFF";

  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deleteCandidate, setDeleteCandidate] = useState<SubjectData | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  useEffect(() => {
    let isMounted = true;
    fetch("/api/subjects")
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat daftar mata pelajaran (Status: ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          setSubjects(json.data || []);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat mata pelajaran");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const reloadSubjects = () => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  const deleteSubject = async () => {
    if (!deleteCandidate) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/subjects/${deleteCandidate.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `Gagal menghapus mata pelajaran (HTTP ${response.status})`);
      }
      setNotice(`Mata pelajaran "${deleteCandidate.name}" berhasil dihapus.`);
      setDeleteCandidate(null);
      reloadSubjects();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus mata pelajaran.");
    } finally {
      setDeletePending(false);
    }
  };

  const filtered = useMemo(() => {
    return subjects.filter((subject) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        subject.code.toLowerCase().includes(q) ||
        subject.name.toLowerCase().includes(q) ||
        (subject.description && subject.description.toLowerCase().includes(q))
      );
    });
  }, [query, subjects]);

  const openCreate = () => {
    setForm(emptyForm);
    setFormErrors({});
    setSubmitError(null);
    setEditingId(null);
    setModal("create");
  };

  const openEdit = (subj: SubjectData) => {
    setForm({
      code: subj.code,
      name: subj.name,
      description: subj.description || "",
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(subj.id);
    setModal("edit");
  };

  const closeModal = () => {
    if (submitLoading) return;
    setModal(null);
    setEditingId(null);
    setSubmitError(null);
    setFormErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = "Kode mata pelajaran wajib diisi";
    if (!form.name.trim()) errs.name = "Nama mata pelajaran wajib diisi";

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    try {
      setSubmitLoading(true);
      setSubmitError(null);
      setFormErrors({});

      const url = modal === "create" ? "/api/subjects" : `/api/subjects/${editingId}`;
      const method = modal === "create" ? "POST" : "PATCH";

      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() ? form.description.trim() : null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error("Mata pelajaran dengan kode ini sudah ada (409 Conflict)");
        }
        throw new Error(resJson.error || `Gagal menyimpan mata pelajaran (Status: ${res.status})`);
      }

      setNotice(modal === "create" ? "Mata pelajaran berhasil ditambahkan." : "Mata pelajaran berhasil diperbarui.");
      closeModal();
      reloadSubjects();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Mata Pelajaran</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Mata Pelajaran</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola mata pelajaran dan materi training</p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition"
          >
            <Plus className="size-4" />
            Tambah Mata Pelajaran
          </button>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Mata Pelajaran"
          value={loading ? "..." : String(subjects.length)}
          description="Data live mata pelajaran terdaftar"
          icon={BookOpen}
          tone="navy"
        />
        <StatCard
          label="Mata Pelajaran Ditampilkan"
          value={loading ? "..." : String(filtered.length)}
          description="Hasil filter & pencarian"
          icon={BookOpen}
          tone="blue"
        />
        <StatCard
          label="Status Database"
          value="LIVE API"
          description="Terhubung langsung ke backend Academic Core"
          icon={BookOpen}
          tone="blue"
        />
      </section>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-bold text-emerald-700 underline ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex-1">
            <span className="sr-only">Cari Mata Pelajaran</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode atau nama mata pelajaran..."
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#123b63] focus:outline-none"
            />
          </label>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="size-4" />
              Reset Filter
            </button>
          )}
        </div>
      </section>

      {loading && (
        <div className="mt-6 flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white" data-testid="loading-state">
          <Loader2 className="size-8 animate-spin text-[#123b63]" />
          <span className="ml-2 text-sm text-slate-600">Memuat data mata pelajaran...</span>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm" data-testid="error-state">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <p className="font-semibold text-red-800">Gagal memuat data</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={reloadSubjects}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {!loading && !error && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-[#102f50]">Daftar Mata Pelajaran</h2>
              <p className="mt-1 text-xs text-slate-500">{filtered.length} mata pelajaran ditemukan</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center" data-testid="empty-state">
              <BookOpen className="mx-auto size-12 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada mata pelajaran ditemukan</p>
              <p className="mt-1 text-xs text-slate-500">
                {query ? "Tidak ada mata pelajaran yang cocok dengan filter pencarian." : "Belum ada mata pelajaran yang terdaftar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Kode</th>
                    <th className="px-5 py-3 font-semibold">Nama Mata Pelajaran</th>
                    <th className="px-5 py-3 font-semibold">Deskripsi</th>
                    <th className="px-5 py-3 font-semibold">Dibuat Pada</th>
                    <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((subject) => (
                    <tr key={subject.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 font-semibold text-[#123b63]">{subject.code}</td>
                      <td className="px-5 py-4 font-semibold text-[#102f50]">{subject.name}</td>
                      <td className="px-5 py-4 text-slate-600 max-w-xs truncate">{subject.description || "-"}</td>
                      <td className="px-5 py-4 text-slate-500 text-xs">
                        {new Date(subject.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/subjects/${subject.id}`}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                            aria-label={`Lihat detail ${subject.code}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canMutate && (
                            <button
                              type="button"
                              onClick={() => openEdit(subject)}
                              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                              aria-label={`Edit ${subject.code}`}
                            >
                              <Edit3 className="size-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteCandidate(subject);
                                setDeleteError(null);
                              }}
                              className="rounded-md p-2 text-red-700 hover:bg-red-50"
                              aria-label={`Hapus ${subject.code}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subject-modal-title"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="subject-modal-title" className="font-bold text-[#102f50]">
                {modal === "create" ? "Tambah Mata Pelajaran" : "Edit Mata Pelajaran"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitLoading}
                aria-label="Tutup modal"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            {submitError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {submitError}
              </div>
            )}
            {deleteCandidate && (
              <DeleteConfirmationDialog
                title="Hapus Mata Pelajaran?"
                recordName={deleteCandidate.name}
                description="Mata pelajaran akan dihapus permanen hanya jika tidak terkait ProgramSubject, Schedule, atau Assessment. Data terkait tidak akan dihapus."
                confirmLabel="Hapus Mata Pelajaran"
                pending={deletePending}
                error={deleteError}
                onCancel={() => {
                  if (!deletePending) setDeleteCandidate(null);
                }}
                onConfirm={deleteSubject}
              />
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Kode Mata Pelajaran *
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Contoh: SUBJ-001"
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.code ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                  }`}
                />
                {formErrors.code && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.code}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nama Mata Pelajaran *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Contoh: Food and Beverage Service"
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.name ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                  }`}
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Deskripsi
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={submitLoading}
                  rows={3}
                  placeholder="Deskripsi singkat materi mata pelajaran"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-[#123b63] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition disabled:opacity-50"
              >
                {submitLoading && <Loader2 className="size-4 animate-spin" />}
                {modal === "create" ? "Simpan Mata Pelajaran" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
