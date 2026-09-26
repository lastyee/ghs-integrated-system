"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit3, Eye, Loader2, Plus, RotateCcw, Search, X, AlertCircle, BookOpen } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

type ClassStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

interface BatchItem {
  id: string;
  name: string;
}

interface InstructorItem {
  id: string;
  name: string;
}

interface ClassData {
  id: string;
  name: string;
  batchId: string;
  instructorId: string;
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
  batch?: {
    id: string;
    name: string;
    programId: string;
    startDate: string;
    endDate: string | null;
  };
  instructor?: {
    id: string;
    name: string;
  };
}

interface FormValues {
  name: string;
  batchId: string;
  instructorId: string;
  status: ClassStatus;
}

const emptyForm: FormValues = {
  name: "",
  batchId: "",
  instructorId: "",
  status: "SCHEDULED",
};

const statuses: ClassStatus[] = ["SCHEDULED", "COMPLETED", "CANCELLED"];

interface ClassesPageProps {
  userRole?: string;
}

export function ClassesPage({ userRole }: ClassesPageProps) {
  const canMutate =
    userRole === "SUPER_ADMIN" ||
    userRole === "ADMIN" ||
    userRole === "ACADEMIC_STAFF";

  const [classes, setClasses] = useState<ClassData[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [instructors, setInstructors] = useState<InstructorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ClassStatus>("ALL");
  const [batchFilter, setBatchFilter] = useState("ALL");

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch("/api/classes"),
      fetch("/api/batches"),
      fetch("/api/instructors"),
    ])
      .then(async ([classesRes, batchesRes, instructorsRes]) => {
        if (!classesRes.ok) {
          const errData = await classesRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat kelas (Status: ${classesRes.status})`);
        }
        if (!batchesRes.ok) {
          const errData = await batchesRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat batch (Status: ${batchesRes.status})`);
        }
        if (!instructorsRes.ok) {
          const errData = await instructorsRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat instruktur (Status: ${instructorsRes.status})`);
        }

        const classesJson = await classesRes.json();
        const batchesJson = await batchesRes.json();
        const instructorsJson = await instructorsRes.json();

        return {
          classes: classesJson.data || [],
          batches: batchesJson.data || [],
          instructors: instructorsJson.data || [],
        };
      })
      .then(({ classes: cList, batches: bList, instructors: iList }) => {
        if (isMounted) {
          setClasses(cList);
          setBatches(bList);
          setInstructors(iList);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data kelas");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const reloadClasses = () => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  const filtered = useMemo(() => {
    return classes.filter((item) => {
      const matchQuery =
        !query.trim() ||
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.batch?.name.toLowerCase().includes(query.toLowerCase()) ||
        item.instructor?.name.toLowerCase().includes(query.toLowerCase());

      const matchStatus = statusFilter === "ALL" || item.status === statusFilter;
      const matchBatch = batchFilter === "ALL" || item.batchId === batchFilter;

      return matchQuery && matchStatus && matchBatch;
    });
  }, [classes, query, statusFilter, batchFilter]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      batchId: batches.length > 0 ? batches[0].id : "",
      instructorId: instructors.length > 0 ? instructors[0].id : "",
      status: "SCHEDULED",
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(null);
    setModal("create");
  };

  const openEdit = (item: ClassData) => {
    setForm({
      name: item.name,
      batchId: item.batchId,
      instructorId: item.instructorId,
      status: item.status,
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(item.id);
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

    if (!form.name.trim()) errs.name = "Nama kelas wajib diisi";
    if (!form.batchId) errs.batchId = "Batch wajib dipilih";
    if (!form.instructorId) errs.instructorId = "Instruktur wajib dipilih";

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    try {
      setSubmitLoading(true);
      setSubmitError(null);
      setFormErrors({});

      const url = modal === "create" ? "/api/classes" : `/api/classes/${editingId}`;
      const method = modal === "create" ? "POST" : "PATCH";

      const payload =
        modal === "create"
          ? {
              name: form.name.trim(),
              batchId: form.batchId,
              instructorId: form.instructorId,
            }
          : {
              name: form.name.trim(),
              batchId: form.batchId,
              instructorId: form.instructorId,
              status: form.status,
            };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resJson.error || `Gagal menyimpan kelas (Status: ${res.status})`);
      }

      setNotice(modal === "create" ? "Kelas berhasil ditambahkan." : "Kelas berhasil diperbarui.");
      closeModal();
      reloadClasses();
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
          <p className="text-xs font-medium text-slate-500">Dashboard / Kelas</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Kelas</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola kelompok belajar dan instruktur pengampu</p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition"
          >
            <Plus className="size-4" />
            Tambah Kelas
          </button>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Kelas"
          value={loading ? "..." : String(classes.length)}
          description="Data live seluruh kelas"
          icon={BookOpen}
          tone="navy"
        />
        <StatCard
          label="Kelas Terjadwal"
          value={loading ? "..." : String(classes.filter((c) => c.status === "SCHEDULED").length)}
          description="Status SCHEDULED"
          icon={BookOpen}
          tone="blue"
        />
        <StatCard
          label="Kelas Selesai"
          value={loading ? "..." : String(classes.filter((c) => c.status === "COMPLETED").length)}
          description="Status COMPLETED"
          icon={BookOpen}
          tone="blue"
        />
        <StatCard
          label="Kelas Dibatalkan"
          value={loading ? "..." : String(classes.filter((c) => c.status === "CANCELLED").length)}
          description="Status CANCELLED"
          icon={BookOpen}
          tone="red"
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
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_200px_auto] sm:items-end">
          <label className="relative">
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Kelas</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari kelas, batch, atau instruktur..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#123b63] focus:outline-none"
              />
            </div>
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | ClassStatus)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#123b63] focus:outline-none"
            >
              <option value="ALL">Semua Status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Batch</span>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#123b63] focus:outline-none"
            >
              <option value="ALL">Semua Batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          {(query || statusFilter !== "ALL" || batchFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
                setBatchFilter("ALL");
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
          <span className="ml-2 text-sm text-slate-600">Memuat data kelas...</span>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm" data-testid="error-state">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <p className="font-semibold text-red-800">Gagal memuat data</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={reloadClasses}
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
              <h2 className="font-bold text-[#102f50]">Daftar Kelas</h2>
              <p className="mt-1 text-xs text-slate-500">{filtered.length} kelas ditemukan</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center" data-testid="empty-state">
              <BookOpen className="mx-auto size-12 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada kelas ditemukan</p>
              <p className="mt-1 text-xs text-slate-500">
                {query || statusFilter !== "ALL" || batchFilter !== "ALL"
                  ? "Tidak ada kelas yang cocok dengan kriteria filter."
                  : "Belum ada kelas yang terdaftar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Nama Kelas</th>
                    <th className="px-5 py-3 font-semibold">Batch</th>
                    <th className="px-5 py-3 font-semibold">Instruktur</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Dibuat Pada</th>
                    <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 font-semibold text-[#102f50]">{item.name}</td>
                      <td className="px-5 py-4 text-slate-600">{item.batch?.name || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">{item.instructor?.name || "-"}</td>
                      <td className="px-5 py-4">
                        <ClassStatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-500 text-xs">
                        {new Date(item.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/classes/${item.id}`}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                            aria-label={`Lihat detail ${item.name}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canMutate && (
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                              aria-label={`Edit ${item.name}`}
                            >
                              <Edit3 className="size-4" />
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
          aria-labelledby="class-modal-title"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="class-modal-title" className="font-bold text-[#102f50]">
                {modal === "create" ? "Tambah Kelas" : "Edit Kelas"}
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

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nama Kelas *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Contoh: Kelas Front Office A"
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
                  Batch Pelatihan *
                </label>
                <select
                  value={form.batchId}
                  onChange={(e) => setForm({ ...form, batchId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.batchId ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                  }`}
                >
                  <option value="">Pilih Batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {formErrors.batchId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.batchId}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Instruktur *
                </label>
                <select
                  value={form.instructorId}
                  onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.instructorId ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                  }`}
                >
                  <option value="">Pilih Instruktur</option>
                  {instructors.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.name}
                    </option>
                  ))}
                </select>
                {formErrors.instructorId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.instructorId}</p>
                )}
              </div>

              {modal === "edit" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Status Kelas *
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ClassStatus })}
                    disabled={submitLoading}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#123b63] focus:outline-none"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                {modal === "create" ? "Simpan Kelas" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ClassStatusBadge({ status }: { status: ClassStatus }) {
  const classes =
    status === "SCHEDULED"
      ? "bg-[#e8f2f8] text-[#357092]"
      : status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-[#fbeaea] text-[#c94242]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      {status}
    </span>
  );
}
