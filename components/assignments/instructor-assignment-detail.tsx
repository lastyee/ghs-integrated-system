"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileText,
  Loader2,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/status-state";
import {
  AssignmentFormModal,
} from "@/components/assignments/assignment-form-modal";
import {
  GradingModal,
  StudentSubmissionForGrading,
} from "@/components/assignments/grading-modal";

export interface InstructorAssignmentDetailData {
  id: string;
  title: string;
  description: string | null;
  classId: string;
  subjectId: string;
  scheduleId?: string | null;
  instructorId?: string | null;
  dueDate: string;
  allowLateSubmission: boolean;
  maxScore: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentType?: string | null;
  attachmentUrl?: string | null;
  submissionCount?: number;
  createdAt: string;
  updatedAt: string;
  class: {
    id: string;
    name: string;
    batchId: string;
    batch: {
      id: string;
      name: string;
      startDate: string;
      endDate: string | null;
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
  };
  schedule?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    topic?: string | null;
    room?: string | null;
  } | null;
}

export interface StudentRecapItem {
  student: {
    id: string;
    nim: string;
    name: string;
    user?: {
      email?: string;
    } | null;
  };
  isSubmitted: boolean;
  submission: {
    id: string;
    status: "SUBMITTED" | "LATE" | "GRADED";
    content?: string | null;
    fileName: string;
    fileSize: number;
    fileType?: string | null;
    submittedAt: string;
    attemptCount: number;
    score?: number | null;
    feedback?: string | null;
    gradedAt?: string | null;
    gradedBy?: {
      id: string;
      name: string;
    } | null;
  } | null;
}

interface RecapStats {
  totalEnrolled: number;
  submitted: number;
  unsubmitted: number;
  late: number;
  graded: number;
}

