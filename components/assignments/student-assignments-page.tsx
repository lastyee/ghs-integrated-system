"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  Paperclip,
  RotateCcw,
  Search,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/status-state";

export interface StudentAssignmentSubmissionSummary {
  id: string;
  status: "SUBMITTED" | "LATE" | "RESUBMITTED" | "GRADED";
  submittedAt: string;
  attemptCount: number;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
}

export interface StudentAssignmentItem {
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
  mySubmission?: StudentAssignmentSubmissionSummary | null;
}

export type AssignmentFilterStatus =
  | "ALL"
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "LATE"
  | "GRADED";

function formatDueDate(dueDateIso: string): string {
  try {
    const d = new Date(dueDateIso);
    return d.toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dueDateIso;
  }
}

function getDueProximity(dueDateIso: string, isSubmitted: boolean): {
  label: string;
  tone: "red" | "amber" | "slate" | "green";
  isOverdue: boolean;
} {
  const now = new Date().getTime();
  const due = new Date(dueDateIso).getTime();
  const diffHours = (due - now) / (1000 * 60 * 60);

  if (diffHours < 0) {
    return {
      label: "Lewat tenggat",
      tone: isSubmitted ? "slate" : "red",
      isOverdue: true,
    };
  }

  if (diffHours <= 24) {
    const hours = Math.max(1, Math.floor(diffHours));
    return {
      label: `Sisa ${hours} jam lagi`,
      tone: isSubmitted ? "slate" : "red",
      isOverdue: false,
    };
  }

  const days = Math.ceil(diffHours / 24);
  if (days <= 3) {
    return {
      label: `Sisa ${days} hari lagi`,
      tone: isSubmitted ? "slate" : "amber",
      isOverdue: false,
    };
  }

  return {
    label: `Tenggat dalam ${days} hari`,
    tone: "slate",
    isOverdue: false,
  };
}

