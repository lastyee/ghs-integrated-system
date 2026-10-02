"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Download,
  GraduationCap,
  Loader2,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import type { CertificateRecord } from "@/components/certificates/certificates-page";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";
import { useRouter } from "next/navigation";

type CertificateDetailProps = {
  certificateId: string;
  canDelete: boolean;
};

export function CertificateDetail({ certificateId, canDelete }: CertificateDetailProps) {
  const router = useRouter();
  const [certificate, setCertificate] = useState<CertificateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Revoke state
  const [openRevokeModal, setOpenRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetch("/api/auth/session")
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/certificates/${certificateId}`),
    ])
      .then(async ([sessionData, certRes]) => {
        if (!isMounted) return;

        if (sessionData?.user?.role) {
          setUserRole(sessionData.user.role);
        }

        if (certRes.status === 404) {
          setNotFound(true);
          return;
        }

        if (certRes.status === 401 || certRes.status === 403) {
          setUnauthorized(true);
          return;
        }

        if (!certRes.ok) {
          throw new Error("Gagal memuat rincian sertifikat");
        }

        const json = await certRes.json();
        setCertificate(json.data || null);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Gagal memuat rincian sertifikat");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [certificateId]);

  const canRevoke = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  async function handleRevokeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRevokeError(null);
    setRevoking(true);

    try {
      const res = await fetch(`/api/certificates/${certificateId}/revoke`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: revokeReason.trim() || undefined }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal mencabut sertifikat");
      }

      setCertificate(json.data);
      setOpenRevokeModal(false);
      setRevokeReason("");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setRevokeError(err.message);
      } else {
        setRevokeError("Terjadi kesalahan sistem saat mencabut sertifikat");
      }
    } finally {
      setRevoking(false);
    }
  }

  async function handleDownload() {
    setDownloadError(null);
    if (!certificate?.path) {
      setDownloadError("File sertifikat belum tersedia di sistem penyimpanan");
      return;
    }

    setDownloading(true);
    try {
      const res = await fetch(`/api/certificates/${certificateId}/download`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal mendapatkan tautan unduhan sertifikat");
      }
      if (json.data?.signedUrl) {
        window.open(json.data.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("Tautan unduhan tidak valid");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDownloadError(err.message);
      } else {
        setDownloadError("Terjadi kesalahan saat mengunduh sertifikat");
      }
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div data-testid="loading-state" className="mx-auto max-w-4xl p-4 sm:p-8">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm text-slate-500">Memuat rincian sertifikat...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div data-testid="not-found-state" className="mx-auto max-w-4xl p-4 sm:p-8">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="size-12 text-slate-400" />
          <h2 className="mt-4 text-lg font-bold text-[#102f50]">Sertifikat Tidak Ditemukan</h2>
          <p className="mt-2 text-sm text-slate-500">
            Sertifikat yang Anda cari tidak ditemukan atau telah dihapus dari sistem.
          </p>
          <Link
            href="/certificates"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4066]"
          >
            <ArrowLeft className="size-4" />
            Kembali ke Daftar Sertifikat
          </Link>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div data-testid="unauthorized-state" className="mx-auto max-w-4xl p-4 sm:p-8">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="size-12 text-[#c94242]" />
          <h2 className="mt-4 text-lg font-bold text-[#102f50]">Akses Ditolak</h2>
          <p className="mt-2 text-sm text-slate-500">
            Anda tidak memiliki akses ke rincian sertifikat ini.
          </p>
          <Link
            href="/certificates"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            Kembali
          </Link>
        </div>
      </div>
    );
  }

  if (error || !certificate) {
    return (
      <div data-testid="error-state" className="mx-auto max-w-4xl p-4 sm:p-8">
        <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="size-10 text-red-600" />
          <p className="mt-3 font-semibold text-red-800">{error || "Terjadi kesalahan sistem"}</p>
          <Link
            href="/certificates"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Daftar
          </Link>
        </div>
      </div>
    );
  }

  const isRevoked = certificate.status === "REVOKED";
  const issuedDateStr = certificate.issuedAt
    ? new Date(certificate.issuedAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-";
  const createdDateStr = certificate.createdAt
    ? new Date(certificate.createdAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      {/* Navigation & Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/certificates"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-[#102f50] sm:text-2xl">
                {certificate.certificateNumber}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                  isRevoked
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }`}
              >
                {isRevoked ? "Dicabut" : "Aktif"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">ID Sertifikat: {certificate.id}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {certificate.path && (
            <button
              type="button"
              data-testid="download-certificate-button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a4066] disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Lihat / Download Sertifikat
            </button>
          )}

          {canRevoke && !isRevoked && (
            <button
              type="button"
              data-testid="revoke-button"
              onClick={() => setOpenRevokeModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              <AlertTriangle className="size-4" />
              Cabut Sertifikat
            </button>
          )}
          {canDelete && (
            <SoftDeleteAction
              endpoint={`/api/certificates/${certificateId}`}
              recordName="Sertifikat"
              identifier={certificate.certificateNumber}
              description="Status ACTIVE/REVOKED dan relasi riwayat tetap tersimpan. File storage tidak dihapus."
              onDeleted={() => router.push("/certificates")}
            />
          )}
        </div>
      </div>

      {/* Revocation Warning Banner */}
      {isRevoked && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
          <div>
            <h2 className="text-sm font-bold">Sertifikat Telah Dicabut</h2>
            <p className="mt-0.5 text-xs text-red-700">
              Sertifikat ini sudah tidak berlaku secara resmi dan telah dicabut oleh pihak manajemen / admin GHS.
            </p>
          </div>
        </div>
      )}

      {downloadError && (
        <div className="mb-6 flex items-center justify-between rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 shrink-0" />
            <p>{downloadError}</p>
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-xs font-semibold text-red-700 underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Detail Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Data Peserta */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="size-5 text-[#102f50]" />
            <h2 className="font-bold text-[#102f50]">Informasi Peserta</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Nama Lengkap</p>
              <p className="mt-0.5 font-semibold text-slate-800">
                {certificate.student?.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Nomor Induk Mahasiswa (NIM)</p>
              <p className="mt-0.5 font-semibold text-slate-800">
                {certificate.student?.nim || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">ID Peserta</p>
              <p className="mt-0.5 text-xs font-mono text-slate-600">
                {certificate.studentId}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Program & Batch */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <GraduationCap className="size-5 text-[#102f50]" />
            <h2 className="font-bold text-[#102f50]">Program & Pelatihan</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Program Pelatihan</p>
              <p className="mt-0.5 font-semibold text-slate-800">
                {certificate.program?.name} ({certificate.program?.code})
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Batch Angkatan</p>
              <p className="mt-0.5 font-semibold text-slate-800">
                {certificate.batch?.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">ID Program / ID Batch</p>
              <p className="mt-0.5 text-xs font-mono text-slate-600">
                {certificate.programId} / {certificate.batchId}
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Penerbitan & Status */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Calendar className="size-5 text-[#102f50]" />
            <h2 className="font-bold text-[#102f50]">Status Penerbitan</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Status Sertifikat</p>
              <p className="mt-0.5 font-semibold text-slate-800">
                {isRevoked ? "Dicabut (REVOKED)" : "Aktif (ACTIVE)"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Tanggal Terbit</p>
              <p className="mt-0.5 font-semibold text-slate-800">{issuedDateStr}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Tanggal Pencatatan Sistem</p>
              <p className="mt-0.5 text-xs text-slate-600">{createdDateStr}</p>
            </div>
          </div>
        </div>

        {/* Card 4: Dokumen & Storage File */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Award className="size-5 text-[#102f50]" />
            <h2 className="font-bold text-[#102f50]">Berkas Sertifikat</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Storage Path</p>
              <p className="mt-0.5 text-xs font-mono text-slate-700 break-all">
                {certificate.path || "Belum ada file diunggah"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Ketersediaan File</p>
              <p className="mt-0.5 font-semibold text-slate-800">
                {certificate.path ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="size-4" />
                    Tersedia di Private Storage
                  </span>
                ) : (
                  <span className="text-slate-400">Tidak tersedia</span>
                )}
              </p>
            </div>
            {certificate.path && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1a4066] disabled:opacity-50"
                >
                  {downloading && <Loader2 className="size-3.5 animate-spin" />}
                  Buka Tautan Unduh
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Revoking Certificate */}
      {openRevokeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="revoke-modal-title" className="text-base font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="size-5" />
                Cabut Sertifikat
              </h2>
              <button
                type="button"
                aria-label="Tutup"
                onClick={() => setOpenRevokeModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            {revokeError && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {revokeError}
              </div>
            )}

            <form onSubmit={handleRevokeSubmit} className="mt-4 space-y-4">
              <p className="text-sm text-slate-700">
                Apakah Anda yakin ingin mencabut sertifikat{" "}
                <span className="font-bold text-[#102f50]">
                  {certificate.certificateNumber}
                </span>
                ? Tindakan ini akan mengubah status sertifikat menjadi{" "}
                <span className="font-semibold text-red-600">Dicabut (REVOKED)</span>.
              </p>

              <div>
                <label
                  htmlFor="revoke-reason-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Alasan Pencabutan (Opsional)
                </label>
                <textarea
                  id="revoke-reason-input"
                  rows={3}
                  placeholder="Contoh: Kesalahan data penulisan / Pelanggaran integritas"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-800 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenRevokeModal(false)}
                  disabled={revoking}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  data-testid="confirm-revoke-button"
                  disabled={revoking}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {revoking && <Loader2 className="size-3.5 animate-spin" />}
                  {revoking ? "Mencabut..." : "Ya, Cabut Sertifikat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
