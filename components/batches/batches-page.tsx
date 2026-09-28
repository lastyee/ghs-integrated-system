"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Edit3, Eye, Loader2, Plus, RotateCcw, Search, X, AlertCircle, Trash2 } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";

interface ProgramItem {
  id: string;
  code: string;
  name: string;
}

interface BatchData {
  id: string;
  name: string;
  programId: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    enrollments: number;
    classes: number;
    certificates: number;
  };
  program?: {
    id: string;
    code: string;
    name: string;
  };
}

interface FormValues {
  name: string;
  programId: string;
  startDate: string;
  endDate: string;
}

const emptyForm: FormValues = {
  name: "",
  programId: "",
  startDate: "",
  endDate: "",
};

interface BatchesPageProps {
  userRole?: string;
  canDelete?: boolean;
}

export function BatchesPage({ userRole, canDelete = false }: BatchesPageProps) {
  const canMutate =
    userRole === "SUPER_ADMIN" ||
    userRole === "ADMIN" ||
    userRole === "ACADEMIC_STAFF";

  const [batches, setBatches] = useState<BatchData[]>([]);
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("ALL");

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<BatchData | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetch("/api/batches"), fetch("/api/programs")])
      .then(async ([batchesRes, programsRes]) => {
        if (!batchesRes.ok) {
          const errData = await batchesRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat batch (Status: ${batchesRes.status})`);
        }
        if (!programsRes.ok) {
          const errData = await programsRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat program (Status: ${programsRes.status})`);
        }
        const batchesJson = await batchesRes.json();
        const programsJson = await programsRes.json();
        return { batches: batchesJson.data || [], programs: programsJson.data || [] };
      })
      .then(({ batches: bList, programs: pList }) => {
        if (isMounted) {
          setBatches(bList);
          setPrograms(pList);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const reloadBatches = () => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  const deleteBatch = async () => {
    if (!deleteCandidate) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/batches/${deleteCandidate.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Gagal menghapus batch (HTTP ${response.status})`);
      }
      setNotice(`Batch "${deleteCandidate.name}" berhasil dihapus.`);
      setDeleteCandidate(null);
      reloadBatches();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus batch.");
    } finally {
      setDeletePending(false);
    }
  };

  const filtered = useMemo(() => {
    return batches.filter((batch) => {
      const matchQuery =
        !query.trim() ||
        batch.name.toLowerCase().includes(query.toLowerCase()) ||
        batch.program?.name.toLowerCase().includes(query.toLowerCase()) ||
        batch.program?.code.toLowerCase().includes(query.toLowerCase());

      const matchProgram =
        selectedProgram === "ALL" || batch.programId === selectedProgram;

      return matchQuery && matchProgram;
    });
  }, [batches, query, selectedProgram]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      programId: programs.length > 0 ? programs[0].id : "",
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(null);
    setModal("create");
  };

  const openEdit = (b: BatchData) => {
    setForm({
      name: b.name,
      programId: b.programId,
      startDate: b.startDate ? b.startDate.substring(0, 10) : "",
      endDate: b.endDate ? b.endDate.substring(0, 10) : "",
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(b.id);
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

    if (!form.name.trim()) errs.name = "Nama batch wajib diisi";
    if (!form.programId) errs.programId = "Program wajib dipilih";
    if (!form.startDate) errs.startDate = "Tanggal mulai wajib diisi";

    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      errs.endDate = "Tanggal selesai harus sama atau setelah tanggal mulai";
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    try {
      setSubmitLoading(true);
      setSubmitError(null);
      setFormErrors({});

      const url = modal === "create" ? "/api/batches" : `/api/batches/${editingId}`;
      const method = modal === "create" ? "POST" : "PATCH";

      const payload = {
        name: form.name.trim(),
        programId: form.programId,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resJson.error || `Gagal menyimpan batch (Status: ${res.status})`);
      }

      setNotice(modal === "create" ? "Batch berhasil ditambahkan." : "Batch berhasil diperbarui.");
      closeModal();
      reloadBatches();
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
          <p className="text-xs font-medium text-slate-500">Dashboard / Batch</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Batch</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola batch pelatihan dan periode akademik</p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition"
          >
            <Plus className="size-4" />
            Tambah Batch
          </button>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Batch"
          value={loading ? "..." : String(batches.length)}
          description="Data live batch terdaftar"
          icon={Calendar}
          tone="navy"
        />
        <StatCard
          label="Batch Ditampilkan"
          value={loading ? "..." : String(filtered.length)}
          description="Hasil filter & pencarian"
          icon={Calendar}
          tone="blue"
        />
        <StatCard
          label="Status Database"
          value="LIVE API"
          description="Terhubung langsung ke backend Academic Core"
          icon={Calendar}
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
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px_auto] sm:items-end">
          <label className="relative">
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Batch</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama batch atau program..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#123b63] focus:outline-none"
              />
            </div>
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Filter Program</span>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#123b63] focus:outline-none"
            >
              <option value="ALL">Semua Program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </label>

          {(query || selectedProgram !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedProgram("ALL");
              }}
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
          <span className="ml-2 text-sm text-slate-600">Memuat data batch...</span>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm" data-testid="error-state">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <p className="font-semibold text-red-800">Gagal memuat data</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={reloadBatches}
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
              <h2 className="font-bold text-[#102f50]">Daftar Batch</h2>
              <p className="mt-1 text-xs text-slate-500">{filtered.length} batch ditemukan</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center" data-testid="empty-state">
              <Calendar className="mx-auto size-12 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada batch ditemukan</p>
              <p className="mt-1 text-xs text-slate-500">
                {query || selectedProgram !== "ALL"
                  ? "Tidak ada batch yang cocok dengan kriteria filter."
                  : "Belum ada batch pelatihan yang terdaftar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Nama Batch</th>
                    <th className="px-5 py-3 font-semibold">Program</th>
                    <th className="px-5 py-3 font-semibold">Tanggal Mulai</th>
                    <th className="px-5 py-3 font-semibold">Tanggal Selesai</th>
                    <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 font-semibold text-[#102f50]">{batch.name}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {batch.program ? `${batch.program.code} - ${batch.program.name}` : "-"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {new Date(batch.startDate).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {batch.endDate
                          ? new Date(batch.endDate).toLocaleDateString("id-ID", { dateStyle: "medium" })
                          : "-"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/batches/${batch.id}`}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                            aria-label={`Lihat detail ${batch.name}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canMutate && (
                            <button
                              type="button"
                              onClick={() => openEdit(batch)}
                              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                              aria-label={`Edit ${batch.name}`}
                            >
                              <Edit3 className="size-4" />
                            </button>
                          )}
                          {canDelete && (() => {
                            const dependencies = batch._count;
                            const blocked =
                              dependencies.enrollments > 0 ||
                              dependencies.classes > 0 ||
                              dependencies.certificates > 0;
                            const reason = [
                              dependencies.enrollments > 0 && `${dependencies.enrollments} Enrollment`,
                              dependencies.classes > 0 && `${dependencies.classes} Class`,
                              dependencies.certificates > 0 && `${dependencies.certificates} Certificate`,
                            ].filter(Boolean).join(", ");
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteCandidate(batch);
                                }}
                                disabled={blocked}
                                title={blocked ? `Tidak dapat dihapus: masih memiliki ${reason}.` : "Hapus batch"}
                                aria-label={blocked
                                  ? `Tidak dapat menghapus ${batch.name}: masih memiliki ${reason}`
                                  : `Hapus ${batch.name}`}
                                className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            );
                          })()}
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
          aria-labelledby="batch-modal-title"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="batch-modal-title" className="font-bold text-[#102f50]">
                {modal === "create" ? "Tambah Batch" : "Edit Batch"}
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
                title="Hapus batch ini?"
                recordName={deleteCandidate.name}
                description="Penghapusan bersifat permanen dan hanya dapat dilakukan jika batch tidak memiliki Enrollment, Class, Schedule, atau Certificate. Data terkait tidak akan dihapus."
                confirmLabel="Hapus Batch"
                pending={deletePending}
                error={deleteError}
                onCancel={() => {
                  if (!deletePending) {
                    setDeleteCandidate(null);
                    setDeleteError(null);
                  }
                }}
                onConfirm={deleteBatch}
              />
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nama Batch *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Contoh: Batch 2026-A"
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
                  Program Pelatihan *
                </label>
                <select
                  value={form.programId}
                  onChange={(e) => setForm({ ...form, programId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.programId ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                  }`}
                >
                  <option value="">Pilih Program</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
                {formErrors.programId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.programId}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Tanggal Mulai *
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    disabled={submitLoading}
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                      formErrors.startDate ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                    }`}
                  />
                  {formErrors.startDate && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.startDate}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    disabled={submitLoading}
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                      formErrors.endDate ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                    }`}
                  />
                  {formErrors.endDate && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.endDate}</p>
                  )}
                </div>
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
                {modal === "create" ? "Simpan Batch" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