interface InstructorAssignmentDetailProps {
  assignmentId: string;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatIndoDateTime(isoString?: string | null): string {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function getDueBadge(dueDateIso: string, status: string): {
  label: string;
  tone: "red" | "amber" | "slate" | "green";
} {
  if (status === "CLOSED") {
    return { label: "Ditutup", tone: "slate" };
  }
  try {
    const now = new Date().getTime();
    const due = new Date(dueDateIso).getTime();
    const diffHours = (due - now) / (1000 * 60 * 60);

    if (diffHours < 0) {
      return { label: "Lewat Tenggat", tone: "red" };
    }
    if (diffHours <= 24) {
      return { label: "Segera Berakhir (<24 Jam)", tone: "amber" };
    }
    return { label: "Aktif", tone: "green" };
  } catch {
    return { label: "Aktif", tone: "green" };
  }
}

export function InstructorAssignmentDetail({
  assignmentId,
}: InstructorAssignmentDetailProps) {
  // Main assignment state
  const [assignment, setAssignment] = useState<InstructorAssignmentDetailData | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  // Recap & submissions state
  const [recapItems, setRecapItems] = useState<StudentRecapItem[]>([]);
  const [recapStats, setRecapStats] = useState<RecapStats>({
    totalEnrolled: 0,
    submitted: 0,
    unsubmitted: 0,
    late: 0,
    graded: 0,
  });
  const [loadingRecap, setLoadingRecap] = useState(true);
  const [recapError, setRecapError] = useState<string | null>(null);

  // Filters for student recap
  const [searchStudent, setSearchStudent] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "NOT_SUBMITTED" | "SUBMITTED" | "LATE" | "GRADED"
  >("ALL");

  // Modal states
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [gradingTarget, setGradingTarget] = useState<StudentSubmissionForGrading | null>(null);

  // Single file downloading tracking for table rows
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch Assignment Details
  const fetchAssignmentDetail = useCallback(async () => {
    setLoadingAssignment(true);
    setAssignmentError(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Tugas tidak ditemukan.");
        }
        if (res.status === 403) {
          throw new Error("Anda tidak memiliki wewenang untuk melihat penugasan kelas ini.");
        }
        throw new Error("Gagal memuat detail tugas.");
      }
      const json = await res.json();
      setAssignment(json.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setAssignmentError(msg);
    } finally {
      setLoadingAssignment(false);
    }
  }, [assignmentId]);

  // Fetch Class Recap & Submissions
  const fetchRecap = useCallback(async () => {
    setLoadingRecap(true);
    setRecapError(null);
    try {
      const params = new URLSearchParams();
      if (searchStudent.trim()) {
        params.set("search", searchStudent.trim());
      }
      if (statusFilter && statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      const res = await fetch(`/api/assignments/${assignmentId}/submissions?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Anda tidak memiliki akses ke rekap pengumpulan kelas ini.");
        }
        throw new Error("Gagal memuat rekap pengumpulan mahasiswa.");
      }
      const json = await res.json();
      setRecapItems(json.data || []);
      if (json.stats) {
        setRecapStats(json.stats);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat rekap.";
      setRecapError(msg);
    } finally {
      setLoadingRecap(false);
    }
  }, [assignmentId, searchStudent, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAssignmentDetail();
  }, [fetchAssignmentDetail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecap();
  }, [fetchRecap]);

  // Handle student file download from table
  const handleDownloadStudentFile = async (submissionId: string, fileName: string) => {
    setDownloadingId(submissionId);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/submissions/${submissionId}`);
      if (!res.ok) {
        throw new Error("Gagal mengunduh berkas.");
      }
      const json = await res.json();
      const downloadUrl = json.data?.downloadUrl;
      if (!downloadUrl) {
        throw new Error("Tautan berkas tidak valid.");
      }

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error downloading student file:", err);
      alert("Gagal mengunduh berkas pengumpulan mahasiswa.");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loadingAssignment) {
    return (
      <div className="space-y-6">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" />
          <span>Kembali ke Daftar Tugas</span>
        </Link>
        <LoadingState title="Memuat detail tugas" description="Mohon tunggu sebentar..." />
      </div>
    );
  }

  if (assignmentError || !assignment) {
    return (
      <div className="space-y-6">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" />
          <span>Kembali ke Daftar Tugas</span>
        </Link>
        <ErrorState
          title="Data tugas tidak dapat diakses"
          description={assignmentError || "Tugas tidak ditemukan atau akses ditolak."}
        />
      </div>
    );
  }

  const dueInfo = getDueBadge(assignment.dueDate, assignment.status);

  return (
    <div className="space-y-6">
      {/* Top Navigation Breadcrumb */}
      <div>
        <Link
          href="/assignments"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 transition hover:text-[#123b63]"
        >
          <ArrowLeft className="size-4" />
          <span>Kembali ke Daftar Tugas</span>
        </Link>
      </div>

      {/* Assignment Overview Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-bold text-[#123b63]">
                {assignment.subject.code}
              </span>
              <span className="font-semibold text-slate-700">{assignment.subject.name}</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-600">
                {assignment.class.name} ({assignment.class.batch.name})
              </span>
            </div>

            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {assignment.title}
            </h1>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {/* Publication Status */}
              {assignment.status === "PUBLISHED" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="size-3" />
                  Diterbitkan (Aktif)
                </span>
              ) : assignment.status === "DRAFT" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
                  <Clock className="size-3" />
                  Draf
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 border border-slate-200">
                  <XCircle className="size-3" />
                  Ditutup
                </span>
              )}

              {/* Due Date & Proximity Badge */}
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                <Calendar className="size-3 text-slate-500" />
                <span>Tenggat: {formatIndoDateTime(assignment.dueDate)}</span>
              </div>

              {dueInfo.tone === "red" ? (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-800">
                  {dueInfo.label}
                </span>
              ) : dueInfo.tone === "amber" ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                  {dueInfo.label}
                </span>
              ) : null}

              {/* Late Submission Flag */}
              {assignment.allowLateSubmission ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 border border-blue-200">
                  Pengumpulan Terlambat Diizinkan
                </span>
              ) : (
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200">
                  Tidak Menerima Keterlambatan
                </span>
              )}

              {/* Max Score */}
              <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 border border-purple-200">
                Maksimal: {assignment.maxScore} Poin
              </span>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsEditFormOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <Edit3 className="size-4" />
              <span>Edit Tugas</span>
            </button>
          </div>
        </div>

        {/* Instructions / Description */}
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-xs">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Petunjuk & Instruksi Pengerjaan
          </span>
          {assignment.description ? (
            <p className="whitespace-pre-line text-slate-800 leading-relaxed">
              {assignment.description}
            </p>
          ) : (
            <p className="italic text-slate-400">Tidak ada instruksi tertulis untuk tugas ini.</p>
          )}
        </div>

        {/* Task Attachment Section (if uploaded by instructor) */}
        {assignment.attachmentName && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-[#123b63]">
                <FileText className="size-5" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{assignment.attachmentName}</p>
                <p className="text-[11px] text-slate-500">
                  Materi Lampiran Instruksi ({formatBytes(assignment.attachmentSize)})
                </p>
              </div>
            </div>
            {assignment.attachmentUrl ? (
              <a
                href={assignment.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={assignment.attachmentName}
                className="flex items-center gap-1.5 rounded-lg bg-[#123b63] px-3.5 py-1.5 font-semibold text-white shadow-xs hover:bg-[#0e2f50]"
              >
                <Download className="size-3.5" />
                <span>Unduh Berkas Instruksi</span>
              </a>
            ) : (
              <span className="text-[11px] italic text-slate-400">Tautan berkas belum tersedia</span>
            )}
          </div>
        )}
      </div>

      {/* Class Recap Stats Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Rekap Pengumpulan & Penilaian Mahasiswa
          </h2>
          <p className="text-xs text-slate-500">
            Seluruh mahasiswa yang terdaftar aktif pada kelas ini tercantum dalam rekap berikut.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard
            label="Total Terdaftar"
            value={recapStats.totalEnrolled.toString()}
            icon={Users}
            tone="navy"
            description="Mahasiswa aktif di kelas"
          />
          <StatCard
            label="Sudah Mengumpulkan"
            value={recapStats.submitted.toString()}
            icon={CheckCircle2}
            tone="blue"
            description="Tepat waktu & terlambat"
          />
          <StatCard
            label="Belum Mengumpulkan"
            value={recapStats.unsubmitted.toString()}
            icon={XCircle}
            tone="red"
            description="Belum ada berkas tugas"
          />
          <StatCard
            label="Terlambat"
            value={recapStats.late.toString()}
            icon={Clock}
            tone="yellow"
            description="Kirim setelah tenggat"
          />
          <StatCard
            label="Sudah Dinilai"
            value={recapStats.graded.toString()}
            icon={Award}
            tone="navy"
            description="Nilai tersimpan"
          />
        </div>
      </div>

      {/* Student List & Filters */}
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Cari mahasiswa berdasarkan Nama, NIM, atau Email..."
              className="w-full rounded-xl border border-slate-200 pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "ALL", label: "Semua" },
              { id: "NOT_SUBMITTED", label: "Belum Mengumpulkan" },
              { id: "SUBMITTED", label: "Sudah Mengumpulkan" },
              { id: "LATE", label: "Terlambat" },
              { id: "GRADED", label: "Sudah Dinilai" },
            ].map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-[#123b63] text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recap Table */}
        {loadingRecap ? (
          <LoadingState title="Memuat rekap mahasiswa" description="Mengambil data pengumpulan kelas..." />
        ) : recapError ? (
          <ErrorState title="Gagal memuat rekap" description={recapError} />
        ) : recapItems.length === 0 ? (
          <EmptyState
            title="Tidak ada mahasiswa ditemukan"
            description={
              searchStudent || statusFilter !== "ALL"
                ? "Tidak ada data mahasiswa yang sesuai dengan filter pencarian Anda."
                : "Belum ada mahasiswa yang terdaftar aktif pada batch kelas ini."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">
                      Mahasiswa
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Status Pengumpulan
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Waktu & Percobaan
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Berkas Tugas
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Nilai & Umpan Balik
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Aksi Penilaian
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recapItems.map((item) => {
                    const { student, isSubmitted, submission } = item;

                    return (
                      <tr key={student.id} className="transition hover:bg-slate-50/70">
                        {/* Student Name & NIM & Email */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{student.name}</div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                <span>{student.nim}</span>
                                {student.user?.email && (
                                  <>
                                    <span>•</span>
                                    <span>{student.user.email}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Submission Status Badge */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {!isSubmitted || !submission ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200">
                              <XCircle className="size-3 text-slate-400" />
                              Belum Mengumpulkan
                            </span>
                          ) : submission.status === "GRADED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 className="size-3" />
                              Sudah Dinilai
                            </span>
                          ) : submission.status === "LATE" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                              <Clock className="size-3" />
                              Terlambat
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                              <CheckCircle2 className="size-3" />
                              Sudah Mengumpulkan
                            </span>
                          )}
                        </td>

                        {/* Submission Time & Attempt */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {isSubmitted && submission ? (
                            <div>
                              <div className="font-medium text-slate-900">
                                {formatIndoDateTime(submission.submittedAt)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Percobaan ke-{submission.attemptCount}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* File Name & Download */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {isSubmitted && submission ? (
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-semibold text-slate-900 line-clamp-1 max-w-[160px]">
                                  {submission.fileName}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {formatBytes(submission.fileSize)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadStudentFile(submission.id, submission.fileName)
                                }
                                disabled={downloadingId === submission.id}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-[#123b63] shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                                title="Unduh Berkas Mahasiswa"
                              >
                                {downloadingId === submission.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Download className="size-3" />
                                )}
                                <span>Unduh</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Score & Feedback */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {isSubmitted && submission ? (
                            submission.score !== null && submission.score !== undefined ? (
                              <div>
                                <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 border border-emerald-200">
                                  <span>{submission.score}</span>
                                  <span className="text-[10px] text-emerald-600">/ {assignment.maxScore}</span>
                                </div>
                                {submission.feedback && (
                                  <p className="mt-1 line-clamp-1 max-w-[180px] text-[11px] text-slate-500 italic">
                                    “{submission.feedback}”
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                Belum Dinilai
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          {isSubmitted && submission ? (
                            <button
                              type="button"
                              onClick={() => {
                                setGradingTarget({
                                  student,
                                  submission,
                                });
                              }}
                              className="inline-flex items-center gap-1 rounded-xl bg-[#123b63] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0e2f50]"
                            >
                              <Award className="size-3.5" />
                              <span>
                                {submission.score !== null && submission.score !== undefined
                                  ? "Ubah Nilai"
                                  : "Nilai Tugas"}
                              </span>
                            </button>
                          ) : (
                            <span className="text-[11px] italic text-slate-400">
                              Belum Mengumpulkan
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Assignment Modal */}
      <AssignmentFormModal
        isOpen={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
        onSuccess={() => {
          fetchAssignmentDetail();
          fetchRecap();
        }}
        assignmentToEdit={
          assignment
            ? {
                id: assignment.id,
                title: assignment.title,
                description: assignment.description,
                classId: assignment.classId,
                subjectId: assignment.subjectId,
                scheduleId: assignment.scheduleId,
                dueDate: assignment.dueDate,
                allowLateSubmission: assignment.allowLateSubmission,
                maxScore: assignment.maxScore,
                status: assignment.status,
                attachmentName: assignment.attachmentName,
                attachmentSize: assignment.attachmentSize,
                attachmentType: assignment.attachmentType,
                class: assignment.class,
                subject: assignment.subject,
              }
            : null
        }
      />

      {/* Grading Modal */}
      <GradingModal
        isOpen={Boolean(gradingTarget)}
        onClose={() => setGradingTarget(null)}
        onSuccess={() => {
          fetchRecap();
        }}
        assignmentId={assignmentId}
        assignmentTitle={assignment.title}
        maxScore={assignment.maxScore}
        data={gradingTarget}
      />
    </div>
  );
}
