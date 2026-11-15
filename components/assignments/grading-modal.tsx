"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  HelpCircle,
  Loader2,
  X,
} from "lucide-react";

export interface StudentSubmissionForGrading {
  student: {
    id: string;
    nim: string;
    name: string;
    user?: {
      email?: string;
    } | null;
  };
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
  };
}

interface GradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedSubmission: Record<string, unknown>) => void;
  assignmentId: string;
  assignmentTitle: string;
  maxScore: number;
  data: StudentSubmissionForGrading | null;
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

export function GradingModal({
  isOpen,
  onClose,
  onSuccess,
  assignmentId,
  assignmentTitle,
  maxScore,
  data,
}: GradingModalProps) {
  const [score, setScore] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Confirmation step state
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScore(data.submission.score !== null && data.submission.score !== undefined ? data.submission.score.toString() : "");
    setFeedback(data.submission.feedback || "");
    setIsConfirming(false);
    setErrorMessage(null);
    setDownloadError(null);
  }, [isOpen, data]);

  if (!isOpen || !data) return null;

  const { student, submission } = data;

  // Handle safe download via signed URL
  const handleDownloadFile = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(
        `/api/assignments/${assignmentId}/submissions/${submission.id}`
      );
      if (!res.ok) {
        throw new Error("Gagal mengunduh berkas. Silakan coba lagi.");
      }
      const json = await res.json();
      const downloadUrl = json.data?.downloadUrl;
      if (!downloadUrl) {
        throw new Error("Tautan unduhan tidak tersedia atau telah kedaluwarsa.");
      }

      // Safe download trigger
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = submission.fileName || "submission-file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengunduh berkas.";
      setDownloadError(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const numericScore = parseFloat(score);
    if (isNaN(numericScore)) {
      setErrorMessage("Silakan masukkan nilai berupa angka yang valid.");
      return;
    }

    if (numericScore < 0) {
      setErrorMessage("Nilai tidak boleh kurang dari 0.");
      return;
    }

    if (numericScore > maxScore) {
      setErrorMessage(`Nilai tidak boleh melebihi nilai maksimum tugas (${maxScore}).`);
      return;
    }

    // Advance to confirmation dialog
    setIsConfirming(true);
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const numericScore = parseFloat(score);
      const res = await fetch(
        `/api/assignments/${assignmentId}/submissions/${submission.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score: numericScore,
            feedback: feedback.trim() || null,
          }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Gagal menyimpan penilaian.");
      }

      onSuccess(result.data);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan penilaian.";
      setErrorMessage(msg);
      setIsConfirming(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grading-modal-title"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Award className="size-5" />
            </div>
            <div>
              <h2 id="grading-modal-title" className="text-lg font-bold text-slate-900">
                Penilaian Tugas Mahasiswa
              </h2>
              <p className="text-xs text-slate-500 line-clamp-1">{assignmentTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Tutup form"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Student & Submission Info Section */}
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{student.name}</span>
                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {student.nim}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{student.user?.email || "Tidak ada email"}</p>
            </div>
            <div>
              {submission.status === "LATE" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                  <Clock className="size-3" />
                  Terlambat
                </span>
              ) : submission.status === "GRADED" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  <CheckCircle2 className="size-3" />
                  Sudah Dinilai
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                  <CheckCircle2 className="size-3" />
                  Terkumpul
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
            <div>
              <span className="text-slate-400">Waktu Kirim:</span>{" "}
              <span className="font-medium text-slate-700">{formatIndoDateTime(submission.submittedAt)}</span>
            </div>
            <div>
              <span className="text-slate-400">Percobaan:</span>{" "}
              <span className="font-medium text-slate-700">Ke-{submission.attemptCount}</span>
            </div>
          </div>

          {/* Student's Notes/Content */}
          {submission.content && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Catatan Pengantar Mahasiswa
              </span>
              <p className="whitespace-pre-line text-slate-800">{submission.content}</p>
            </div>
          )}

          {/* Submitted File Download Box */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <div className="flex items-center gap-2.5">
              <FileText className="size-5 text-[#123b63]" />
              <div>
                <p className="font-semibold text-slate-900">{submission.fileName}</p>
                <p className="text-[11px] text-slate-500">{formatBytes(submission.fileSize)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadFile}
              disabled={isDownloading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#123b63] hover:bg-slate-100 disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Mengunduh...</span>
                </>
              ) : (
                <>
                  <Download className="size-3.5" />
                  <span>Unduh Berkas</span>
                </>
              )}
            </button>
          </div>
          {downloadError && (
            <p className="mt-1 text-xs text-red-600 font-medium">{downloadError}</p>
          )}
        </div>

        {/* Form Body or Confirmation Dialog */}
        {isConfirming ? (
          <div className="p-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center">
              <HelpCircle className="mx-auto size-9 text-amber-600 mb-2" />
              <h3 className="text-base font-bold text-slate-900">
                Konfirmasi Simpan Penilaian
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
                Anda akan memberikan nilai <span className="font-extrabold text-[#123b63]">{score}</span> dari total{" "}
                <span className="font-bold text-slate-800">{maxScore}</span> poin untuk mahasiswa{" "}
                <span className="font-bold text-slate-900">{student.name}</span> ({student.nim}).
              </p>

              {feedback.trim() && (
                <div className="mt-3 text-left rounded-xl border border-amber-200/80 bg-white p-3 text-xs text-slate-700">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Umpan Balik:
                  </span>
                  <p className="line-clamp-3 text-slate-800 italic">“{feedback}”</p>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Kembali Ubah
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-xl bg-[#123b63] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0e2f50] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    <span>Ya, Simpan Penilaian</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePreSubmit}>
            <div className="space-y-4 px-6 py-5">
              {errorMessage && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Score Input */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="student-score" className="block text-xs font-semibold text-slate-700">
                    Nilai Tugas <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-medium text-slate-500">
                    Rentang: 0 — {maxScore} poin
                  </span>
                </div>
                <div className="relative mt-1.5">
                  <input
                    id="student-score"
                    type="number"
                    step="0.01"
                    min={0}
                    max={maxScore}
                    required
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder={`0 - ${maxScore}`}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-semibold text-slate-400">
                    / {maxScore}
                  </div>
                </div>
              </div>

              {/* Feedback Textarea */}
              <div>
                <label htmlFor="student-feedback" className="block text-xs font-semibold text-slate-700">
                  Umpan Balik / Catatan Evaluasi (Opsional)
                </label>
                <textarea
                  id="student-feedback"
                  rows={4}
                  maxLength={5000}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tuliskan apresiasi, masukan perbaikan teknis, atau poin evaluasi untuk mahasiswa..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                />
              </div>

              {/* Grader record display if previously graded */}
              {submission.gradedAt && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">Riwayat Penilaian:</span> Dinilai pada{" "}
                  {formatIndoDateTime(submission.gradedAt)}
                  {submission.gradedBy ? ` oleh ${submission.gradedBy.name}` : ""}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-[#123b63] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0e2f50]"
              >
                Simpan Penilaian
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
