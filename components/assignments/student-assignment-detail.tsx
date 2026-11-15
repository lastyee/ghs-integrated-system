"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  LoaderCircle,
  Paperclip,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/common/toast-provider";
import { ErrorState, LoadingState } from "@/components/ui/status-state";

export interface StudentSubmissionDetail {
  id: string;
  status: "SUBMITTED" | "LATE" | "RESUBMITTED" | "GRADED";
  content?: string | null;
  fileName: string;
  fileSize: number;
  fileType: string;
  submittedAt: string;
  attemptCount: number;
  score?: number | null;
  feedback?: string | null;
  gradedAt?: string | null;
  downloadUrl?: string | null;
}

export interface AssignmentDetailData {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  allowLateSubmission: boolean;
  maxScore: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentType?: string | null;
  attachmentUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  class: {
    id: string;
    name: string;
    batch: {
      id: string;
      name: string;
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
  };
  schedule?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    topic: string | null;
    room: string | null;
  } | null;
  instructor: {
    id: string;
    name: string;
  };
  mySubmission?: StudentSubmissionDetail | null;
}

const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "jpg", "jpeg", "png"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateString?: string | null): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return dateString;
  }
}

export function StudentAssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState<AssignmentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [downloadingMyFile, setDownloadingMyFile] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch(`/api/assignments/${assignmentId}`, {
          headers: { credentials: "same-origin" },
        });

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Tugas tidak ditemukan atau telah diarsipkan.");
          }
          if (res.status === 403) {
            throw new Error("Anda tidak memiliki akses ke penugasan kelas ini.");
          }
          throw new Error("Gagal memuat detail tugas.");
        }

        const json = await res.json();
        if (!ignore) {
          setData(json.data);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat detail.";
          setError(msg);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [assignmentId]);

  // File validation
  const handleFileChange = (file: File | null) => {
    setFileValidationError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Check size
    if (file.size <= 0) {
      setFileValidationError("Berkas kosong tidak dapat diunggah.");
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileValidationError(
        `Ukuran berkas (${formatBytes(file.size)}) melebihi batas maksimum 10 MB.`
      );
      setSelectedFile(null);
      return;
    }

    // Check extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileValidationError(
        `Format .${ext} tidak didukung. Format yang diizinkan adalah: PDF, DOC, DOCX, PPT, PPTX, JPG, dan PNG.`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  // Submit Handler
  const handleConfirmSubmit = async () => {
    if (!selectedFile || !data) return;
    setShowConfirmModal(false);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (notes.trim()) {
        formData.append("content", notes.trim());
      }

      const res = await fetch(`/api/assignments/${data.id}/submissions`, {
        method: "POST",
        body: formData,
        headers: { credentials: "same-origin" },
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Gagal mengumpulkan tugas.");
      }

      showToast(
        "success",
        data.mySubmission
          ? "Pengumpulan ulang tugas berhasil dikirim!"
          : "Tugas berhasil dikumpulkan!"
      );

      // Immediately update local state with returned submission
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mySubmission: {
            id: result.id,
            status: result.status,
            content: result.content,
            fileName: result.fileName,
            fileSize: result.fileSize,
            fileType: result.fileType,
            submittedAt: result.submittedAt,
            attemptCount: result.attemptCount,
            score: result.score ?? null,
            feedback: result.feedback ?? null,
            gradedAt: result.gradedAt ?? null,
            downloadUrl: result.downloadUrl ?? null,
          },
        };
      });

      // Clear form
      setSelectedFile(null);
      setNotes("");
      setFileValidationError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengunggah.";
      showToast("error", msg);
    } finally {
      setUploading(false);
    }
  };

  // Safe download of student's own file
  const handleDownloadMySubmission = async () => {
    if (!data?.mySubmission) return;

    // If downloadUrl already present in submission state, open it
    if (data.mySubmission.downloadUrl) {
      window.open(data.mySubmission.downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // Otherwise fetch fresh signed URL from backend
    try {
      setDownloadingMyFile(true);
      const res = await fetch(
        `/api/assignments/${data.id}/submissions/${data.mySubmission.id}`,
        { headers: { credentials: "same-origin" } }
      );
      if (!res.ok) {
        throw new Error("Gagal menghasilkan link unduh berkas pengumpulan.");
      }
      const json = await res.json();
      if (json.data?.downloadUrl) {
        window.open(json.data.downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("URL unduh tidak ditemukan pada respon server.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengunduh berkas.";
      showToast("error", msg);
    } finally {
      setDownloadingMyFile(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded-md bg-slate-200" />
        <LoadingState
          title="Memuat detail tugas"
          description="Mengambil instruksi, materi lampiran, dan status pengumpulan..."
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Daftar Tugas
        </Link>
        <ErrorState
          title="Gagal memuat tugas"
          description={error || "Data tugas tidak ditemukan."}
        />
      </div>
    );
  }

  const now = new Date();
  const isPastDue = now > new Date(data.dueDate);
  const mySub = data.mySubmission;
  const isGraded = Boolean(mySub && (mySub.status === "GRADED" || mySub.score !== null));
  const isLateSubmission = isPastDue && data.allowLateSubmission;
  const isSubmissionBlockedByDeadline = isPastDue && !data.allowLateSubmission;

  return (
    <div className="space-y-6">
      {/* Back Link Breadcrumb */}
      <div>
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#123b63] transition-colors"
        >
          <ArrowLeft className="size-4" />
          <span>Kembali ke Daftar Tugas</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              {data.subject.name} ({data.subject.code})
            </span>
            <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#123b63]">
              {data.class.name}
            </span>
            <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
              {data.class.batch.name}
            </span>
          </div>

          {/* Submission Status Pill */}
          {isGraded ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
              <Award className="size-3.5" />
              Telah Dinilai: {mySub?.score} / {data.maxScore}
            </span>
          ) : mySub?.status === "LATE" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20">
              <Clock className="size-3.5" />
              Terkumpul Terlambat (Percobaan {mySub.attemptCount})
            </span>
          ) : mySub ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20">
              <CheckCircle2 className="size-3.5" />
              Sudah Dikumpulkan (Percobaan {mySub.attemptCount})
            </span>
          ) : isPastDue ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-600/20">
              <AlertCircle className="size-3.5" />
              Tenggat Waktu Lewat
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              <Clock className="size-3.5" />
              Belum Mengumpulkan
            </span>
          )}
        </div>

        {/* Title and Instructor */}
        <div className="mt-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
            {data.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <User className="size-4 text-slate-400" />
              <span>Instruktur: {data.instructor.name}</span>
            </div>
            {data.schedule && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Calendar className="size-4 text-slate-400" />
                <span>
                  Sesi: {data.schedule.topic || "Jadwal Perkuliahan"} (
                  {new Date(data.schedule.date).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                  })}
                  )
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-slate-500">
              <Clock className="size-4 text-slate-400" />
              <span>Diterbitkan: {formatDate(data.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Instructions, Attachment, & Student's Current Submission Status (2/3 width) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Instructions Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <BookOpen className="size-5 text-[#123b63]" />
              <h2 className="text-base font-bold text-slate-900">
                Instruksi & Deskripsi Tugas
              </h2>
            </div>

            <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {data.description || "Tidak ada rincian petunjuk khusus dari instruktur."}
            </div>
          </section>

          {/* Instructor Attachment Card (if provided) */}
          {data.attachmentName && data.attachmentUrl && (
            <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 shadow-xs">
              <div className="flex items-center gap-2">
                <Paperclip className="size-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Materi Lampiran dari Instruktur
                </h3>
              </div>

              <div className="mt-3 flex flex-col justify-between gap-3 rounded-lg border border-blue-200/80 bg-white p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
                    <FileText className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {data.attachmentName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(data.attachmentSize)} • {data.attachmentType || "Dokumen"}
                    </p>
                  </div>
                </div>

                <a
                  href={data.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#123b63] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0d2a47]"
                >
                  <Download className="size-3.5" />
                  <span>Unduh Materi</span>
                </a>
              </div>
            </section>
          )}

          {/* Evaluation / Graded Result Card (if graded) */}
          {isGraded && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-xs">
              <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-3">
                <div className="flex items-center gap-2">
                  <Award className="size-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-emerald-950">
                    Hasil Penilaian Instruktur
                  </h3>
                </div>
                <span className="text-xs text-emerald-700">
                  Dinilai pada {formatDate(mySub?.gradedAt)}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Score Showcase */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-white p-4 text-center shadow-xs">
                  <span className="text-xs font-medium text-emerald-800">
                    Nilai Akhir
                  </span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-emerald-700">
                      {mySub?.score}
                    </span>
                    <span className="text-sm font-semibold text-slate-400">
                      / {data.maxScore}
                    </span>
                  </div>
                  <span className="mt-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    LULUS EVALUASI
                  </span>
                </div>

                {/* Feedback Box */}
                <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-white p-4 shadow-xs">
                  <p className="text-xs font-bold text-slate-700">
                    Catatan & Umpan Balik Instruktur:
                  </p>
                  <blockquote className="mt-2 whitespace-pre-line text-xs italic leading-relaxed text-slate-800">
                    {mySub?.feedback || "Tidak ada catatan tambahan dari instruktur."}
                  </blockquote>
                </div>
              </div>
            </section>
          )}

          {/* Current Student Submission Status Card */}
          {mySub && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="size-5 text-[#123b63]" />
                  <h3 className="text-base font-bold text-slate-900">
                    Berkas Pengumpulan Saya
                  </h3>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  Percobaan ke-{mySub.attemptCount}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {/* File details container */}
                <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-white p-2.5 text-[#123b63] shadow-2xs">
                      <FileText className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {mySub.fileName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(mySub.fileSize)} • Dikumpulkan pada{" "}
                        {formatDate(mySub.submittedAt)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadMySubmission}
                    disabled={downloadingMyFile}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-100 focus:outline-hidden disabled:opacity-50"
                  >
                    {downloadingMyFile ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    <span>Unduh Berkas Saya</span>
                  </button>
                </div>

                {/* Student's optional notes */}
                {mySub.content && (
                  <div className="rounded-lg border border-slate-100 bg-white p-3.5">
                    <p className="text-xs font-semibold text-slate-600">
                      Catatan Pengantar yang Anda Kirim:
                    </p>
                    <p className="mt-1 whitespace-pre-line text-xs text-slate-700">
                      {mySub.content}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Constraints & Submission Form (1/3 width) */}
        <div className="space-y-6">
          {/* Constraints Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">Ketentuan Pengumpulan</h3>

            <dl className="mt-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Tenggat Waktu</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {formatDate(data.dueDate)}
                </dd>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Status Waktu</dt>
                <dd className="font-semibold">
                  {isPastDue ? (
                    <span className="text-red-600">Tenggat Terlewati</span>
                  ) : (
                    <span className="text-emerald-700">Masih Terbuka</span>
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Keterlambatan</dt>
                <dd className="font-semibold text-slate-900">
                  {data.allowLateSubmission ? (
                    <span className="text-amber-700">Diizinkan</span>
                  ) : (
                    <span className="text-slate-600">Batas Waktu Mutlak</span>
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Nilai Maksimum</dt>
                <dd className="font-semibold text-slate-900">{data.maxScore} Poin</dd>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Batas Ukuran Berkas</dt>
                <dd className="font-semibold text-slate-900">Maksimal 10 MB</dd>
              </div>

              <div>
                <dt className="text-slate-500">Format yang Diterima</dt>
                <dd className="mt-1 font-mono text-[11px] font-semibold text-slate-800">
                  PDF, DOC, DOCX, PPT, PPTX, JPG, PNG
                </dd>
              </div>
            </dl>
          </section>

          {/* Submission Form Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">
              {mySub ? "Pengumpulan Ulang Tugas" : "Formulir Pengumpulan"}
            </h3>

            {isGraded ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                <FileCheck2 className="mx-auto size-7 text-emerald-600" />
                <p className="mt-2 text-xs font-semibold text-slate-900">
                  Pengumpulan Ditutup
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Tugas ini sudah dinilai oleh instruktur dan tidak dapat dikumpulkan ulang.
                </p>
              </div>
            ) : isSubmissionBlockedByDeadline ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                <AlertCircle className="mx-auto size-7 text-red-600" />
                <p className="mt-2 text-xs font-semibold text-red-900">
                  Batas Waktu Telah Habis
                </p>
                <p className="mt-1 text-xs text-red-700">
                  Instruktur tidak mengizinkan pengumpulan setelah tenggat waktu berakhir.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {mySub && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold">Pemberitahuan Pengumpulan Ulang:</p>
                    <p className="mt-0.5 text-amber-800">
                      Mengunggah berkas baru akan menaikkan jumlah percobaan (ke-
                      {mySub.attemptCount + 1}) dan menggantikan berkas lama Anda.
                    </p>
                  </div>
                )}

                {isLateSubmission && !mySub && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold">Pengumpulan Terlambat:</p>
                    <p className="mt-0.5 text-amber-800">
                      Tenggat telah lewat. Tugas akan ditandai sebagai pengumpulan terlambat.
                    </p>
                  </div>
                )}

                {/* Drag-and-Drop Area */}
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Berkas Tugas <span className="text-red-500">*</span>
                  </label>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileChange(file);
                    }}
                    className={`mt-1.5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                      isDragging
                        ? "border-[#123b63] bg-blue-50/50"
                        : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                    }`}
                  >
                    <UploadCloud className="size-8 text-slate-400" />
                    <p className="mt-2 text-xs font-semibold text-slate-700">
                      Tarik & letakkan berkas di sini
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      atau pilih langsung dari perangkat
                    </p>

                    <label className="mt-3 cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#123b63] shadow-2xs border border-slate-300 hover:bg-slate-50">
                      Pilih Berkas
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          handleFileChange(file);
                        }}
                      />
                    </label>
                  </div>

                  {/* Validation Error Message */}
                  {fileValidationError && (
                    <p className="mt-2 text-xs font-medium text-red-600">
                      {fileValidationError}
                    </p>
                  )}

                  {/* Selected File Card */}
                  {selectedFile && (
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="size-4 shrink-0 text-[#123b63]" />
                        <span className="truncate text-xs font-medium text-slate-800">
                          {selectedFile.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          ({formatBytes(selectedFile.size)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-600"
                        aria-label="Batalkan pilihan berkas"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Optional Notes Textarea */}
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Catatan Pengantar (Opsional)
                  </label>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="Tuliskan catatan atau keterangan tambahan untuk instruktur..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                  />
                  <div className="mt-1 flex justify-end text-[10px] text-slate-400">
                    {notes.length} / 2000 karakter
                  </div>
                </div>

                {/* Submit CTA Button */}
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={!selectedFile || Boolean(fileValidationError) || uploading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#123b63] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#0d2a47] focus:ring-2 focus:ring-[#123b63] focus:ring-offset-2 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      <span>Mengunggah Berkas...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="size-4" />
                      <span>{mySub ? "Kirim Pengumpulan Ulang" : "Kumpulkan Tugas"}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-50 p-2.5 text-[#123b63]">
                <HelpCircle className="size-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {mySub ? "Konfirmasi Pengumpulan Ulang" : "Konfirmasi Pengumpulan Tugas"}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {mySub
                    ? `Apakah Anda yakin ingin menggantikan pengumpulan sebelumnya dengan berkas "${selectedFile.name}"?`
                    : `Apakah Anda yakin ingin mengumpulkan berkas "${selectedFile.name}" untuk tugas "${data.title}"?`}
                </p>
                <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                  Ukuran: {formatBytes(selectedFile.size)} • Format:{" "}
                  {selectedFile.name.split(".").pop()?.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="rounded-lg bg-[#123b63] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0d2a47]"
              >
                Ya, Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
