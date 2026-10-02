"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit3, Eye, Loader2, Plus, RotateCcw, Search, X, AlertCircle, Users } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";

type EnrollmentStatus = "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED";

interface StudentOption {
  id: string;
  nim: string;
  name: string;
}

interface BatchOption {
  id: string;
  name: string;
  program?: {
    id: string;
    code: string;
    name: string;
  };
}

interface EnrollmentData {
  id: string;
  studentId: string;
  batchId: string;
  status: EnrollmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    nim: string;
    name: string;
  };
  batch?: {
    id: string;
    name: string;
    programId: string;
    program?: {
      id: string;
      code: string;
      name: string;
    };
  };
}

const statuses: EnrollmentStatus[] = ["ACTIVE", "COMPLETED", "TRANSFERRED", "DROPPED"];

interface EnrollmentsPageProps {
  userRole?: string;
}

export function EnrollmentsPage({ userRole }: EnrollmentsPageProps) {
  const canMutate =
    userRole === "SUPER_ADMIN" ||
    userRole === "ADMIN" ||
    userRole === "ACADEMIC_STAFF";
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [enrollments, setEnrollments] = useState<EnrollmentData[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | EnrollmentStatus>("ALL");
  const [batchFilter, setBatchFilter] = useState("ALL");

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    studentId: "",
    batchId: "",
    notes: "",
  });
  const [editForm, setEditForm] = useState<{
    status: EnrollmentStatus;
    notes: string;
  }>({
    status: "ACTIVE",
    notes: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch("/api/enrollments"),
      fetch("/api/students"),
      fetch("/api/batches"),
    ])
      .then(async ([enrRes, stdRes, bchRes]) => {
        if (!enrRes.ok) {
          const errData = await enrRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat enrollment (Status: ${enrRes.status})`);
        }
        if (!stdRes.ok) {
          const errData = await stdRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat data siswa (Status: ${stdRes.status})`);
        }
        if (!bchRes.ok) {
          const errData = await bchRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat data batch (Status: ${bchRes.status})`);
        }

        const enrJson = await enrRes.json();
        const stdJson = await stdRes.json();
        const bchJson = await bchRes.json();

        return {
          enrollments: enrJson.data || [],
          students: stdJson.data || [],
          batches: bchJson.data || [],
        };
      })
      .then(({ enrollments: eList, students: sList, batches: bList }) => {
        if (isMounted) {
          setEnrollments(eList);
          setStudents(sList);
          setBatches(bList);
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

  const reloadEnrollments = () => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  const filtered = useMemo(() => {
    return enrollments.filter((item) => {
      const matchQuery =
        !query.trim() ||
        item.student?.name.toLowerCase().includes(query.toLowerCase()) ||
        item.student?.nim.toLowerCase().includes(query.toLowerCase()) ||
        item.batch?.name.toLowerCase().includes(query.toLowerCase()) ||
        item.batch?.program?.name.toLowerCase().includes(query.toLowerCase());

      const matchStatus = statusFilter === "ALL" || item.status === statusFilter;
      const matchBatch = batchFilter === "ALL" || item.batchId === batchFilter;

      return matchQuery && matchStatus && matchBatch;
    });
  }, [enrollments, query, statusFilter, batchFilter]);

  const openCreate = () => {
    setCreateForm({
      studentId: students.length > 0 ? students[0].id : "",
      batchId: batches.length > 0 ? batches[0].id : "",
      notes: "",
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(null);
    setModal("create");
  };

  const openEdit = (item: EnrollmentData) => {
    setEditForm({
      status: item.status,
      notes: item.notes || "",
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

    if (modal === "create") {
      if (!createForm.studentId) errs.studentId = "Siswa wajib dipilih";
      if (!createForm.batchId) errs.batchId = "Batch wajib dipilih";
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    try {
      setSubmitLoading(true);
      setSubmitError(null);
      setFormErrors({});

      const url = modal === "create" ? "/api/enrollments" : `/api/enrollments/${editingId}`;
      const method = modal === "create" ? "POST" : "PATCH";

      const payload =
        modal === "create"
          ? {
              studentId: createForm.studentId,
              batchId: createForm.batchId,
              notes: createForm.notes.trim() ? createForm.notes.trim() : null,
            }
          : {
              status: editForm.status,
              notes: editForm.notes.trim() ? editForm.notes.trim() : null,
            };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error("Siswa sudah terdaftar pada batch ini (409 Conflict)");
        }
        throw new Error(resJson.error || `Gagal menyimpan pendaftaran (Status: ${res.status})`);
      }

      setNotice(modal === "create" ? "Pendaftaran peserta berhasil disimpan." : "Status enrollment berhasil diperbarui.");
      closeModal();
      reloadEnrollments();
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
          <p className="text-xs font-medium text-slate-500">Dashboard / Enrollment</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Enrollment</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola pendaftaran peserta pada batch pelatihan</p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition"
          >
            <Plus className="size-4" />
            Tambah Enrollment
          </button>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Enrollment"
          value={loading ? "..." : String(enrollments.length)}
          description="Total data pendaftaran"
          icon={Users}
          tone="navy"
        />
        <StatCard
          label="Active"
          value={loading ? "..." : String(enrollments.filter((e) => e.status === "ACTIVE").length)}
          description="Peserta aktif berjalan"
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Completed"
          value={loading ? "..." : String(enrollments.filter((e) => e.status === "COMPLETED").length)}
          description="Selesai pelatihan"
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Transferred"
          value={loading ? "..." : String(enrollments.filter((e) => e.status === "TRANSFERRED").length)}
          description="Pindah batch"
          icon={Users}
          tone="yellow"
        />
        <StatCard
          label="Dropped"
          value={loading ? "..." : String(enrollments.filter((e) => e.status === "DROPPED").length)}
          description="Mengundurkan diri"
          icon={Users}
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
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Peserta</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, NIM, atau batch..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#123b63] focus:outline-none"
              />
            </div>
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | EnrollmentStatus)}
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
          <span className="ml-2 text-sm text-slate-600">Memuat data enrollment...</span>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm" data-testid="error-state">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <p className="font-semibold text-red-800">Gagal memuat data</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={reloadEnrollments}
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
              <h2 className="font-bold text-[#102f50]">Daftar Enrollment</h2>
              <p className="mt-1 text-xs text-slate-500">{filtered.length} data enrollment ditemukan</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center" data-testid="empty-state">
              <Users className="mx-auto size-12 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada data enrollment ditemukan</p>
              <p className="mt-1 text-xs text-slate-500">
                {query || statusFilter !== "ALL" || batchFilter !== "ALL"
                  ? "Tidak ada peserta yang cocok dengan kriteria filter."
                  : "Belum ada data pendaftaran yang terdaftar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">NIM</th>
                    <th className="px-5 py-3 font-semibold">Nama Peserta</th>
                    <th className="px-5 py-3 font-semibold">Program</th>
                    <th className="px-5 py-3 font-semibold">Batch</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Catatan</th>
                    <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 font-semibold text-[#123b63]">
                        {item.student?.nim || "-"}
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#102f50]">
                        {item.student?.name || "-"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {item.batch?.program?.name || "-"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{item.batch?.name || "-"}</td>
                      <td className="px-5 py-4">
                        <EnrollmentStatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-500 max-w-xs truncate">
                        {item.notes || "-"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/enrollments/${item.id}`}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                            aria-label={`Lihat detail enrollment ${item.student?.name}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canMutate && (
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                              aria-label={`Edit enrollment ${item.student?.name}`}
                            >
                              <Edit3 className="size-4" />
                            </button>
                          )}
                          {canDelete && (
                            <SoftDeleteAction
                              endpoint={`/api/enrollments/${item.id}`}
                              recordName="Enrollment"
                              identifier={`${item.student?.name || item.studentId} / ${item.batch?.name || item.batchId}`}
                              description="Enrollment akan disembunyikan dari data aktif. Riwayat peserta dan relasi batch tetap tersimpan."
                              onDeleted={reloadEnrollments}
                            />
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

      {modal === "create" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enrollment-create-title"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="enrollment-create-title" className="font-bold text-[#102f50]">
                Tambah Enrollment Peserta
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
                  Pilih Siswa / Peserta *
                </label>
                <select
                  value={createForm.studentId}
                  onChange={(e) => setCreateForm({ ...createForm, studentId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.studentId ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                  }`}
                >
                  <option value="">Pilih Siswa</option>
                  {students.map((std) => (
                    <option key={std.id} value={std.id}>
                      {std.nim} - {std.name}
                    </option>
                  ))}
                </select>
                {formErrors.studentId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.studentId}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Pilih Batch Pelatihan *
                </label>
                <select
                  value={createForm.batchId}
                  onChange={(e) => setCreateForm({ ...createForm, batchId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.batchId ? "border-red-500" : "border-slate-200 focus:border-[#123b63]"
                  }`}
                >
                  <option value="">Pilih Batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.program ? `(${b.program.code})` : ""}
                    </option>
                  ))}
                </select>
                {formErrors.batchId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.batchId}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Catatan Pendaftaran
                </label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  disabled={submitLoading}
                  rows={3}
                  placeholder="Catatan tambahan pendaftaran..."
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
                Daftarkan Peserta
              </button>
            </div>
          </form>
        </div>
      )}

      {modal === "edit" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enrollment-edit-title"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="enrollment-edit-title" className="font-bold text-[#102f50]">
                Ubah Status Enrollment
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
                  Status Enrollment *
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as EnrollmentStatus })}
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

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Catatan
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  disabled={submitLoading}
                  rows={3}
                  placeholder="Catatan status atau pemindahan..."
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
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const classes =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700"
      : status === "COMPLETED"
      ? "bg-[#e8f2f8] text-[#357092]"
      : status === "TRANSFERRED"
      ? "bg-[#fff6d9] text-[#a57c00]"
      : "bg-red-50 text-red-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      {status}
    </span>
  );
}
