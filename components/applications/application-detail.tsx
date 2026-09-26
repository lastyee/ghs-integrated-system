"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock,
  Edit2,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { InterviewFormModal } from "@/components/interviews/interview-form";
import { PlacementFormModal } from "@/components/placements/placement-form";
import { PlacementStatusBadge } from "@/components/placements/placements-page";
import {
  APPLICATION_STATUS_LABELS,
  ApplicationStatusValue,
} from "@/schemas/application";
import { ApplicationStatusBadge } from "./applications-page";

export type ApplicationDetailData = {
  id: string;
  studentId: string;
  vacancyId: string;
  status: ApplicationStatusValue;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    nim: string;
    name: string;
    phone: string | null;
    address: string | null;
    userId: string | null;
  };
  vacancy: {
    id: string;
    title: string;
    description: string;
    requirements: string;
    status: string;
    employer: {
      id: string;
      name: string;
      companyInfo: string | null;
      address: string | null;
    };
  };
  interviews?: Array<{
    id: string;
    scheduledAt: string;
    method: string;
    location: string | null;
    status: string;
    notes: string | null;
    feedback: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  placement?: {
    id: string;
    position: string;
    startDate: string;
    status: string;
    notes: string | null;
    employer: {
      id: string;
      name: string;
    };
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type ApplicationDetailProps = {
  applicationId: string;
  userRole?: string;
  userId?: string;
};

// Visual Status Timeline Component
function StatusTimeline({ status }: { status: ApplicationStatusValue }) {
  const steps: { key: ApplicationStatusValue; label: string }[] = [
    { key: "APPLIED", label: "Diajukan" },
    { key: "SCREENING", label: "Screening" },
    { key: "INTERVIEW", label: "Interview" },
    { key: "SELECTED", label: "Terpilih" },
  ];

  // Determine stage rank for progressive coloring
  const stageRanks: Record<ApplicationStatusValue, number> = {
    APPLIED: 1,
    SCREENING: 2,
    INTERVIEW: 3,
    SELECTED: 4,
    REJECTED: -1,
    WITHDRAWN: -2,
  };

  const currentRank = stageRanks[status] || 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Tahapan Seleksi (Visual Flow)
      </h3>

      {/* Main linear pipeline */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {steps.map((step, idx) => {
          const isPassed = currentRank > idx + 1;
          const isCurrent = status === step.key;

          let stepClass =
            "border-slate-200 bg-slate-50 text-slate-400"; // upcoming
          if (isCurrent) {
            stepClass = "border-[#102f50] bg-[#102f50] text-white shadow-sm";
          } else if (isPassed) {
            stepClass = "border-emerald-600 bg-emerald-50 text-emerald-700";
          }

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div
                className={`flex w-full items-center gap-3 rounded-lg border p-3 ${stepClass}`}
              >
                <div
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCurrent
                      ? "bg-white text-[#102f50]"
                      : isPassed
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {isPassed ? "✓" : idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-tight">{step.label}</p>
                  <p className="text-[10px] opacity-80">{step.key}</p>
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div className="hidden px-2 text-slate-300 sm:block">→</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Terminal branches if REJECTED or WITHDRAWN */}
      {status === "REJECTED" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <XCircle className="size-4 shrink-0 text-rose-600" />
          <span>
            <strong>Status Terminal: Ditolak (REJECTED).</strong> Proses seleksi
            telah berakhir untuk lowongan ini.
          </span>
        </div>
      )}

      {status === "WITHDRAWN" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 p-3 text-xs text-slate-700">
          <XCircle className="size-4 shrink-0 text-slate-500" />
          <span>
            <strong>Status Terminal: Ditarik (WITHDRAWN).</strong> Lamaran telah
            ditarik oleh peserta.
          </span>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        * Alur di atas merefleksikan tahapan progres saat ini berdasarkan status
        aktif lamaran.
      </p>
    </div>
  );
}

export function ApplicationDetail({
  applicationId,
  userRole = "",
}: ApplicationDetailProps) {
  const isStudent =
    userRole.toUpperCase() === "STUDENT" || userRole.toLowerCase() === "student";
  const isManagement =
    userRole.toUpperCase() === "MANAGEMENT" ||
    userRole.toLowerCase() === "management";
  const isStaff = !isStudent && !isManagement;

  const [application, setApplication] = useState<ApplicationDetailData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Notice
  const [notice, setNotice] = useState("");

  // Student Withdraw confirmation modal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  // Staff Transition Modal
  const [targetStatus, setTargetStatus] =
    useState<ApplicationStatusValue | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionError, setTransitionError] = useState("");

  // Staff Edit Notes Modal / Form
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState("");

  // Schedule Interview Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Placement Form Modal
  const [showPlacementModal, setShowPlacementModal] = useState(false);

  // Fetch application detail
  useEffect(() => {
    let isMounted = true;

    fetch(`/api/applications/${applicationId}`)
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Gagal memuat detail lamaran.");
        }
        const data = await res.json();
        if (isMounted) {
          setApplication(data);
          setNotesValue(data.notes || "");
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Terjadi kesalahan sistem."
          );
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [applicationId, refreshTrigger]);

  // Handle Student Withdraw
  const handleConfirmWithdraw = async () => {
    if (!application) return;
    setWithdrawLoading(true);
    setWithdrawError("");

    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "WITHDRAWN" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Gagal menarik lamaran.");
      }

      setNotice("Lamaran Anda berhasil ditarik.");
      setShowWithdrawModal(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setWithdrawError(
        err instanceof Error
          ? err.message
          : "Gagal menarik lamaran. Status mungkin sudah diperbarui."
      );
    } finally {
      setWithdrawLoading(false);
    }
  };

  // Handle Staff Status Transition
  const handleConfirmTransition = async () => {
    if (!application || !targetStatus) return;
    setTransitionLoading(true);
    setTransitionError("");

    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Gagal memperbarui status.");
      }

      setNotice(
        `Status berhasil diperbarui menjadi ${APPLICATION_STATUS_LABELS[targetStatus]}.`
      );
      setTargetStatus(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setTransitionError(
        err instanceof Error ? err.message : "Gagal memperbarui status."
      );
    } finally {
      setTransitionLoading(false);
    }
  };

  // Handle Staff Save Notes
  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!application) return;
    setSavingNotes(true);
    setNotesError("");

    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Gagal menyimpan catatan.");
      }

      setNotice("Catatan internal berhasil disimpan.");
      setEditingNotes(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setNotesError(
        err instanceof Error ? err.message : "Gagal menyimpan catatan."
      );
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div
          data-testid="loading-state"
          className="flex min-h-[350px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            Memuat rincian data lamaran...
          </p>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div
          data-testid="unauthorized-state"
          className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/50 p-12 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-red-100 text-[#c94242]">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#102f50]">
            Akses Ditolak (403 Forbidden)
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Anda tidak memiliki akses ke data lamaran ini. Pastikan Anda masuk
            menggunakan akun yang sesuai.
          </p>
          <Link
            href="/applications"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Daftar Lamaran
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !application) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div
          data-testid="not-found-state"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm"
        >
          <FileText className="size-12 text-slate-300" />
          <h2 className="mt-4 text-xl font-bold text-[#102f50]">
            Lamaran tidak ditemukan.
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Data lamaran dengan ID tersebut tidak ditemukan di sistem atau mungkin
            telah dihapus.
          </p>
          <Link
            href="/applications"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Daftar Lamaran
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div
          data-testid="error-state"
          className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm"
        >
          <AlertCircle className="size-8 text-[#c94242]" />
          <p className="mt-3 text-base font-semibold text-slate-800">
            Gagal Memuat Detail Lamaran
          </p>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            className="mt-4 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      {/* Header & Back Link */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/applications"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#102f50]"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Daftar Lamaran
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#102f50]">
              {application.vacancy.title}
            </h1>
            <ApplicationStatusBadge status={application.status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Kandidat: <strong className="text-slate-700">{application.student.name}</strong> ({application.student.nim}) • Mitra:{" "}
            <strong className="text-slate-700">{application.vacancy.employer.name}</strong>
          </p>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Status Timeline */}
      <div className="mb-6">
        <StatusTimeline status={application.status} />
      </div>

      {/* Two Column Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols): Candidate & Vacancy Details */}
        <div className="space-y-6 lg:col-span-2">
          {/* Candidate Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-[#102f50]">
              <User className="size-4.5 text-[#102f50]" />
              Data Kandidat Peserta
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs text-slate-400">Nama Lengkap</p>
                <p className="font-semibold text-slate-800">
                  {application.student.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Nomor Induk Mahasiswa (NIM)</p>
                <p className="font-semibold text-slate-800">
                  {application.student.nim}
                </p>
              </div>
              {application.student.phone && (
                <div>
                  <p className="text-xs text-slate-400">Nomor Telepon</p>
                  <p className="font-semibold text-slate-800">
                    {application.student.phone}
                  </p>
                </div>
              )}
              {application.student.address && (
                <div>
                  <p className="text-xs text-slate-400">Alamat</p>
                  <p className="font-semibold text-slate-800">
                    {application.student.address}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Vacancy & Employer Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-[#102f50]">
              <BriefcaseBusiness className="size-4.5 text-[#102f50]" />
              Rincian Lowongan & Mitra Perusahaan
            </h2>
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-400">Posisi Lowongan</p>
                  <p className="font-semibold text-[#102f50]">
                    {application.vacancy.title}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Perusahaan Mitra</p>
                  <p className="font-semibold text-[#102f50]">
                    {application.vacancy.employer.name}
                  </p>
                </div>
              </div>

              {application.vacancy.employer.address && (
                <div>
                  <p className="text-xs text-slate-400">Alamat Perusahaan</p>
                  <p className="text-slate-700">
                    {application.vacancy.employer.address}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs text-slate-400">Deskripsi Pekerjaan</p>
                <p className="mt-1 whitespace-pre-line text-slate-700">
                  {application.vacancy.description}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Persyaratan & Kualifikasi</p>
                <p className="mt-1 whitespace-pre-line text-slate-700">
                  {application.vacancy.requirements}
                </p>
              </div>
            </div>
          </div>

          {/* Scheduled Interviews */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-[#102f50]">
                <Clock className="size-4.5 text-[#102f50]" />
                Jadwal Wawancara (Interview)
              </h2>
              {isStaff &&
                application.status !== "REJECTED" &&
                application.status !== "WITHDRAWN" && (
                  <button
                    type="button"
                    data-testid="btn-schedule-interview"
                    onClick={() => setShowScheduleModal(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#102f50] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1a4470]"
                  >
                    <Plus className="size-3.5" />
                    Jadwalkan Interview
                  </button>
                )}
            </div>

            {application.interviews && application.interviews.length > 0 ? (
              <div className="mt-4 divide-y divide-slate-100">
                {application.interviews.map((iv) => {
                  const dateObj = new Date(iv.scheduledAt);
                  const dateStr = !isNaN(dateObj.getTime())
                    ? dateObj.toLocaleDateString("id-ID", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : iv.scheduledAt;
                  const timeStr = !isNaN(dateObj.getTime())
                    ? dateObj.toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-";

                  const statusConfig: Record<string, { label: string; class: string }> = {
                    PENDING: { label: "Menunggu", class: "bg-[#e8f2f8] text-[#357092]" },
                    RESCHEDULED: { label: "Dijadwalkan Ulang", class: "bg-[#fff6d9] text-[#a57c00]" },
                    PASSED: { label: "Lulus", class: "bg-emerald-50 text-emerald-700" },
                    FAILED: { label: "Tidak Lulus", class: "bg-[#fbeaea] text-[#c94242]" },
                  };
                  const badge = statusConfig[iv.status] || {
                    label: iv.status,
                    class: "bg-slate-100 text-slate-600",
                  };

                  return (
                    <div key={iv.id} className="py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">
                          Metode: {iv.method}
                        </span>
                        <span
                          className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.class}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {dateStr}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {timeStr}
                        </span>
                        {iv.location && <span>Lokasi: {iv.location}</span>}
                      </div>
                      {iv.notes && (
                        <p className="mt-1 text-xs text-slate-600">
                          Catatan: {iv.notes}
                        </p>
                      )}
                      {!isStudent && iv.feedback && (
                        <div className="mt-2 rounded bg-amber-50/60 border border-amber-200 p-2 text-xs text-amber-900">
                          <span className="font-semibold">Feedback Internal: </span>
                          {iv.feedback}
                        </div>
                      )}
                      <div className="mt-2 text-right">
                        <Link
                          href={`/interviews/${iv.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#102f50] hover:underline"
                        >
                          Lihat Detail Wawancara
                          <ExternalLink className="size-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-center py-4">
                <p className="text-xs text-slate-500">
                  Belum ada jadwal wawancara yang ditetapkan untuk lamaran ini.
                </p>
              </div>
            )}
          </div>

          {/* Placement Record */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-[#102f50]">
                <Building2 className="size-4.5 text-[#102f50]" />
                Data Penempatan (Placement)
              </h2>
              {isStaff && !application.placement && (
                <button
                  type="button"
                  data-testid="btn-create-placement-from-application"
                  onClick={() => setShowPlacementModal(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#102f50] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1a4470]"
                >
                  <Plus className="size-3.5" />
                  + Buat Placement
                </button>
              )}
            </div>

            {application.placement ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-400">Posisi</p>
                    <p className="font-semibold text-slate-800">
                      {application.placement.position}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Perusahaan Mitra</p>
                    <p className="font-semibold text-slate-800">
                      {application.placement.employer?.name}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Tanggal Mulai</p>
                  <p className="text-slate-700">
                    {application.placement.startDate
                      ? new Date(application.placement.startDate).toLocaleDateString(
                          "id-ID",
                          {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }
                        )
                      : "Belum ditentukan"}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Status Penempatan</p>
                    <PlacementStatusBadge status={application.placement.status} />
                  </div>
                  <Link
                    href={`/placements/${application.placement.id}`}
                    data-testid="view-application-placement-link"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#102f50] hover:underline"
                  >
                    Lihat Detail Penempatan
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Belum ada catatan penempatan terkait lamaran ini.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Status Actions & Notes */}
        <div className="space-y-6">
          {/* Status & Actions Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-[#102f50]">Status & Tindakan</h2>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Status Saat Ini</span>
                <ApplicationStatusBadge status={application.status} />
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Tanggal Pengajuan</span>
                <span className="font-medium text-slate-800">
                  {new Date(application.createdAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Terakhir Diperbarui</span>
                <span className="font-medium text-slate-800">
                  {new Date(application.updatedAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Action buttons based on Role & Status */}
            <div className="mt-5 pt-3 border-t border-slate-100">
              {/* STUDENT ACTIONS */}
              {isStudent && (
                <div>
                  {application.status === "APPLIED" ? (
                    <div>
                      <p className="mb-2 text-xs text-slate-500">
                        Lamaran masih dalam tahap awal. Anda dapat menarik lamaran
                        ini jika tidak ingin melanjutkan.
                      </p>
                      <button
                        data-testid="withdraw-button"
                        onClick={() => {
                          setWithdrawError("");
                          setShowWithdrawModal(true);
                        }}
                        className="w-full rounded-lg bg-rose-50 border border-rose-200 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Tarik Lamaran Saya
                      </button>
                    </div>
                  ) : application.status === "WITHDRAWN" ? (
                    <div className="rounded-lg bg-slate-100 p-3 text-center text-xs font-medium text-slate-600">
                      Lamaran ini telah ditarik.
                    </div>
                  ) : (
                    <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                      Lamaran Anda telah diproses ke tahap{" "}
                      <strong>
                        {APPLICATION_STATUS_LABELS[application.status]}
                      </strong>{" "}
                      dan tidak dapat ditarik kembali.
                    </div>
                  )}
                </div>
              )}

              {/* STAFF ACTIONS (PLACEMENT_STAFF, ADMIN, SUPER_ADMIN) */}
              {isStaff && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700">
                    Tindakan Tahapan Seleksi:
                  </p>

                  {application.status === "APPLIED" && (
                    <button
                      data-testid="btn-to-screening"
                      onClick={() => setTargetStatus("SCREENING")}
                      className="w-full rounded-lg bg-amber-500 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
                    >
                      Mulai Tahap Screening
                    </button>
                  )}

                  {application.status === "SCREENING" && (
                    <div className="space-y-2">
                      <button
                        data-testid="btn-to-interview"
                        onClick={() => setTargetStatus("INTERVIEW")}
                        className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                      >
                        Lanjut ke Wawancara (Interview)
                      </button>
                      <button
                        data-testid="btn-to-rejected"
                        onClick={() => setTargetStatus("REJECTED")}
                        className="w-full rounded-lg bg-rose-50 border border-rose-200 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Tolak Kandidat
                      </button>
                    </div>
                  )}

                  {application.status === "INTERVIEW" && (
                    <div className="space-y-2">
                      <button
                        data-testid="btn-to-selected"
                        onClick={() => setTargetStatus("SELECTED")}
                        className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                      >
                        Pilih Kandidat (Selected)
                      </button>
                      <button
                        data-testid="btn-to-rejected"
                        onClick={() => setTargetStatus("REJECTED")}
                        className="w-full rounded-lg bg-rose-50 border border-rose-200 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Tolak Kandidat
                      </button>
                    </div>
                  )}

                  {(application.status === "SELECTED" ||
                    application.status === "REJECTED" ||
                    application.status === "WITHDRAWN") && (
                    <div className="rounded-lg bg-slate-100 p-3 text-center text-xs text-slate-500">
                      Status ini bersifat final (terminal). Tidak ada transisi status
                      lebih lanjut.
                    </div>
                  )}
                </div>
              )}

              {/* MANAGEMENT ROLE */}
              {isManagement && (
                <div className="rounded-lg bg-slate-100 p-3 text-center text-xs text-slate-500">
                  Role Management memiliki akses read-only pada data lamaran.
                </div>
              )}
            </div>
          </div>

          {/* Internal Notes Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#102f50]">Catatan Internal</h2>
              {isStaff && !editingNotes && (
                <button
                  data-testid="edit-notes-button"
                  onClick={() => {
                    setNotesValue(application.notes || "");
                    setEditingNotes(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#102f50] hover:text-[#1a4470]"
                >
                  <Edit2 className="size-3" />
                  Edit
                </button>
              )}
            </div>

            {editingNotes ? (
              <form onSubmit={handleSaveNotes} className="mt-3 space-y-3">
                <textarea
                  id="application-notes-input"
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  rows={4}
                  placeholder="Tambahkan catatan internal mengenai kandidat atau proses seleksi..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                />
                {notesError && (
                  <p className="text-xs text-rose-600">{notesError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingNotes(false)}
                    disabled={savingNotes}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    id="btn-save-notes"
                    disabled={savingNotes}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#102f50] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a4470] disabled:opacity-50"
                  >
                    {savingNotes && <Loader2 className="size-3 animate-spin" />}
                    Simpan Catatan
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3">
                {application.notes ? (
                  <p className="whitespace-pre-line text-xs text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-100">
                    {application.notes}
                  </p>
                ) : (
                  <p className="text-xs italic text-slate-400">
                    Belum ada catatan internal.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Student Withdraw Confirmation Modal */}
      {showWithdrawModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#102f50]">Tarik lamaran ini?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Apakah Anda yakin ingin menarik lamaran untuk lowongan{" "}
              <strong>{application.vacancy.title}</strong>?
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Setelah ditarik, status lamaran akan berubah menjadi WITHDRAWN dan
              tidak dapat dilanjutkan kembali.
            </p>

            {withdrawError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {withdrawError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                disabled={withdrawLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-detail-withdraw"
                onClick={handleConfirmWithdraw}
                disabled={withdrawLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#c94242] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a83434] disabled:opacity-50"
              >
                {withdrawLoading && <Loader2 className="size-3.5 animate-spin" />}
                Konfirmasi Tarik Lamaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Transition Modal */}
      {targetStatus && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#102f50]">
              Ubah Status Lamaran
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Apakah Anda yakin ingin mengubah status lamaran{" "}
              <strong>{application.student.name}</strong> menjadi{" "}
              <strong className="text-[#102f50]">
                {APPLICATION_STATUS_LABELS[targetStatus]}
              </strong>
              ?
            </p>

            {transitionError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {transitionError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTargetStatus(null)}
                disabled={transitionLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-detail-transition"
                onClick={handleConfirmTransition}
                disabled={transitionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470] disabled:opacity-50"
              >
                {transitionLoading && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                Konfirmasi Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
      {showScheduleModal && (
        <InterviewFormModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          preselectedApplicationId={application.id}
          onSuccess={() => {
            setNotice("Jadwal wawancara berhasil dibuat.");
            setShowScheduleModal(false);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
      {showPlacementModal && (
        <PlacementFormModal
          isOpen={showPlacementModal}
          onClose={() => setShowPlacementModal(false)}
          initialApplicationId={application.id}
          initialStudentId={application.studentId}
          initialEmployerId={application.vacancy?.employer?.id}
          initialVacancyId={application.vacancyId}
          initialPosition={application.vacancy?.title}
          onSuccess={() => {
            setNotice("Data penempatan berhasil dicatat.");
            setShowPlacementModal(false);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
