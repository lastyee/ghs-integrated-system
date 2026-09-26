"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { CertificateForm } from "@/components/certificates/certificate-form";

export type CertificateStatus = "ACTIVE" | "REVOKED";

export type CertificateRecord = {
  id: string;
  studentId: string;
  programId: string;
  batchId: string;
  certificateNumber: string;
  issuedAt: string;
  status: CertificateStatus;
  path: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    nim: string;
    name: string;
  };
  program: {
    id: string;
    code: string;
    name: string;
  };
  batch: {
    id: string;
    name: string;
  };
};

export function CertificatesPage() {
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | CertificateStatus>("ALL");
  const [batchFilter, setBatchFilter] = useState("ALL");

  // Create modal state
  const [openCreate, setOpenCreate] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Fetch session role and certificates in parallel
    Promise.all([
      fetch("/api/auth/session")
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/certificates"),
    ])
      .then(async ([sessionData, certsRes]) => {
        if (!isMounted) return;

        if (sessionData?.user?.role) {
          setUserRole(sessionData.user.role);
        }

        if (certsRes.status === 401 || certsRes.status === 403) {
          setUnauthorized(true);
          return;
        }

        if (!certsRes.ok) {
          throw new Error("Gagal memuat daftar sertifikat");
        }

        const json = await certsRes.json();
        setCertificates(json.data || []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Gagal memuat sertifikat");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const canCreate = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const isStudent = userRole === "STUDENT";

  // Derive unique batches for filter dropdown
  const uniqueBatches = useMemo(() => {
    const map = new Map<string, string>();
    certificates.forEach((c) => {
      if (c.batch?.id && c.batch?.name) {
        map.set(c.batch.id, c.batch.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [certificates]);

  // Client-side filtering for fast responsive UI
  const filteredCertificates = useMemo(() => {
    return certificates.filter((cert) => {
      if (statusFilter !== "ALL" && cert.status !== statusFilter) {
        return false;
      }
      if (batchFilter !== "ALL" && cert.batchId !== batchFilter) {
        return false;
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        const numMatch = cert.certificateNumber.toLowerCase().includes(q);
        const studentMatch =
          cert.student?.name.toLowerCase().includes(q) ||
          cert.student?.nim.toLowerCase().includes(q);
        const programMatch = cert.program?.name.toLowerCase().includes(q);
        if (!numMatch && !studentMatch && !programMatch) return false;
      }
      return true;
    });
  }, [certificates, statusFilter, batchFilter, query]);

  const activeCount = certificates.filter((c) => c.status === "ACTIVE").length;
  const revokedCount = certificates.filter((c) => c.status === "REVOKED").length;

  async function handleDownload(cert: CertificateRecord) {
    setDownloadError(null);
    if (!cert.path) {
      setDownloadError(`File sertifikat ${cert.certificateNumber} belum tersedia`);
      return;
    }

    setDownloadingId(cert.id);
    try {
      const res = await fetch(`/api/certificates/${cert.id}/download`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal mendapatkan tautan download");
      }
      if (json.data?.signedUrl) {
        window.open(json.data.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("Tautan download tidak valid");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDownloadError(err.message);
      } else {
        setDownloadError("Terjadi kesalahan saat mengunduh sertifikat");
      }
    } finally {
      setDownloadingId(null);
    }
  }

  if (unauthorized) {
    return (
      <div data-testid="unauthorized-state" className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="size-12 text-[#c94242]" />
          <h2 className="mt-4 text-lg font-bold text-[#102f50]">Akses Ditolak</h2>
          <p className="mt-2 text-sm text-slate-500">
            Anda tidak memiliki akses ke modul Sertifikat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#102f50] sm:text-2xl">Sertifikat Pelatihan</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isStudent
              ? "Daftar sertifikat kelulusan dan pelatihan yang telah diterbitkan untuk Anda"
              : "Kelola penerbitan sertifikat resmi kelulusan peserta pelatihan GHS"}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            data-testid="create-certificate-button"
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#102f50] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a4066]"
          >
            <Plus className="size-4" />
            Terbitkan Sertifikat
          </button>
        )}
      </div>

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

      {/* Stats Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Sertifikat"
          value={String(certificates.length)}
          description="Seluruh sertifikat terbit"
          icon={Award}
          tone="navy"
        />
        <StatCard
          label="Sertifikat Aktif"
          value={String(activeCount)}
          description="Sertifikat sah & berlaku"
          icon={CheckCircle2}
          tone="yellow"
        />
        <StatCard
          label="Sertifikat Dicabut"
          value={String(revokedCount)}
          description="Status tidak lagi aktif"
          icon={AlertCircle}
          tone="red"
        />
      </div>

      {/* Filter & Search Bar */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nomor sertifikat, nama peserta, atau program..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:border-[#102f50] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | CertificateStatus)}
            aria-label="Filter status sertifikat"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#102f50] focus:outline-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Aktif</option>
            <option value="REVOKED">Dicabut</option>
          </select>

          {uniqueBatches.length > 0 && (
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              aria-label="Filter batch"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#102f50] focus:outline-none"
            >
              <option value="ALL">Semua Batch</option>
              {uniqueBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {(query || statusFilter !== "ALL" || batchFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
                setBatchFilter("ALL");
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Content / Table / Cards */}
      {loading ? (
        <div
          data-testid="loading-state"
          className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm text-slate-500">Memuat data sertifikat...</p>
        </div>
      ) : error ? (
        <div
          data-testid="error-state"
          className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <AlertCircle className="size-10 text-red-600" />
          <p className="mt-3 font-semibold text-red-800">{error}</p>
          <button
            type="button"
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Coba Lagi
          </button>
        </div>
      ) : filteredCertificates.length === 0 ? (
        <div
          data-testid="empty-state"
          className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm"
        >
          <Award className="size-12 text-slate-300" />
          <h3 className="mt-3 text-base font-bold text-slate-700">Belum ada data sertifikat.</h3>
          <p className="mt-1 text-sm text-slate-400">
            {certificates.length === 0
              ? isStudent
                ? "Sertifikat Anda akan muncul di sini setelah diterbitkan oleh admin."
                : "Belum ada sertifikat yang diterbitkan dalam sistem."
              : "Tidak ada sertifikat yang cocok dengan filter pencarian Anda."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-100 bg-[#f8fafc] text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">Nomor Sertifikat</th>
                  <th className="px-6 py-4">Peserta</th>
                  <th className="px-6 py-4">Program & Batch</th>
                  <th className="px-6 py-4">Tanggal Terbit</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCertificates.map((cert) => {
                  const isRevoked = cert.status === "REVOKED";
                  const dateStr = cert.issuedAt
                    ? new Date(cert.issuedAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "-";

                  return (
                    <tr key={cert.id} className="transition hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <Link
                          href={`/certificates/${cert.id}`}
                          className="font-semibold text-[#102f50] hover:underline"
                        >
                          {cert.certificateNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-800">{cert.student?.name}</p>
                        <p className="text-xs text-slate-400">NIM: {cert.student?.nim}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-800">{cert.program?.name}</p>
                        <p className="text-xs text-slate-400">{cert.batch?.name}</p>
                      </td>
                      <td className="px-6 py-4">{dateStr}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isRevoked
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {isRevoked ? "Dicabut" : "Aktif"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/certificates/${cert.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#102f50] hover:bg-slate-100"
                          >
                            Rincian
                            <ExternalLink className="size-3" />
                          </Link>

                          {cert.path && (
                            <button
                              type="button"
                              onClick={() => handleDownload(cert)}
                              disabled={downloadingId === cert.id}
                              aria-label={`Download sertifikat ${cert.certificateNumber}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#102f50] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a4066] disabled:opacity-50"
                            >
                              {downloadingId === cert.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Download className="size-3" />
                              )}
                              Unduh
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="divide-y divide-slate-100 md:hidden">
            {filteredCertificates.map((cert) => {
              const isRevoked = cert.status === "REVOKED";
              const dateStr = cert.issuedAt
                ? new Date(cert.issuedAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "-";

              return (
                <div key={cert.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/certificates/${cert.id}`}
                        className="font-bold text-[#102f50] hover:underline"
                      >
                        {cert.certificateNumber}
                      </Link>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {cert.student?.name}
                      </p>
                      <p className="text-xs text-slate-400">NIM: {cert.student?.nim}</p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isRevoked
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {isRevoked ? "Dicabut" : "Aktif"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 space-y-1">
                    <p>
                      <span className="font-medium text-slate-700">Program: </span>
                      {cert.program?.name}
                    </p>
                    <p>
                      <span className="font-medium text-slate-700">Batch: </span>
                      {cert.batch?.name}
                    </p>
                    <p>
                      <span className="font-medium text-slate-700">Terbit: </span>
                      {dateStr}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/certificates/${cert.id}`}
                      className="flex-1 text-center rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-[#102f50] hover:bg-slate-50"
                    >
                      Lihat Rincian
                    </Link>
                    {cert.path && (
                      <button
                        type="button"
                        onClick={() => handleDownload(cert)}
                        disabled={downloadingId === cert.id}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[#102f50] py-1.5 text-xs font-semibold text-white hover:bg-[#1a4066] disabled:opacity-50"
                      >
                        {downloadingId === cert.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Download className="size-3" />
                        )}
                        Unduh
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {openCreate && (
        <CertificateForm
          open={openCreate}
          onClose={() => setOpenCreate(false)}
          onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}
    </div>
  );
}
