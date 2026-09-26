"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { DocumentRecord, DocumentStatus } from "@/components/documents/documents-page";

export function DocumentDetail({ documentId }: { documentId: string }) {
  const [document, setDocument] = useState<(DocumentRecord & { signedUrl?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Verification modal & actions
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetch(`/api/documents/${documentId}`)
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Gagal memuat detail dokumen.");
        }
        const data = await res.json();
        if (isMounted) {
          setDocument(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat dokumen.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [documentId, refreshTrigger]);

  const handleVerify = async () => {
    if (!document) return;
    setActionLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "VERIFIED" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal memverifikasi dokumen.");
      }
      setNotice("Dokumen berhasil diverifikasi (VERIFIED).");
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Gagal memproses verifikasi.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setReasonError("Alasan penolakan wajib diisi.");
      return;
    }

    if (!document) return;
    setActionLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "REJECTED",
          rejectionReason: rejectionReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal menolak dokumen.");
      }
      setNotice("Dokumen telah ditandai ditolak (REJECTED).");
      setRejectOpen(false);
      setRejectionReason("");
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setReasonError(err instanceof Error ? err.message : "Gagal menolak dokumen.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8 flex items-center justify-center min-h-[300px] text-slate-500">
        <Loader2 className="size-6 animate-spin mr-2" />
        <span>Memuat detail dokumen...</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto size-12 text-slate-300 mb-3" />
          <h1 className="text-xl font-bold text-[#102f50]">Dokumen Tidak Ditemukan</h1>
          <p className="mt-2 text-sm text-slate-500">
            Dokumen dengan ID {documentId} tidak ditemukan di sistem.
          </p>
          <Link
            href="/documents"
            className="mt-5 inline-flex rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b33a3a]"
          >
            Kembali ke Daftar Dokumen
          </Link>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-12 text-amber-500 mb-3" />
          <h1 className="text-xl font-bold text-amber-900">Akses Terbatas</h1>
          <p className="mt-2 text-sm text-amber-700">
            Anda tidak memiliki hak akses untuk membuka atau melihat berkas dokumen ini.
          </p>
          <Link
            href="/documents"
            className="mt-5 inline-flex rounded-lg bg-[#102f50] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0c243e]"
          >
            Kembali ke Dokumen Saya
          </Link>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-12 text-red-500 mb-3" />
          <h1 className="text-xl font-bold text-red-900">Terjadi Kesalahan</h1>
          <p className="mt-2 text-sm text-red-700">{error || "Gagal memuat dokumen."}</p>
          <button
            type="button"
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            className="mt-5 inline-flex rounded-lg bg-[#102f50] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <Link
        href="/documents"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:underline"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Dokumen
      </Link>

      <div className="mt-5">
        <p className="text-xs text-slate-500">Dashboard / Dokumen / {document.id}</p>
        <h1 className="mt-2 text-2xl font-bold text-[#102f50]">{document.fileName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Metadata dan status verifikasi berkas dokumen
        </p>
      </div>

      {notice && (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {/* Document Information */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Heading title="Informasi Dokumen" />
        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Nama Berkas" value={document.fileName} />
          <Detail label="Tipe Dokumen" value={document.type} />
          <Detail
            label="Peserta"
            value={document.student?.name || document.studentId}
          />
          <Detail
            label="NIM Peserta"
            value={document.student?.nim || "-"}
          />
          <Detail label="Tanggal Diunggah" value={formatDate(document.createdAt)} />
          <Detail label="Terakhir Diperbarui" value={formatDate(document.updatedAt)} />
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <div className="mt-1">
              <StatusBadge status={document.status} />
            </div>
          </div>
          <Detail
            label="Diverifikasi Oleh"
            value={document.verifiedBy?.name || document.verifiedBy?.email || "-"}
          />
          <Detail label="Waktu Verifikasi" value={formatDate(document.verifiedAt)} />
          <Detail
            label="Alasan Penolakan"
            value={document.rejectionReason || "-"}
          />
        </div>
      </section>

      {/* Storage & Preview / Download */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Heading title="Akses Penyimpanan & Berkas" />
        <div className="p-5 space-y-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <Detail label="MIME Type" value={document.fileType} />
            <Detail label="Ukuran Berkas" value={formatBytes(document.fileSize)} />
            <Detail label="Storage Path (Private)" value={document.storagePath} />
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
            {document.signedUrl ? (
              <a
                href={document.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0c243e] transition-colors"
              >
                <Download className="size-4" />
                Unduh / Buka Dokumen (Signed URL)
                <ExternalLink className="size-3.5 opacity-70" />
              </a>
            ) : (
              <span className="text-xs text-slate-400">
                Signed URL tidak tersedia untuk berkas ini.
              </span>
            )}
            <span className="text-xs text-slate-400">
              Signed URL di-generate secara server-side dan berlaku selama 15 menit.
            </span>
          </div>
        </div>
      </section>

      {/* Verification Actions (Staff / Admin Only) */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Heading title="Proses Verifikasi Dokumen" />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={document.status} />
            <span className="text-xs text-slate-500">
              {document.status === "PENDING"
                ? "Dokumen ini masih menunggu verifikasi dari Admin / Staff."
                : `Status dokumen ini telah berstatus ${document.status}.`}
            </span>
          </div>

          {document.status === "PENDING" && (
            <div className="flex flex-col gap-3 sm:flex-row pt-2">
              <button
                type="button"
                onClick={handleVerify}
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="size-4 animate-spin" />}
                Verifikasi (Verify)
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectionReason("");
                  setReasonError("");
                  setRejectOpen(true);
                }}
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#b33a3a] transition-colors disabled:opacity-50"
              >
                Tolak (Reject)
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Reject Modal */}
      {rejectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-document-title"
        >
          <form
            onSubmit={handleRejectSubmit}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex justify-between items-start gap-4">
              <h2 id="reject-document-title" className="font-bold text-[#102f50] text-lg">
                Tolak Dokumen
              </h2>
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                aria-label="Tutup"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-semibold text-slate-600">
                Alasan Penolakan (Wajib Diisi) *
              </span>
              <textarea
                autoFocus
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Contoh: Dokumen tidak terbaca jelas atau masa berlaku sudah habis."
                className={`min-h-24 w-full rounded-lg border p-3 text-sm outline-none focus:border-[#102f50] ${
                  reasonError ? "border-red-500" : "border-slate-200"
                }`}
              />
              {reasonError && (
                <span className="mt-1 block text-xs text-red-500">{reasonError}</span>
              )}
            </label>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                disabled={actionLoading}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#b33a3a] transition-colors disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="size-4 animate-spin" />}
                Tolak Dokumen
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Heading({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
      <CheckCircle2 className="size-4 text-[#c94242]" />
      <h2 className="font-bold text-[#102f50]">{title}</h2>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#102f50]">{value}</p>
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