export function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<StudentAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssignmentFilterStatus>("ALL");
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch("/api/assignments?limit=100", {
          headers: { credentials: "same-origin" },
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error("Anda tidak memiliki izin untuk melihat daftar tugas.");
          }
          throw new Error("Gagal memuat daftar tugas perkuliahan.");
        }

        const json = await res.json();
        if (!ignore) {
          setAssignments(json.data || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat tugas.";
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
  }, []);

  // Compute available unique subjects for filter dropdown
  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      if (a.subject?.id && a.subject?.name) {
        map.set(a.subject.id, `${a.subject.name} (${a.subject.code})`);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [assignments]);

  // Overall Statistics Calculation
  const stats = useMemo(() => {
    const total = assignments.length;
    let notSubmitted = 0;
    let submitted = 0;
    let late = 0;
    let graded = 0;
    let totalScore = 0;

    for (const a of assignments) {
      const sub = a.mySubmission;
      if (!sub) {
        notSubmitted++;
      } else {
        submitted++;
        if (sub.status === "LATE") {
          late++;
        }
        if (sub.status === "GRADED" || sub.score !== null) {
          graded++;
          if (sub.score !== null) {
            totalScore += sub.score;
          }
        }
      }
    }

    const avgScore = graded > 0 ? (totalScore / graded).toFixed(1) : "-";

    return { total, notSubmitted, submitted, late, graded, avgScore };
  }, [assignments]);

  // Filter and search
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      // 1. Subject filter
      if (selectedSubject !== "ALL" && a.subject.id !== selectedSubject) {
        return false;
      }

      // 2. Status filter
      const sub = a.mySubmission;
      if (statusFilter === "NOT_SUBMITTED" && sub) {
        return false;
      }
      if (statusFilter === "SUBMITTED" && (!sub || sub.status === "GRADED")) {
        return false;
      }
      if (statusFilter === "LATE" && sub?.status !== "LATE") {
        return false;
      }
      if (statusFilter === "GRADED" && (!sub || (sub.status !== "GRADED" && sub.score === null))) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = a.title.toLowerCase().includes(query);
        const matchesSubject = a.subject.name.toLowerCase().includes(query);
        const matchesInstructor = a.instructor.name.toLowerCase().includes(query);
        const matchesClass = a.class.name.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSubject && !matchesInstructor && !matchesClass) {
          return false;
        }
      }

      return true;
    });
  }, [assignments, selectedSubject, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Tugas"
          value={String(stats.total)}
          description="Semua penugasan kelas Anda"
          icon={BookOpen}
          tone="navy"
        />
        <StatCard
          label="Belum Dikumpulkan"
          value={String(stats.notSubmitted)}
          description="Memerlukan pengerjaan"
          icon={Clock}
          tone="yellow"
        />
        <StatCard
          label="Sudah Dikumpulkan"
          value={String(stats.submitted)}
          description={`${stats.late} pengumpulan terlambat`}
          icon={CheckCircle2}
          tone="blue"
        />
        <StatCard
          label="Sudah Dinilai"
          value={String(stats.graded)}
          description={stats.graded > 0 ? `Rata-rata: ${stats.avgScore}` : "Belum ada nilai"}
          icon={Award}
          tone="red"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Cari judul tugas, mata pelajaran, atau dosen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-8 text-sm text-slate-800 placeholder-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Bersihkan pencarian"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Subject Dropdown */}
          <div className="relative">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
              aria-label="Filter berdasarkan mata pelajaran"
            >
              <option value="ALL">Semua Mata Pelajaran</option>
              {uniqueSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          {(statusFilter !== "ALL" || selectedSubject !== "ALL" || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter("ALL");
                setSelectedSubject("ALL");
                setSearchQuery("");
              }}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Status Filter Tabs / Pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        {[
          { key: "ALL", label: "Semua", count: stats.total },
          { key: "NOT_SUBMITTED", label: "Belum Dikumpulkan", count: stats.notSubmitted },
          { key: "SUBMITTED", label: "Sudah Dikumpulkan", count: stats.submitted },
          { key: "LATE", label: "Terlambat", count: stats.late },
          { key: "GRADED", label: "Sudah Dinilai", count: stats.graded },
        ].map((tab) => {
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key as AssignmentFilterStatus)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-[#123b63] text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-white text-slate-700 shadow-2xs"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      {loading ? (
        <LoadingState
          title="Memuat data tugas"
          description="Mengambil daftar penugasan kelas Anda..."
        />
      ) : error ? (
        <ErrorState
          title="Gagal memuat tugas"
          description={error}
        />
      ) : filteredAssignments.length === 0 ? (
        <EmptyState
          title={
            searchQuery || statusFilter !== "ALL" || selectedSubject !== "ALL"
              ? "Tidak ada tugas yang sesuai filter"
              : "Belum ada tugas perkuliahan"
          }
          description={
            searchQuery || statusFilter !== "ALL" || selectedSubject !== "ALL"
              ? "Coba sesuaikan kata kunci pencarian atau ubah filter status di atas."
              : "Instruktur belum menerbitkan tugas baru untuk kelas Anda."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
          {filteredAssignments.map((assignment) => {
            const sub = assignment.mySubmission;
            const isSubmitted = Boolean(sub);
            const isGraded = Boolean(sub && (sub.status === "GRADED" || sub.score !== null));
            const proximity = getDueProximity(assignment.dueDate, isSubmitted);

            return (
              <article
                key={assignment.id}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-md"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {assignment.subject.name}
                    </span>

                    {/* Status Badge */}
                    {isGraded ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                        <Award className="size-3.5" />
                        Nilai: {sub?.score} / {assignment.maxScore}
                      </span>
                    ) : sub?.status === "LATE" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20">
                        <Clock className="size-3.5" />
                        Terkumpul Terlambat
                      </span>
                    ) : isSubmitted ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20">
                        <CheckCircle2 className="size-3.5" />
                        Sudah Dikumpulkan
                      </span>
                    ) : proximity.isOverdue ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-600/20">
                        <AlertCircle className="size-3.5" />
                        Terlewat Tenggat
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        <Clock className="size-3.5" />
                        Belum Mengumpulkan
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-[#123b63] transition-colors">
                    <Link href={`/assignments/${assignment.id}`} className="focus:outline-hidden">
                      {assignment.title}
                    </Link>
                  </h3>

                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                    {assignment.description || "Tidak ada petunjuk khusus."}
                  </p>

                  {/* Relational Metadata */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <GraduationCap className="size-3.5 text-slate-400" />
                      <span>{assignment.class.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="size-3.5 text-slate-400" />
                      <span>{assignment.instructor.name}</span>
                    </div>
                    {assignment.attachmentName && (
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <Paperclip className="size-3.5 text-blue-600" />
                        <span>Materi Lampiran</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Due Date & Action Link */}
                <div className="mt-5 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <div className="flex items-center gap-1 text-slate-500">
                        <Calendar className="size-3.5 text-slate-400" />
                        <span>Tenggat: {formatDueDate(assignment.dueDate)}</span>
                      </div>
                      {!isSubmitted && (
                        <p
                          className={`mt-0.5 text-[11px] font-medium ${
                            proximity.tone === "red"
                              ? "text-red-600"
                              : proximity.tone === "amber"
                              ? "text-amber-600"
                              : "text-slate-500"
                          }`}
                        >
                          {proximity.label}
                          {!assignment.allowLateSubmission && " • Batas Mutlak"}
                        </p>
                      )}
                    </div>

                    <Link
                      href={`/assignments/${assignment.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#123b63] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0d2a47] focus:ring-2 focus:ring-[#123b63] focus:ring-offset-1"
                    >
                      <span>
                        {isGraded
                          ? "Lihat Nilai"
                          : isSubmitted
                          ? "Lihat Pengumpulan"
                          : "Kumpulkan Tugas"}
                      </span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
