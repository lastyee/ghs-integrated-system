"use client";

import Link from "next/link";
import { Eye, FileText, Plus, RotateCcw, Search, X, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";

export type DocumentStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";

export type DocumentRecord = {
  id: string;
  studentId: string;
  type: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: DocumentStatus;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    nim: string;
    name: string;
    userId: string | null;
  };
  verifiedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

type StudentSummary = {
  id: string;
  name: string;
  nim: string;
};

type UploadFormValues = {
  studentId: string;
  type: string;
  file: File | null;
};

const statuses: DocumentStatus[] = ["PENDING", "VERIFIED", "REJECTED", "EXPIRED"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export function DocumentsPage({ canDelete = false }: { canDelete?: boolean }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | DocumentStatus>("ALL");
  const [type, setType] = useState<string>("ALL");
  const [student, setStudent] = useState<string>("ALL");

  // Upload modal state
  const [openUpload, setOpenUpload] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [formValues, setFormValues] = useState<UploadFormValues>({
    studentId: "",
    type: "KTP",
    file: null,
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});
  const [notice, setNotice] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<DocumentRecord | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/documents")
      .then(async (response) => {
        if (!isMounted) return;
        if (response.status === 401 || response.status === 403) {
          setUnauthorized(true);
          setDocuments([]);
          setLoading(false);
          return;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Gagal memuat dokumen.");
        }
        const data = await response.json();
        if (isMounted) {
          setDocuments(Array.isArray(data) ? data : []);
          setUnauthorized(false);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.");
          setLoading(false);
        }
      });

    fetch("/api/students")
      .then(async (response) => {
        if (!isMounted) return;
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && isMounted) {
            setStudents(data.map((item) => ({ id: item.id, name: item.name, nim: item.nim })));
          }
        }
      })
      .catch(() => {
        // Non-blocking
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  // Derived unique types
  const existingTypes = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((doc) => {
      if (doc.type) set.add(doc.type);
    });
    return Array.from(set);
  }, [documents]);

  const filtered = useMemo(() => {
    return documents.filter((item) => {
      const studentName = item.student?.name || "";
      const studentNim = item.student?.nim || "";
      const searchTarget = `${item.fileName} ${item.type} ${studentName} ${studentNim} ${item.studentId}`.toLowerCase();
      const matchesQuery = !query.trim() || searchTarget.includes(query.toLowerCase());
      const matchesStatus = status === "ALL" || item.status === status;
      const matchesType = type === "ALL" || item.type === type;
      const matchesStudent = student === "ALL" || item.studentId === student;

      return matchesQuery && matchesStatus && matchesType && matchesStudent;
    });
  }, [documents, query, status, type, student]);

  const counts = useMemo(() => {
    return statuses.reduce<Record<DocumentStatus, number>>(
      (acc, s) => {
        acc[s] = documents.filter((doc) => doc.status === s).length;
        return acc;
      },
      { PENDING: 0, VERIFIED: 0, REJECTED: 0, EXPIRED: 0 }
    );
  }, [documents]);

  const reset = () => {
    setQuery("");
    setStatus("ALL");
    setType("ALL");
    setStudent("ALL");
  };

  const handleUploadSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<string, string>> = {};

    if (!formValues.type.trim()) {
      nextErrors.type = "Tipe dokumen wajib diisi.";
    }
    if (!formValues.file) {
      nextErrors.file = "File dokumen wajib dipilih.";
    } else {
      if (formValues.file.size > 5 * 1024 * 1024) {
        nextErrors.file = "Ukuran file maksimal 5 MB.";
      }
      const ext = formValues.file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "jpg", "jpeg", "png"].includes(ext)) {
        nextErrors.file = "Format file harus PDF, JPG, JPEG, atau PNG.";
      }
    }

    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setUploadLoading(true);
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("type", formValues.type.trim());
      formData.append("file", formValues.file!);
      if (formValues.studentId.trim()) {
        formData.append("studentId", formValues.studentId.trim());
      }

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal mengunggah dokumen.");
      }

      setNotice("Dokumen berhasil diunggah dengan status PENDING.");
      setOpenUpload(false);
      setFormValues({ studentId: "", type: "KTP", file: null });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setFormErrors({
        file: err instanceof Error ? err.message : "Terjadi kesalahan saat unggah.",
      });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/documents/${deleteCandidate.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || `Gagal menghapus dokumen (HTTP ${response.status})`);
      }
      setNotice(`Dokumen "${deleteCandidate.fileName}" berhasil dihapus.`);
      setDocuments((current) => current.filter((document) => document.id !== deleteCandidate.id));
      setDeleteCandidate(null);
      setRefreshTrigger((value) => value + 1);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Gagal menghapus dokumen.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Dokumen</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Dokumen</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola dokumen peserta dan proses verifikasi berkas
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormErrors({});
            setOpenUpload(true);
          }}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b33a3a] transition-colors"
        >
          <Plus className="size-4" />
          Upload Document
        </button>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {/* Error / Unauthorized Banner */}
      {unauthorized && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Akses Terbatas</p>
            <p className="text-xs text-amber-700">
              Anda tidak memiliki izin untuk melihat modul dokumen.
            </p>
          </div>
        </div>
      )}

      {error && !unauthorized && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="size-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Terjadi Kesalahan</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Dokumen"
          value={String(documents.length)}
          description="Seluruh dokumen tercatat"
          icon={FileText}
          tone="navy"
        />
        <StatCard
          label="Pending"
          value={String(counts.PENDING)}
          description="Menunggu verifikasi"
          icon={FileText}
          tone="yellow"
        />
        <StatCard
          label="Verified"
          value={String(counts.VERIFIED)}
          description="Telah diverifikasi"
          icon={FileText}
          tone="blue"
        />
        <StatCard
          label="Rejected"
          value={String(counts.REJECTED)}
          description="Ditolak verifikator"
          icon={FileText}
          tone="red"
        />
        <StatCard
          label="Expired"
          value={String(counts.EXPIRED)}
          description="Masa berlaku habis"
          icon={FileText}
          tone="navy"
        />
      </section>

      {/* Search & Filters */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,.7fr))_auto] xl:items-end">
          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">
              Cari Dokumen
            </span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama berkas, tipe, atau peserta"
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#102f50] focus:outline-none"
              />
            </span>
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "ALL" | DocumentStatus)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
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
            <span className="mb-2 block text-xs font-semibold text-slate-600">
              Tipe Dokumen
            </span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
            >
              <option value="ALL">Semua Tipe</option>
              {existingTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {students.length > 0 && (
            <label>
              <span className="mb-2 block text-xs font-semibold text-slate-600">
                Peserta
              </span>
              <select
                value={student}
                onChange={(e) => setStudent(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
              >
                <option value="ALL">Semua Peserta</option>
                {students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.nim})
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="size-4" />
            Reset Filter
          </button>
        </div>
      </section>

      {/* Document List Table */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-[#102f50]">Daftar Dokumen</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Memuat data..." : `${filtered.length} dokumen ditampilkan`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-500">
            <Loader2 className="size-6 animate-spin mr-2" />
            <span>Memuat data dokumen...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="mx-auto size-10 text-slate-300 mb-3" />
            <p className="font-medium text-slate-700">Tidak ada dokumen ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">
              Belum ada berkas yang diunggah atau tidak cocok dengan filter.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-250 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      "File / Tipe",
                      "Peserta",
                      "Ukuran",
                      "Tanggal Unggah",
                      "Status",
                      "Verifikator",
                      "Aksi",
                    ].map((h) => (
                      <th key={h} className="px-5 py-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#102f50]">{item.fileName}</p>
                        <span className="mt-1 inline-flex rounded-full bg-[#e8f2f8] px-2 py-0.5 text-[10px] font-semibold text-[#357092]">
                          {item.type}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700 font-medium">
                          {item.student?.name || item.studentId}
                        </p>
                        {item.student?.nim && (
                          <p className="text-xs text-slate-400">{item.student.nim}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {formatBytes(item.fileSize)}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {item.verifiedBy?.name || item.verifiedBy?.email || "-"}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/documents/${item.id}`}
                          className="inline-flex items-center rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-[#102f50] transition-colors"
                          aria-label={`Lihat dokumen ${item.id}`}
                        >
                          <Eye className="size-4" />
                        </Link>
                        {canDelete && (
                          <button
                            type="button"
                            disabled={item.status === "VERIFIED"}
                            onClick={() => {
                              setDeleteCandidate(item);
                              setDeleteError(null);
                            }}
                            title={item.status === "VERIFIED" ? "Dokumen terverifikasi tidak dapat dihapus." : "Hapus dokumen"}
                            aria-label={item.status === "VERIFIED"
                              ? `Dokumen ${item.fileName} terverifikasi tidak dapat dihapus`
                              : `Hapus dokumen ${item.fileName}`}
                            className="inline-flex items-center rounded-md p-2 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((item) => (
                <article key={item.id} className="p-5">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-semibold text-[#102f50]">{item.fileName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.student?.name || item.studentId}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="inline-flex rounded-full bg-[#e8f2f8] px-2 py-0.5 text-[10px] font-semibold text-[#357092]">
                      {item.type}
                    </span>
                    <span>· {formatBytes(item.fileSize)}</span>
                    <span>· {formatDate(item.createdAt)}</span>
                  </div>
                  <Link
                    href={`/documents/${item.id}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#c94242]"
                  >
                    <Eye className="size-3.5" />
                    Lihat Dokumen
                  </Link>
                  {canDelete && (
                    <button
                      type="button"
                      disabled={item.status === "VERIFIED"}
                      onClick={() => {
                        setDeleteCandidate(item);
                        setDeleteError(null);
                      }}
                      title={item.status === "VERIFIED" ? "Dokumen terverifikasi tidak dapat dihapus." : "Hapus dokumen"}
                      aria-label={item.status === "VERIFIED"
                        ? `Dokumen ${item.fileName} terverifikasi tidak dapat dihapus`
                        : `Hapus dokumen ${item.fileName}`}
                      className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" />
                      Hapus
                    </button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Upload Modal */}
      {openUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-document-title"
        >
          <form
            onSubmit={handleUploadSubmit}
            className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex justify-between items-start gap-4">
              <div>
                <h2 id="upload-document-title" className="font-bold text-[#102f50] text-lg">
                  Upload Dokumen
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Unggah berkas dokumen peserta ke penyimpanan cloud private
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenUpload(false)}
                aria-label="Tutup"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {students.length > 0 && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Target Peserta (Opsional untuk Admin/Staff)
                  </span>
                  <select
                    value={formValues.studentId}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, studentId: e.target.value }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
                  >
                    <option value="">Gunakan Akun Login Sendiri (Student)</option>
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.nim})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {deleteCandidate && (
                <DeleteConfirmationDialog
                  title="Hapus dokumen?"
                  recordName={deleteCandidate.fileName}
                  description="File dan object storage akan dihapus permanen. Tindakan ini tidak dapat dibatalkan. Hanya dokumen PENDING, REJECTED, atau EXPIRED yang dapat dihapus."
                  confirmLabel="Hapus Permanen"
                  pending={deletePending}
                  error={deleteError}
                  onCancel={() => {
                    if (!deletePending) {
                      setDeleteCandidate(null);
                      setDeleteError(null);
                    }
                  }}
                  onConfirm={handleDelete}
                />
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Tipe Dokumen *
                </span>
                <input
                  value={formValues.type}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, type: e.target.value }))
                  }
                  placeholder="Contoh: KTP, CV, Passport, Certificate"
                  className={`h-10 w-full rounded-lg border px-3 text-sm focus:border-[#102f50] focus:outline-none ${
                    formErrors.type ? "border-red-500" : "border-slate-200"
                  }`}
                />
                {formErrors.type && (
                  <span className="mt-1 block text-xs text-red-500">{formErrors.type}</span>
                )}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Pilih File *
                </span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFormValues((prev) => ({ ...prev, file }));
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-600 ${
                    formErrors.file ? "border-red-500" : "border-slate-200"
                  }`}
                />
                {formErrors.file && (
                  <span className="mt-1 block text-xs text-red-500">{formErrors.file}</span>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Format didukung: PDF, JPG, JPEG, PNG. Maksimal ukuran berkas: 5 MB.
                </p>
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpenUpload(false)}
                disabled={uploadLoading}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={uploadLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b33a3a] transition-colors disabled:opacity-50"
              >
                {uploadLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengunggah...
                  </>
                ) : (
                  "Unggah Dokumen"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const classes =
    status === "VERIFIED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "REJECTED" || status === "EXPIRED"
      ? "bg-[#fbeaea] text-[#c94242]"
      : "bg-[#fff6d9] text-[#a57c00]";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      {status}
    </span>
  );
}
