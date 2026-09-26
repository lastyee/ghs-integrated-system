"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPin,
  FileText,
  User,
  Briefcase,
  ExternalLink,
  Edit2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  AlertCircle,
  MessageSquare,
  Lock,
} from "lucide-react";
import { InterviewStatusBadge } from "./interviews-page";

export type InterviewDetailData = {
  id: string;
  applicationId: string;
  scheduledAt: string;
  method: string | null;
  location: string | null;
  status: "PENDING" | "RESCHEDULED" | "PASSED" | "FAILED";
  notes: string | null;
  feedback?: string | null;
  createdAt: string;
  updatedAt: string;
  application: {
    id: string;
    status: string;
    notes: string | null;
    studentId: string;
    vacancyId: string;
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
      employerId: string;
      employer: {
        id: string;
        name: string;
        companyInfo: string | null;
        address: string | null;
      };
    };
  };
};

type InterviewDetailProps = {
  interviewId: string;
  userRole?: string;
  userId?: string;
};

export function InterviewDetail({
  interviewId,
  userRole,
}: InterviewDetailProps) {
  const [interview, setInterview] = useState<InterviewDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Operational Edit State
  const [editingOps, setEditingOps] = useState(false);
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [savingOps, setSavingOps] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);

  // Result Evaluation State
  const [showResultModal, setShowResultModal] = useState(false);
  const [targetResult, setTargetResult] = useState<"PASSED" | "FAILED">("PASSED");
  const [resultFeedback, setResultFeedback] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [savingResult, setSavingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  const isStaff = useMemo(
    () =>
      userRole === "SUPER_ADMIN" ||
      userRole === "ADMIN" ||
      userRole === "PLACEMENT_STAFF",
    [userRole]
  );
  const isManagement = userRole === "MANAGEMENT";
  const isStudent = userRole === "STUDENT";
  const isForbiddenRole =
    userRole === "ACADEMIC_STAFF" || userRole === "INSTRUCTOR";

  // Permission helpers: Management & Student are read-only (!isStaff)
  const isTerminal = interview?.status === "PASSED" || interview?.status === "FAILED";
  const canEvaluate = isStaff && !isTerminal;

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (isForbiddenRole) return;

    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        setUnauthorized(false);

        const res = await fetch(`/api/interviews/${interviewId}`);
        if (!isMounted) return;

        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          return;
        }
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          setError("Gagal memuat rincian wawancara dari server.");
          return;
        }

        const data: InterviewDetailData = await res.json();
        if (isMounted) {
          setInterview(data);

          if (data.scheduledAt) {
            const d = new Date(data.scheduledAt);
            const pad = (n: number) => String(n).padStart(2, "0");
            const formattedLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
              d.getDate()
            )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            setEditScheduledAt(formattedLocal);
          }
          setEditMethod(data.method || "");
          setEditLocation(data.location || "");
          setEditNotes(data.notes || "");
        }
      } catch {
        if (isMounted) setError("Terjadi kesalahan jaringan saat memuat data wawancara.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [interviewId, isForbiddenRole, refreshTrigger]);

  // Operational Update Submit
  async function handleSaveOperational(e: React.FormEvent) {
    e.preventDefault();
    setOpsError(null);

    if (!editScheduledAt) {
      setOpsError("Jadwal waktu wajib diisi.");
      return;
    }

    try {
      setSavingOps(true);
      const isoDate = new Date(editScheduledAt).toISOString();

      const payload: Record<string, unknown> = {
        scheduledAt: isoDate,
        method: editMethod.trim() || null,
        location: editLocation.trim() || null,
        notes: editNotes.trim() || null,
      };

      if (isRescheduling) {
        payload.status = "RESCHEDULED";
      }

      const res = await fetch(`/api/interviews/${interviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        setOpsError(resData.message || "Gagal memperbarui data wawancara.");
        return;
      }

      setInterview(resData);
      setEditingOps(false);
      setIsRescheduling(false);
    } catch {
      setOpsError("Terjadi kesalahan jaringan saat memperbarui data.");
    } finally {
      setSavingOps(false);
    }
  }

  // Result Evaluation Submit
  async function handleSaveResult(e: React.FormEvent) {
    e.preventDefault();
    setResultError(null);

    try {
      setSavingResult(true);
      const res = await fetch(`/api/interviews/${interviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetResult,
          feedback: resultFeedback.trim() || null,
          notes: resultNotes.trim() || undefined,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        setResultError(resData.message || "Gagal mencatat hasil wawancara.");
        return;
      }

      setInterview(resData);
      setShowResultModal(false);
    } catch {
      setResultError("Terjadi kesalahan jaringan saat mencatat hasil.");
    } finally {
      setSavingResult(false);
    }
  }

  if (isForbiddenRole || unauthorized) {
    return (
      <div
        data-testid="unauthorized-state"
        className="mx-auto max-w-4xl p-6 sm:p-12 text-center"
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 shadow-xs">
          <AlertCircle className="mx-auto size-12 text-rose-500" />
          <h2 className="mt-4 text-lg font-bold text-rose-900">
            Akses Ditolak
          </h2>
          <p className="mt-2 text-sm text-rose-700">
            Anda tidak memiliki izin untuk melihat rincian wawancara ini.
          </p>
          <div className="mt-6">
            <Link
              href="/interviews"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 hover:underline"
            >
              <ArrowLeft className="size-4" />
              Kembali ke Daftar Wawancara
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        data-testid="loading-state"
        className="mx-auto max-w-5xl p-8 flex min-h-80 flex-col items-center justify-center text-center"
      >
        <Loader2 className="size-8 animate-spin text-[#102f50]" />
        <p className="mt-3 text-xs font-medium text-slate-500">
          Memuat rincian wawancara...
        </p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div
        data-testid="not-found-state"
        className="mx-auto max-w-3xl p-6 sm:p-12 text-center"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xs">
          <CalendarDays className="size-12 text-slate-400 mx-auto" />
          <h2 className="mt-4 text-lg font-bold text-slate-800">
            Wawancara Tidak Ditemukan
          </h2>
          <p className="mt-2 text-xs text-slate-500">
            Data wawancara dengan ID ini tidak terdaftar dalam sistem.
          </p>
          <div className="mt-6">
            <Link
              href="/interviews"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              <ArrowLeft className="size-4" />
              Kembali ke Daftar Wawancara
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div
        data-testid="error-state"
        className="mx-auto max-w-3xl p-6 text-center"
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle className="size-8 text-rose-500 mx-auto" />
          <p className="mt-2 text-sm font-semibold text-rose-800">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setRefreshTrigger((prev) => prev + 1);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const scheduledDate = new Date(interview.scheduledAt);
  const formattedDate = scheduledDate.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = scheduledDate.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6">
      {/* Header and Back navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/interviews"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#102f50]">
                Rincian Wawancara
              </h1>
              <InterviewStatusBadge status={interview.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ID Wawancara: {interview.id}
            </p>
          </div>
        </div>

        {/* Action Buttons for Staff */}
        {canEvaluate && !editingOps && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="edit-interview-button"
              onClick={() => {
                setIsRescheduling(false);
                setEditingOps(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <Edit2 className="size-3.5" />
              Ubah Data
            </button>
            <button
              type="button"
              data-testid="btn-reschedule"
              onClick={() => {
                setIsRescheduling(true);
                setEditingOps(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 shadow-xs hover:bg-amber-100"
            >
              <RotateCcw className="size-3.5" />
              Jadwalkan Ulang (Reschedule)
            </button>
            <button
              type="button"
              data-testid="btn-result-passed"
              onClick={() => {
                setTargetResult("PASSED");
                setResultFeedback("");
                setResultNotes("");
                setShowResultModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
            >
              <CheckCircle2 className="size-3.5" />
              Luluskan (Passed)
            </button>
            <button
              type="button"
              data-testid="btn-result-failed"
              onClick={() => {
                setTargetResult("FAILED");
                setResultFeedback("");
                setResultNotes("");
                setShowResultModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700"
            >
              <XCircle className="size-3.5" />
              Tidak Lolos (Failed)
            </button>
          </div>
        )}
      </div>

      {/* Terminal State Alert */}
      {isTerminal && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Lock className="size-5 shrink-0 text-slate-400" />
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">
              Wawancara telah selesai dan berada pada status terminal (
              {interview.status === "PASSED" ? "Lulus" : "Tidak Lulus"}
              ).
            </span>{" "}
            Sesuai aturan bisnis, data wawancara yang berstatus terminal terkunci dari perubahan jadwal dan hasil.
          </div>
        </div>
      )}

      {/* Management Read-Only Banner */}
      {isManagement && (
        <div className="rounded-lg bg-slate-100 p-3 text-center text-xs text-slate-500">
          Role Management memiliki akses pemantauan read-only pada data wawancara.
        </div>
      )}

      {/* Operational Edit Form (If opened) */}
      {editingOps && (
        <div className="rounded-xl border border-[#102f50]/20 bg-white p-6 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-[#102f50]">
              {isRescheduling
                ? "Jadwalkan Ulang (Reschedule) Wawancara"
                : "Ubah Data Wawancara"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setEditingOps(false);
                setIsRescheduling(false);
              }}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Tutup
            </button>
          </div>

          {opsError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
              {opsError}
            </div>
          )}

          <form onSubmit={handleSaveOperational} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="edit-scheduled-at"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Jadwal Waktu <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="edit-scheduled-at"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="edit-method"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Metode Wawancara
                </label>
                <input
                  type="text"
                  id="edit-method"
                  value={editMethod}
                  onChange={(e) => setEditMethod(e.target.value)}
                  placeholder="Contoh: Online, On-site"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-location"
                className="block text-xs font-semibold text-slate-700"
              >
                Lokasi / Tautan Meeting
              </label>
              <input
                type="text"
                id="edit-location"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="Google Meet, Zoom, Ruang Rapat..."
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="edit-notes"
                className="block text-xs font-semibold text-slate-700"
              >
                Catatan Pelaksanaan
              </label>
              <textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                placeholder="Instruksi tambahan untuk peserta..."
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setEditingOps(false);
                  setIsRescheduling(false);
                }}
                disabled={savingOps}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingOps}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1a4470]"
              >
                {savingOps && <Loader2 className="size-3.5 animate-spin" />}
                {isRescheduling ? "Simpan Jadwal Ulang" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Details Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Schedule & Logistics */}
        <div className="space-y-6 lg:col-span-2">
          {/* Card: Waktu & Pelaksanaan */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#102f50]">
              <Clock3 className="size-4 text-[#102f50]" />
              Informasi Pelaksanaan
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-400">Tanggal Wawancara</p>
                <p className="mt-1 font-semibold text-slate-800 text-sm">
                  {formattedDate}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-400">Waktu / Jam</p>
                <p className="mt-1 font-semibold text-slate-800 text-sm">
                  Pukul {formattedTime} WIB
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-400">Metode</p>
                <p className="mt-1 font-semibold text-slate-800 text-sm">
                  {interview.method || "Tidak ditentukan"}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-400">Status Wawancara</p>
                <div className="mt-1">
                  <InterviewStatusBadge status={interview.status} />
                </div>
              </div>
            </div>

            {interview.location && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <MapPin className="size-3.5 text-slate-400" />
                  Lokasi / Tautan Meeting
                </p>
                <p className="mt-1 text-xs text-slate-800 break-all font-mono">
                  {interview.location}
                </p>
              </div>
            )}

            {interview.notes && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <FileText className="size-3.5 text-slate-400" />
                  Catatan Pelaksanaan
                </p>
                <p className="mt-1.5 text-xs text-slate-600 whitespace-pre-line">
                  {interview.notes}
                </p>
              </div>
            )}
          </div>

          {/* Feedback Card (Staff & Management Only - Never rendered for student if undefined) */}
          {!isStudent && interview.feedback !== undefined && interview.feedback !== null && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-xs">
              <h2 className="flex items-center gap-2 text-sm font-bold text-indigo-950">
                <MessageSquare className="size-4 text-indigo-700" />
                Catatan Evaluasi / Feedback Pewawancara (Internal)
              </h2>
              <p className="mt-2 text-xs text-indigo-900 whitespace-pre-line bg-white/80 rounded-lg p-3 border border-indigo-100">
                {interview.feedback}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Candidate & Vacancy Context */}
        <div className="space-y-6">
          {/* Card: Kandidat */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#102f50]">
              <User className="size-4 text-[#102f50]" />
              Data Kandidat
            </h2>

            <div className="mt-3 space-y-2 text-xs">
              <div>
                <span className="text-slate-400">Nama Lengkap</span>
                <p className="font-semibold text-slate-800 text-sm">
                  {interview.application?.student?.name}
                </p>
              </div>
              <div>
                <span className="text-slate-400">NIM</span>
                <p className="font-mono text-slate-700">
                  {interview.application?.student?.nim}
                </p>
              </div>
              {interview.application?.student?.phone && (
                <div>
                  <span className="text-slate-400">Nomor Telepon</span>
                  <p className="text-slate-700">
                    {interview.application.student.phone}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card: Lowongan & Perusahaan */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#102f50]">
              <Briefcase className="size-4 text-[#102f50]" />
              Lowongan & Perusahaan
            </h2>

            <div className="mt-3 space-y-3 text-xs">
              <div>
                <span className="text-slate-400">Posisi Lowongan</span>
                <p className="font-semibold text-[#102f50] text-sm">
                  {interview.application?.vacancy?.title}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Perusahaan Mitra</span>
                <p className="font-medium text-slate-800">
                  {interview.application?.vacancy?.employer?.name}
                </p>
                {interview.application?.vacancy?.employer?.address && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {interview.application.vacancy.employer.address}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">Lamaran Terkait:</span>
                <Link
                  href={`/applications/${interview.applicationId}`}
                  className="inline-flex items-center gap-1 font-semibold text-[#102f50] hover:underline"
                >
                  <span>Buka Lamaran</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Result Evaluation Modal */}
      {showResultModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-bold text-[#102f50]">
              Tetapkan Hasil Wawancara: {targetResult === "PASSED" ? "Lulus" : "Tidak Lolos"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {targetResult === "PASSED"
                ? "Kandidat akan dinyatakan lulus (PASSED) pada sesi wawancara ini."
                : "Kandidat akan dinyatakan tidak lolos (FAILED) pada sesi wawancara ini."}
            </p>

            {resultError && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                {resultError}
              </div>
            )}

            <form onSubmit={handleSaveResult} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="result-feedback"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Catatan Evaluasi / Feedback (Internal)
                </label>
                <textarea
                  id="result-feedback"
                  value={resultFeedback}
                  onChange={(e) => setResultFeedback(e.target.value)}
                  rows={4}
                  placeholder="Catatan evaluasi performa kandidat, aspek kekuatan atau kelemahan..."
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Catatan evaluasi ini bersifat internal dan tidak dibagikan kepada peserta.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowResultModal(false)}
                  disabled={savingResult}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingResult}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white ${
                    targetResult === "PASSED"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {savingResult && <Loader2 className="size-3.5 animate-spin" />}
                  Simpan Hasil Wawancara
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
