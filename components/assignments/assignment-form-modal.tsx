"use client";

import { useEffect, useState, useRef } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";

export interface AssignmentItemData {
  id: string;
  title: string;
  description?: string | null;
  classId: string;
  subjectId: string;
  scheduleId?: string | null;
  dueDate: string;
  allowLateSubmission: boolean;
  maxScore: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentType?: string | null;
  class?: {
    id: string;
    name: string;
    batch?: {
      id: string;
      name: string;
    };
  };
  subject?: {
    id: string;
    name: string;
    code: string;
  };
}

interface ClassOption {
  id: string;
  name: string;
  batch?: {
    id: string;
    name: string;
  };
}

interface SubjectOption {
  id: string;
  name: string;
  code: string;
}

interface ScheduleOption {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  topic?: string | null;
  room?: string | null;
}

interface AssignmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (assignmentId: string) => void;
  assignmentToEdit?: AssignmentItemData | null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "jpg", "jpeg", "png"];

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseIsoToLocalDateAndTime(isoString?: string): { date: string; time: string } {
  if (!isoString) return { date: "", time: "" };
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: "", time: "" };
    const pad = (n: number) => n.toString().padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { date, time };
  } catch {
    return { date: "", time: "" };
  }
}

function combineLocalDateAndTimeToIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const dateParts = dateStr.trim().split("-");
  const timeParts = timeStr.trim().split(":");
  if (dateParts.length !== 3 || timeParts.length < 2) return null;

  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);
  const hour = parseInt(timeParts[0], 10);
  const minute = parseInt(timeParts[1], 10);

  if (
    isNaN(year) ||
    isNaN(month) ||
    isNaN(day) ||
    isNaN(hour) ||
    isNaN(minute) ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const d = new Date(year, month, day, hour, minute, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function AssignmentFormModal({
  isOpen,
  onClose,
  onSuccess,
  assignmentToEdit,
}: AssignmentFormModalProps) {
  const isEditing = Boolean(assignmentToEdit);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [dueDateDate, setDueDateDate] = useState("");
  const [dueDateTime, setDueDateTime] = useState("");
  const [allowLateSubmission, setAllowLateSubmission] = useState(false);
  const [maxScore, setMaxScore] = useState(100);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "CLOSED">("PUBLISHED");

  // Attachment states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Options states
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Submit states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Reset or initialize form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrorMessage(null);
    setFieldErrors({});
    setSelectedFile(null);
    setFileError(null);

    if (assignmentToEdit) {
      setTitle(assignmentToEdit.title || "");
      setDescription(assignmentToEdit.description || "");
      setClassId(assignmentToEdit.classId || "");
      setSubjectId(assignmentToEdit.subjectId || "");
      setScheduleId(assignmentToEdit.scheduleId || "");
      const { date, time } = parseIsoToLocalDateAndTime(assignmentToEdit.dueDate);
      setDueDateDate(date);
      setDueDateTime(time);
      setAllowLateSubmission(Boolean(assignmentToEdit.allowLateSubmission));
      setMaxScore(assignmentToEdit.maxScore ?? 100);
      setStatus(assignmentToEdit.status || "PUBLISHED");
    } else {
      setTitle("");
      setDescription("");
      setClassId("");
      setSubjectId("");
      setScheduleId("");
      // Deadline diatur secara manual (tidak ditentukan secara otomatis oleh sistem)
      setDueDateDate("");
      setDueDateTime("");
      setAllowLateSubmission(false);
      setMaxScore(100);
      setStatus("PUBLISHED");
    }

    // Load available classes and subjects for instructor
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const [classesRes, subjectsRes] = await Promise.all([
          fetch("/api/classes?limit=100"),
          fetch("/api/subjects?limit=100"),
        ]);

        if (classesRes.ok) {
          const classData = await classesRes.json();
          setClasses(classData.data || []);
          if (!assignmentToEdit && classData.data?.length > 0) {
            setClassId(classData.data[0].id);
          }
        }

        if (subjectsRes.ok) {
          const subjectData = await subjectsRes.json();
          setSubjects(subjectData.data || []);
          if (!assignmentToEdit && subjectData.data?.length > 0) {
            setSubjectId(subjectData.data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load options for assignment form:", err);
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, [isOpen, assignmentToEdit]);

  // Load schedules whenever classId or subjectId changes
  useEffect(() => {
    if (!classId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSchedules([]);
      return;
    }

    let isMounted = true;
    async function loadSchedules() {
      try {
        let url = `/api/schedules?classId=${encodeURIComponent(classId)}&limit=50`;
        if (subjectId) {
          url += `&subjectId=${encodeURIComponent(subjectId)}`;
        }
        const res = await fetch(url);
        if (res.ok && isMounted) {
          const schedData = await res.json();
          setSchedules(schedData.data || []);
        }
      } catch (err) {
        console.error("Failed to load schedules:", err);
      }
    }

    loadSchedules();
    return () => {
      isMounted = false;
    };
  }, [classId, subjectId]);

  if (!isOpen) return null;

  // File validation
  const validateFile = (file: File): boolean => {
    setFileError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(
        `Format berkas tidak didukung. Format yang diizinkan: ${ALLOWED_EXTENSIONS.join(", ").toUpperCase()}.`
      );
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("Ukuran berkas melebihi batas maksimum 10 MB.");
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (validateFile(file)) {
        setSelectedFile(file);
      } else {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (validateFile(file)) {
        setSelectedFile(file);
      } else {
        setSelectedFile(null);
      }
    }
  };

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    // Client validation
    if (!title.trim()) {
      setErrorMessage("Judul tugas wajib diisi.");
      return;
    }
    if (!classId) {
      setErrorMessage("Silakan pilih kelas yang diampu.");
      return;
    }
    if (!subjectId) {
      setErrorMessage("Silakan pilih mata pelajaran.");
      return;
    }
    if (!dueDateDate.trim()) {
      setErrorMessage("Tanggal tenggat tugas wajib dipilih.");
      return;
    }
    if (!dueDateTime.trim()) {
      setErrorMessage("Jam tenggat tugas wajib dipilih.");
      return;
    }

    const isoDueDate = combineLocalDateAndTimeToIso(dueDateDate, dueDateTime);
    if (!isoDueDate) {
      setErrorMessage("Format tanggal atau jam tenggat tidak valid.");
      return;
    }
    if (maxScore <= 0 || isNaN(maxScore)) {
      setErrorMessage("Nilai maksimum harus lebih besar dari 0.");
      return;
    }

    setIsSubmitting(true);

    try {

      let res: Response;

      if (selectedFile) {
        // Send as multipart/form-data
        const formData = new FormData();
        formData.append("title", title.trim());
        formData.append("description", description.trim());
        formData.append("classId", classId);
        formData.append("subjectId", subjectId);
        if (scheduleId) formData.append("scheduleId", scheduleId);
        formData.append("dueDate", isoDueDate);
        formData.append("allowLateSubmission", allowLateSubmission ? "true" : "false");
        formData.append("maxScore", maxScore.toString());
        formData.append("status", status);
        formData.append("file", selectedFile);

        const endpoint = isEditing ? `/api/assignments/${assignmentToEdit?.id}` : "/api/assignments";
        const method = isEditing ? "PATCH" : "POST";

        res = await fetch(endpoint, {
          method,
          body: formData,
        });
      } else {
        // Send as JSON
        const payload: Record<string, unknown> = {
          title: title.trim(),
          description: description.trim() || null,
          classId,
          subjectId,
          scheduleId: scheduleId || null,
          dueDate: isoDueDate,
          allowLateSubmission,
          maxScore,
          status,
        };

        const endpoint = isEditing ? `/api/assignments/${assignmentToEdit?.id}` : "/api/assignments";
        const method = isEditing ? "PATCH" : "POST";

        res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const result = await res.json();

      if (!res.ok) {
        if (result.errors) {
          setFieldErrors(result.errors);
        }
        throw new Error(result.message || "Gagal menyimpan tugas.");
      }

      const savedId = result.data?.id || result.id || assignmentToEdit?.id || "";
      onSuccess(savedId);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses data.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#123b63]/10 text-[#123b63]">
              <FileText className="size-5" />
            </div>
            <div>
              <h2 id="assignment-modal-title" className="text-lg font-bold text-slate-900">
                {isEditing ? "Edit Tugas Perkuliahan" : "Buat Tugas Baru"}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing
                  ? "Perbarui instruksi, kelas, batas waktu, atau lampiran materi tugas"
                  : "Buat penugasan baru untuk kelas yang Anda ampu"}
              </p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[calc(85vh-130px)] space-y-4 overflow-y-auto px-6 py-5">
            {/* Error Banner */}
            {errorMessage && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                <div className="flex-1 font-medium">{errorMessage}</div>
              </div>
            )}

            {/* Title */}
            <div>
              <label htmlFor="assignment-title" className="block text-xs font-semibold text-slate-700">
                Judul Tugas <span className="text-red-500">*</span>
              </label>
              <input
                id="assignment-title"
                type="text"
                required
                maxLength={255}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Misal: Tugas 1 — Analisis Laporan Keuangan"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
              />
              {fieldErrors.title && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.title[0]}</p>
              )}
            </div>

            {/* Class & Subject Dropdowns */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Class */}
              <div>
                <label htmlFor="assignment-class" className="block text-xs font-semibold text-slate-700">
                  Kelas (Diampu) <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <select
                    id="assignment-class"
                    required
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    disabled={loadingOptions || (isEditing && Boolean(assignmentToEdit?.attachmentName))}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63] disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="" disabled>
                      Pilih Kelas
                    </option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.batch ? `(${c.batch.name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldErrors.classId && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.classId[0]}</p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label htmlFor="assignment-subject" className="block text-xs font-semibold text-slate-700">
                  Mata Pelajaran <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <select
                    id="assignment-subject"
                    required
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    disabled={loadingOptions}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63] disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="" disabled>
                      Pilih Mata Pelajaran
                    </option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldErrors.subjectId && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.subjectId[0]}</p>
                )}
              </div>
            </div>

            {/* Optional Schedule Selection */}
            {schedules.length > 0 && (
              <div>
                <label htmlFor="assignment-schedule" className="block text-xs font-semibold text-slate-700">
                  Terkait Sesi Jadwal (Opsional)
                </label>
                <select
                  id="assignment-schedule"
                  value={scheduleId}
                  onChange={(e) => setScheduleId(e.target.value)}
                  className="mt-1.5 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                >
                  <option value="">Tidak dikaitkan ke jadwal spesifik</option>
                  {schedules.map((sched) => (
                    <option key={sched.id} value={sched.id}>
                      {new Date(sched.date).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      ({sched.startTime} - {sched.endTime}) {sched.topic ? `— ${sched.topic}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Description / Instructions */}
            <div>
              <label htmlFor="assignment-desc" className="block text-xs font-semibold text-slate-700">
                Petunjuk & Instruksi Tugas
              </label>
              <textarea
                id="assignment-desc"
                rows={4}
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tuliskan petunjuk pengerjaan, format pengumpulan yang diharapkan, kriteria penilaian, atau ketentuan lainnya..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
              />
              {fieldErrors.description && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.description[0]}</p>
              )}
            </div>

            {/* Due Date: Separate Date & Time Pickers */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4">
              <div className="mb-2.5">
                <span className="block text-xs font-bold text-slate-800">
                  Batas Waktu Pengumpulan (Deadline Manual) <span className="text-red-500">*</span>
                </span>
                <p className="text-[11px] text-slate-500">
                  Tentukan tanggal dan jam batas akhir pengumpulan tugas secara manual.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {/* Date Picker (Kalender) */}
                <div>
                  <label
                    htmlFor="assignment-due-date"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Tanggal Tenggat (Kalender) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Calendar className="size-4" />
                    </div>
                    <input
                      id="assignment-due-date"
                      type="date"
                      required
                      value={dueDateDate}
                      onChange={(e) => {
                        setDueDateDate(e.target.value);
                        if (fieldErrors.dueDate) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.dueDate;
                            return next;
                          });
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                    />
                  </div>
                </div>

                {/* Time Picker (Jam & Menit) */}
                <div>
                  <label
                    htmlFor="assignment-due-time"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Jam Tenggat (Waktu) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Clock className="size-4" />
                    </div>
                    <input
                      id="assignment-due-time"
                      type="time"
                      required
                      value={dueDateTime}
                      onChange={(e) => {
                        setDueDateTime(e.target.value);
                        if (fieldErrors.dueDate) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.dueDate;
                            return next;
                          });
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                    />
                  </div>
                </div>
              </div>

              {fieldErrors.dueDate && (
                <p className="mt-2 text-xs text-red-600">{fieldErrors.dueDate[0]}</p>
              )}
            </div>

            {/* Max Score & Status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Max Score */}
              <div>
                <label htmlFor="assignment-score" className="block text-xs font-semibold text-slate-700">
                  Nilai Maksimum <span className="text-red-500">*</span>
                </label>
                <input
                  id="assignment-score"
                  type="number"
                  required
                  min={1}
                  max={1000}
                  value={maxScore}
                  onChange={(e) => setMaxScore(parseFloat(e.target.value) || 0)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                />
                {fieldErrors.maxScore && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.maxScore[0]}</p>
                )}
              </div>

              {/* Status */}
              <div>
                <label htmlFor="assignment-status" className="block text-xs font-semibold text-slate-700">
                  Status Publikasi <span className="text-red-500">*</span>
                </label>
                <select
                  id="assignment-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED" | "CLOSED")}
                  className="mt-1.5 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
                >
                  <option value="PUBLISHED">Diterbitkan (Aktif)</option>
                  <option value="DRAFT">Draf (Disimpan dulu)</option>
                  <option value="CLOSED">Ditutup (Selesai)</option>
                </select>
              </div>
            </div>

            {/* Late Submission Checkbox */}
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <input
                id="assignment-allow-late"
                type="checkbox"
                checked={allowLateSubmission}
                onChange={(e) => setAllowLateSubmission(e.target.checked)}
                className="mt-0.5 size-4 rounded-sm border-slate-300 text-[#123b63] focus:ring-[#123b63]"
              />
              <label htmlFor="assignment-allow-late" className="text-xs text-slate-700 cursor-pointer">
                <span className="font-semibold block text-slate-900">
                  Izinkan Pengumpulan Terlambat
                </span>
                Jika dicentang, mahasiswa tetap dapat mengumpulkan berkas tugas setelah tenggat waktu dengan tanda status <span className="font-semibold text-amber-700">TERLAMBAT</span>.
              </label>
            </div>

            {/* File Attachment Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Lampiran Materi / Dokumen Tugas (Opsional)
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Format yang didukung: PDF, DOC, DOCX, PPT, PPTX, JPG, JPEG, PNG. Maksimal 10 MB.
              </p>

              {/* Existing attachment notice */}
              {isEditing && assignmentToEdit?.attachmentName && !selectedFile && (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-blue-700" />
                    <div>
                      <span className="font-semibold">Berkas saat ini:</span>{" "}
                      {assignmentToEdit.attachmentName} ({formatBytes(assignmentToEdit.attachmentSize)})
                    </div>
                  </div>
                  <span className="text-[11px] text-blue-700">Unggah berkas baru untuk mengganti</span>
                </div>
              )}

              {/* Drag & Drop Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                  isDragging
                    ? "border-[#123b63] bg-blue-50/50"
                    : selectedFile
                    ? "border-emerald-300 bg-emerald-50/40"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/30"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png"
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-900">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500">{formatBytes(selectedFile.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mb-1.5 size-6 text-slate-400" />
                    <p className="text-xs font-medium text-slate-700">
                      Tarik & letakkan berkas di sini atau <span className="text-[#123b63] underline">Pilih Berkas</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">PDF, DOC, DOCX, PPT, PPTX, JPG, PNG (Maks 10 MB)</p>
                  </>
                )}
              </div>

              {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-[#123b63] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0e2f50] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>{isEditing ? "Simpan Perubahan" : "Buat Tugas"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
