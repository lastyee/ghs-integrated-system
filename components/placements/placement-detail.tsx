"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  Edit2,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plane,
  RotateCcw,
  User,
  XCircle,
} from "lucide-react";
import { PlacementStatusBadge } from "./placements-page";

export type PlacementDetailData = {
  id: string;
  applicationId: string | null;
  studentId: string;
  employerId: string;
  vacancyId: string | null;
  position: string;
  startDate: string | null;
  status: "PREPARATION" | "READY" | "DEPARTED" | "PLACED" | "CANCELLED";
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
  employer: {
    id: string;
    name: string;
    companyInfo: string | null;
    address: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  vacancy: {
    id: string;
    title: string;
    description: string;
    requirements: string;
    status: string;
    employerId: string;
  } | null;
  application: {
    id: string;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type PlacementDetailProps = {
  placementId: string;
  userRole?: string;
  userId?: string;
};

export function PlacementDetail({
  placementId,
  userRole,
}: PlacementDetailProps) {
  const [placement, setPlacement] = useState<PlacementDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Operational Edit State
  const [editingOps, setEditingOps] = useState(false);
  const [editPosition, setEditPosition] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingOps, setSavingOps] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);

  // Transition Confirmation Modal State
  const [transitionTarget, setTransitionTarget] = useState<
    "READY" | "DEPARTED" | "PLACED" | "CANCELLED" | null
  >(null);
  const [transitionNotes, setTransitionNotes] = useState("");
  const [submittingTransition, setSubmittingTransition] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

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

  const isTerminal =
    placement?.status === "PLACED" || placement?.status === "CANCELLED";
  const canMutate = isStaff && !isTerminal;

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (isForbiddenRole) return;

    let isMounted = true;
    async function fetchPlacement() {
      try {
        const res = await fetch(`/api/placements/${placementId}`);
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
          setError("Gagal memuat rincian penempatan dari server.");
          return;
        }

        const json = await res.json();
        const data: PlacementDetailData = json.data;
        if (isMounted) {
          setPlacement(data);
          setEditPosition(data.position || "");
          if (data.startDate) {
            const d = new Date(data.startDate);
            const pad = (n: number) => String(n).padStart(2, "0");
            const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
              d.getDate()
            )}`;
            setEditStartDate(ymd);
          } else {
            setEditStartDate("");
          }
          setEditNotes(data.notes || "");
        }
      } catch {
        if (isMounted)
          setError("Terjadi kesalahan jaringan saat memuat data penempatan.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPlacement();

    return () => {
      isMounted = false;
    };
  }, [placementId, isForbiddenRole, refreshTrigger]);

  // Operational Edit Submission
  async function handleSaveOperational(e: React.FormEvent) {
    e.preventDefault();
    setOpsError(null);

    if (!editPosition.trim()) {
      setOpsError("Posisi / jabatan kerja wajib diisi.");
      return;
    }

    try {
      setSavingOps(true);
      const res = await fetch(`/api/placements/${placementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position: editPosition.trim(),
          startDate: editStartDate ? new Date(editStartDate).toISOString() : null,
          notes: editNotes.trim() || null,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        setOpsError(resData.message || "Gagal memperbarui data penempatan.");
        return;
      }

      setPlacement(resData.data);
      setEditingOps(false);
    } catch {
      setOpsError("Terjadi kesalahan jaringan saat memperbarui data penempatan.");
    } finally {
      setSavingOps(false);
    }
  }

  // Status Transition Submission
  async function handleConfirmTransition(e: React.FormEvent) {
    e.preventDefault();
    if (!transitionTarget) return;

    setTransitionError(null);
    try {
      setSubmittingTransition(true);
      const res = await fetch(`/api/placements/${placementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: transitionTarget,
          notes: transitionNotes.trim() || undefined,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        setTransitionError(
          resData.message || "Gagal memperbarui status penempatan."
        );
        return;
      }

      setPlacement(resData.data);
      setTransitionTarget(null);
      setTransitionNotes("");
    } catch {
      setTransitionError("Terjadi kesalahan jaringan saat memproses transisi.");
    } finally {
      setSubmittingTransition(false);
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
            Anda tidak memiliki izin untuk melihat rincian penempatan kerja ini.
          </p>
          <div className="mt-6">
            <Link
              href="/placements"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 hover:underline"
            >
              <ArrowLeft className="size-4" />
              Kembali ke Daftar Penempatan
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
          Memuat rincian penempatan...
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
          <Building2 className="size-12 text-slate-400 mx-auto" />
          <h2 className="mt-4 text-lg font-bold text-slate-800">
            Penempatan Tidak Ditemukan
          </h2>
          <p className="mt-2 text-xs text-slate-500">
            Data penempatan kerja dengan ID ini tidak terdaftar dalam sistem.
          </p>
          <div className="mt-6">
            <Link
              href="/placements"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              <ArrowLeft className="size-4" />
              Kembali ke Daftar Penempatan
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !placement) {
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
            <RotateCcw className="size-3.5" />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const startDateFormatted = placement.startDate
    ? new Date(placement.startDate).toLocaleDateString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6">
      {/* Header and Back navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/placements"
            data-testid="back-to-placements"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#102f50]">
                Rincian Penempatan Kerja
              </h1>
              <PlacementStatusBadge status={placement.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ID Penempatan: {placement.id}
            </p>
          </div>
        </div>

        {/* Action Buttons for Staff */}
        {canMutate && !editingOps && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="btn-edit-placement"
              onClick={() => {
                setEditPosition(placement.position || "");
                if (placement.startDate) {
                  const d = new Date(placement.startDate);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  setEditStartDate(
                    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
                      d.getDate()
                    )}`
                  );
                } else {
                  setEditStartDate("");
                }
                setEditNotes(placement.notes || "");
                setEditingOps(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <Edit2 className="size-3.5" />
              Ubah Data
            </button>

            {/* PREPARATION Transitions */}
            {placement.status === "PREPARATION" && (
              <>
                <button
                  type="button"
                  data-testid="btn-mark-ready"
                  onClick={() => {
                    setTransitionTarget("READY");
                    setTransitionNotes("");
                    setTransitionError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-[#fff6d9] px-3 py-2 text-xs font-semibold text-[#a57c00] shadow-xs hover:bg-amber-100"
                >
                  <CheckCircle2 className="size-3.5" />
                  Tandai Siap
                </button>
                <button
                  type="button"
                  data-testid="btn-mark-cancelled"
                  onClick={() => {
                    setTransitionTarget("CANCELLED");
                    setTransitionNotes("");
                    setTransitionError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-xs hover:bg-rose-100"
                >
                  <XCircle className="size-3.5" />
                  Batalkan
                </button>
              </>
            )}

            {/* READY Transitions */}
            {placement.status === "READY" && (
              <>
                <button
                  type="button"
                  data-testid="btn-mark-departed"
                  onClick={() => {
                    setTransitionTarget("DEPARTED");
                    setTransitionNotes("");
                    setTransitionError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-700"
                >
                  <Plane className="size-3.5" />
                  Tandai Berangkat
                </button>
                <button
                  type="button"
                  data-testid="btn-mark-cancelled"
                  onClick={() => {
                    setTransitionTarget("CANCELLED");
                    setTransitionNotes("");
                    setTransitionError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-xs hover:bg-rose-100"
                >
                  <XCircle className="size-3.5" />
                  Batalkan
                </button>
              </>
            )}

            {/* DEPARTED Transitions */}
            {placement.status === "DEPARTED" && (
              <button
                type="button"
                data-testid="btn-mark-placed"
                onClick={() => {
                  setTransitionTarget("PLACED");
                  setTransitionNotes("");
                  setTransitionError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              >
                <CheckCircle2 className="size-3.5" />
                Tandai Ditempatkan
              </button>
            )}
          </div>
        )}
      </div>

      {/* Terminal State Alert */}
      {isTerminal && (
        <div
          data-testid="terminal-status-notice"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <Lock className="size-5 shrink-0 text-slate-400" />
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">
              Penempatan ini berstatus terminal (
              {placement.status === "PLACED" ? "Ditempatkan" : "Dibatalkan"}).
            </span>{" "}
            Sesuai aturan bisnis, data penempatan berstatus terminal terkunci dari perubahan operasional maupun transisi status lebih lanjut.
          </div>
        </div>
      )}

      {/* Management Read-Only Banner */}
      {isManagement && (
        <div
          data-testid="management-read-only-banner"
          className="rounded-lg bg-slate-100 p-3 text-center text-xs text-slate-500"
        >
          Role Management memiliki akses pemantauan read-only pada modul Penempatan Kerja.
        </div>
      )}

      {/* Student Notice */}
      {isStudent && (
        <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-3 text-xs text-blue-900">
          Informasi penempatan kerja dan kesiapan keberangkatan resmi Anda di GHS.
        </div>
      )}

      {/* Operational Edit Form (If active) */}
      {editingOps && (
        <div
          data-testid="placement-edit-form"
          className="rounded-xl border border-[#102f50]/20 bg-white p-6 shadow-md"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-[#102f50]">
              Ubah Data Operasional Penempatan
            </h2>
            <button
              type="button"
              onClick={() => setEditingOps(false)}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="edit-position"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Posisi / Jabatan Kerja <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="edit-position"
                  data-testid="edit-position-input"
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  placeholder="Contoh: Commis Chef, Front Office Officer"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="edit-start-date"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Tanggal Mulai Penempatan
                </label>
                <input
                  type="date"
                  id="edit-start-date"
                  data-testid="edit-startdate-input"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-notes"
                className="block text-xs font-semibold text-slate-700"
              >
                Catatan Penempatan
              </label>
              <textarea
                id="edit-notes"
                data-testid="edit-notes-input"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                placeholder="Catatan logistik, kesiapan visa/kontrak, atau instruksi kerja..."
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setEditingOps(false)}
                disabled={savingOps}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="btn-save-edit"
                disabled={savingOps}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1a4470]"
              >
                {savingOps && <Loader2 className="size-3.5 animate-spin" />}
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Details Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Placement Info & Notes */}
        <div className="space-y-6 lg:col-span-2">
          {/* Card: Status & Info Penempatan */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#102f50]">
              <Briefcase className="size-4 text-[#102f50]" />
              Informasi Penempatan
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-400">Posisi Kerja</p>
                <p
                  data-testid="detail-position"
                  className="mt-1 font-semibold text-slate-800 text-sm"
                >
                  {placement.position}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-400">
                  Tanggal Mulai Bekerja
                </p>
                <p
                  data-testid="detail-startdate"
                  className="mt-1 font-semibold text-slate-800 text-sm"
                >
                  {startDateFormatted || "Belum ditentukan"}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs font-medium text-slate-400">Status Penempatan</p>
                <div className="mt-1 flex items-center gap-2">
                  <PlacementStatusBadge status={placement.status} />
                  <span className="text-xs text-slate-500">
                    {placement.status === "PREPARATION" && "Kandidat dalam tahap persiapan berkas dan administrasi"}
                    {placement.status === "READY" && "Kandidat siap untuk diberangkatkan"}
                    {placement.status === "DEPARTED" && "Kandidat dalam proses / telah berangkat ke lokasi kerja"}
                    {placement.status === "PLACED" && "Kandidat telah resmi ditempatkan di perusahaan"}
                    {placement.status === "CANCELLED" && "Penempatan kerja telah dibatalkan"}
                  </span>
                </div>
              </div>
            </div>

            {placement.notes && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <FileText className="size-3.5 text-slate-400" />
                  Catatan Penempatan
                </p>
                <p
                  data-testid="detail-notes"
                  className="mt-1.5 text-xs text-slate-600 whitespace-pre-line"
                >
                  {placement.notes}
                </p>
              </div>
            )}
          </div>

          {/* Card: Lowongan & Lamaran Terkait */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#102f50]">
              <FileText className="size-4 text-[#102f50]" />
              Konteks Lamaran & Lowongan
            </h2>

            <div className="mt-3 space-y-3 text-xs">
              {placement.vacancy ? (
                <div>
                  <span className="text-slate-400">Lowongan Terkait</span>
                  <p className="font-semibold text-slate-800 text-sm mt-0.5">
                    {placement.vacancy.title}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Status Lowongan: {placement.vacancy.status}
                  </p>
                </div>
              ) : (
                <div>
                  <span className="text-slate-400">Lowongan</span>
                  <p className="font-medium text-slate-500 mt-0.5">
                    Penempatan langsung (tidak terikat lowongan spesifik)
                  </p>
                </div>
              )}

              {placement.application ? (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400">Status Lamaran:</span>
                    <span className="ml-2 font-semibold text-slate-700">
                      {placement.application.status}
                    </span>
                  </div>
                  <Link
                    href={`/applications/${placement.applicationId}`}
                    data-testid="link-to-application"
                    className="inline-flex items-center gap-1 font-semibold text-[#102f50] hover:underline"
                  >
                    <span>Buka Rincian Lamaran</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-100 text-slate-400">
                  Tidak terhubung dengan lamaran formal tertentu
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Student & Employer Context */}
        <div className="space-y-6">
          {/* Card: Data Kandidat / Siswa */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#102f50]">
              <User className="size-4 text-[#102f50]" />
              Data Kandidat
            </h2>

            <div className="mt-3 space-y-2 text-xs">
              <div>
                <span className="text-slate-400">Nama Lengkap</span>
                <p
                  data-testid="student-name"
                  className="font-semibold text-slate-800 text-sm"
                >
                  {placement.student?.name}
                </p>
              </div>
              <div>
                <span className="text-slate-400">NIM</span>
                <p data-testid="student-nim" className="font-mono text-slate-700">
                  {placement.student?.nim}
                </p>
              </div>
              {placement.student?.phone && (
                <div>
                  <span className="text-slate-400">Nomor Telepon</span>
                  <p className="flex items-center gap-1.5 text-slate-700">
                    <Phone className="size-3 text-slate-400" />
                    {placement.student.phone}
                  </p>
                </div>
              )}
              {placement.student?.address && (
                <div>
                  <span className="text-slate-400">Alamat</span>
                  <p className="flex items-start gap-1.5 text-slate-700 mt-0.5">
                    <MapPin className="size-3 text-slate-400 shrink-0 mt-0.5" />
                    {placement.student.address}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card: Perusahaan Mitra */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#102f50]">
              <Building2 className="size-4 text-[#102f50]" />
              Perusahaan Mitra
            </h2>

            <div className="mt-3 space-y-2 text-xs">
              <div>
                <span className="text-slate-400">Nama Perusahaan</span>
                <p
                  data-testid="employer-name"
                  className="font-semibold text-[#102f50] text-sm"
                >
                  {placement.employer?.name}
                </p>
              </div>
              {placement.employer?.contactName && (
                <div>
                  <span className="text-slate-400">Kontak Person</span>
                  <p className="font-medium text-slate-800">
                    {placement.employer.contactName}
                  </p>
                </div>
              )}
              {placement.employer?.contactEmail && (
                <div>
                  <span className="text-slate-400">Email Kontak</span>
                  <p className="flex items-center gap-1.5 text-slate-700">
                    <Mail className="size-3 text-slate-400" />
                    {placement.employer.contactEmail}
                  </p>
                </div>
              )}
              {placement.employer?.contactPhone && (
                <div>
                  <span className="text-slate-400">Telepon Perusahaan</span>
                  <p className="flex items-center gap-1.5 text-slate-700">
                    <Phone className="size-3 text-slate-400" />
                    {placement.employer.contactPhone}
                  </p>
                </div>
              )}
              {placement.employer?.address && (
                <div>
                  <span className="text-slate-400">Alamat Perusahaan</span>
                  <p className="flex items-start gap-1.5 text-slate-700 mt-0.5">
                    <MapPin className="size-3 text-slate-400 shrink-0 mt-0.5" />
                    {placement.employer.address}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status Transition Confirmation Modal */}
      {transitionTarget && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="transition-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-bold text-[#102f50]">
              Konfirmasi Perubahan Status Penempatan
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {transitionTarget === "READY" &&
                "Status akan diubah menjadi Siap (READY). Pastikan berkas dokumen kerja kandidat telah lengkap."}
              {transitionTarget === "DEPARTED" &&
                "Status akan diubah menjadi Berangkat (DEPARTED). Kandidat akan tercatat dalam perjalanan menuju lokasi kerja."}
              {transitionTarget === "PLACED" &&
                "Status akan diubah menjadi Ditempatkan (PLACED). Ini adalah status akhir (terminal)."}
              {transitionTarget === "CANCELLED" &&
                "Penempatan kerja akan Dibatalkan (CANCELLED). Ini adalah status akhir (terminal) yang tidak dapat diubah kembali."}
            </p>

            {transitionError && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                {transitionError}
              </div>
            )}

            <form onSubmit={handleConfirmTransition} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="transition-notes"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Catatan Transisi (Opsional)
                </label>
                <textarea
                  id="transition-notes"
                  data-testid="transition-notes-input"
                  value={transitionNotes}
                  onChange={(e) => setTransitionNotes(e.target.value)}
                  rows={3}
                  placeholder="Keterangan pendukung transisi ini..."
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setTransitionTarget(null);
                    setTransitionNotes("");
                  }}
                  disabled={submittingTransition}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  data-testid="btn-confirm-transition"
                  disabled={submittingTransition}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-xs ${
                    transitionTarget === "CANCELLED"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-[#102f50] hover:bg-[#1a4470]"
                  }`}
                >
                  {submittingTransition && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  Konfirmasi Ubah Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
