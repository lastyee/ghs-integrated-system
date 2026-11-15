"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/status-state";
import {
  AssignmentFormModal,
  AssignmentItemData,
} from "@/components/assignments/assignment-form-modal";

export interface InstructorAssignmentItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  allowLateSubmission: boolean;
  maxScore: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentType?: string | null;
  classId: string;
  subjectId: string;
  scheduleId?: string | null;
  createdAt: string;
  updatedAt: string;
  class: {
    id: string;
    name: string;
    batch: {
      id: string;
      name: string;
      program?: {
        name: string;
      } | null;
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
  };
  instructor?: {
    id: string;
    name?: string;
  } | null;
  _count?: {
    submissions: number;
  };
}

interface StatsData {
  total: number;
  published: number;
  draft: number;
  closed: number;
}

interface ClassFilterOption {
  id: string;
  name: string;
  batch?: {
    name: string;
  };
}

interface SubjectFilterOption {
  id: string;
  name: string;
  code: string;
}


function formatIndoDateTime(isoString: string): string {
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

export function InstructorAssignmentsPage() {
  // Assignments list & pagination
  const [assignments, setAssignments] = useState<InstructorAssignmentItem[]>([]);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    published: 0,
    draft: 0,
    closed: 0,
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 15;

  // Filters
  const [search, setSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("ALL");
  const [selectedSubjectId, setSelectedSubjectId] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | "PUBLISHED" | "DRAFT" | "CLOSED">("ALL");

  // Filter options
  const [classes, setClasses] = useState<ClassFilterOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectFilterOption[]>([]);

  // State flags
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [assignmentToEdit, setAssignmentToEdit] = useState<AssignmentItemData | null>(null);

  // Load filter options on mount
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const [classesRes, subjectsRes] = await Promise.all([
          fetch("/api/classes?limit=100"),
          fetch("/api/subjects?limit=100"),
        ]);
        if (classesRes.ok) {
          const res = await classesRes.json();
          setClasses(res.data || []);
        }
        if (subjectsRes.ok) {
          const res = await subjectsRes.json();
          setSubjects(res.data || []);
        }
      } catch (err) {
        console.error("Failed to load assignment filter options:", err);
      }
    }

    loadFilterOptions();
  }, []);

  // Fetch assignments
  const fetchAssignments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());

      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (selectedClassId && selectedClassId !== "ALL") {
        params.set("classId", selectedClassId);
      }
      if (selectedSubjectId && selectedSubjectId !== "ALL") {
        params.set("subjectId", selectedSubjectId);
      }
      if (selectedStatus && selectedStatus !== "ALL") {
        params.set("status", selectedStatus);
      }

      const res = await fetch(`/api/assignments?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Gagal memuat daftar tugas.");
      }

      const result = await res.json();
      setAssignments(result.data || []);
      setTotalPages(result.pagination?.totalPages || 1);
      setTotalCount(result.pagination?.total || 0);
      if (result.stats) {
        setStats(result.stats);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, selectedClassId, selectedSubjectId, selectedStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAssignments();
  }, [fetchAssignments]);

  const handleResetFilters = () => {
    setSearch("");
    setSelectedClassId("ALL");
    setSelectedSubjectId("ALL");
    setSelectedStatus("ALL");
    setPage(1);
  };

  const handleOpenCreate = () => {
    setAssignmentToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: InstructorAssignmentItem) => {
    setAssignmentToEdit({
      id: item.id,
      title: item.title,
      description: item.description,
      classId: item.classId,
      subjectId: item.subjectId,
      scheduleId: item.scheduleId,
      dueDate: item.dueDate,
      allowLateSubmission: item.allowLateSubmission,
      maxScore: item.maxScore,
      status: item.status,
      attachmentName: item.attachmentName,
      attachmentSize: item.attachmentSize,
      attachmentType: item.attachmentType,
      class: item.class,
      subject: item.subject,
    });
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Pengelolaan Tugas Perkuliahan
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Kelola penugasan, batas pengumpulan, berkas materi, dan rekap penilaian mahasiswa untuk kelas yang Anda ampu.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#123b63] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0e2f50]"
        >
          <Plus className="size-4" />
          <span>Buat Tugas Baru</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Tugas"
          value={stats.total.toString()}
          icon={FileText}
          tone="navy"
          description="Seluruh tugas aktif"
        />
        <StatCard
          label="Diterbitkan"
          value={stats.published.toString()}
          icon={CheckCircle2}
          tone="blue"
          description="Dapat diakses mahasiswa"
        />
        <StatCard
          label="Draf"
          value={stats.draft.toString()}
          icon={Clock}
          tone="yellow"
          description="Belum dipublikasikan"
        />
        <StatCard
          label="Ditutup"
          value={stats.closed.toString()}
          icon={RotateCcw}
          tone="navy"
          description="Periode pengumpulan berakhir"
        />
      </div>

      {/* Filters & Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Search Input */}
          <div className="relative md:col-span-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari judul tugas, mata pelajaran..."
              className="w-full rounded-xl border border-slate-200 pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
            />
          </div>

          {/* Class Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setPage(1);
              }}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
            >
              <option value="ALL">Semua Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.batch ? `(${c.batch.name})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setPage(1);
              }}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-[#123b63] focus:outline-hidden focus:ring-1 focus:ring-[#123b63]"
            >
              <option value="ALL">Semua Mata Pelajaran</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-center md:col-span-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="size-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Status:
          </span>
          {[
            { id: "ALL", label: "Semua Status" },
            { id: "PUBLISHED", label: "Diterbitkan" },
            { id: "DRAFT", label: "Draf" },
            { id: "CLOSED", label: "Ditutup" },
          ].map((tab) => {
            const active = selectedStatus === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedStatus(tab.id as typeof selectedStatus);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
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

      {/* Main Content: Table or States */}
      {isLoading ? (
        <LoadingState title="Memuat daftar tugas perkuliahan" description="Mengambil data penugasan kelas..." />
      ) : error ? (
        <ErrorState title="Gagal memuat tugas" description={error} />
      ) : assignments.length === 0 ? (
        <EmptyState
          title="Belum ada tugas ditemukan"
          description={
            search || selectedClassId !== "ALL" || selectedSubjectId !== "ALL" || selectedStatus !== "ALL"
              ? "Tidak ada tugas yang sesuai dengan kriteria filter pencarian Anda."
              : "Anda belum membuat tugas untuk kelas yang diampu. Klik 'Buat Tugas Baru' untuk memulai."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Judul Tugas & Materi
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Mata Pelajaran
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Kelas & Batch
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Tenggat Pengumpulan
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center">
                    Pengumpulan
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((item) => {
                  const dueInfo = getDueBadge(item.dueDate, item.status);
                  const submissionCount = item._count?.submissions || 0;

                  return (
                    <tr key={item.id} className="transition hover:bg-slate-50/70">
                      {/* Title & Attachment */}
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#123b63]/10 text-[#123b63] mt-0.5">
                            <FileText className="size-4" />
                          </div>
                          <div>
                            <Link
                              href={`/assignments/${item.id}`}
                              className="font-bold text-slate-900 hover:text-[#123b63] transition hover:underline"
                            >
                              {item.title}
                            </Link>
                            {item.description && (
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                                {item.description}
                              </p>
                            )}
                            {item.attachmentName && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-blue-700">
                                <Paperclip className="size-3" />
                                <span className="line-clamp-1">{item.attachmentName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Subject */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{item.subject.name}</div>
                        <div className="text-[11px] text-slate-500">{item.subject.code}</div>
                      </td>

                      {/* Class */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{item.class.name}</div>
                        <div className="text-[11px] text-slate-500">{item.class.batch.name}</div>
                      </td>

                      {/* Due Date & Badge */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{formatIndoDateTime(item.dueDate)}</div>
                        <div className="mt-1">
                          {dueInfo.tone === "red" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                              <Clock className="size-2.5" />
                              {dueInfo.label}
                            </span>
                          ) : dueInfo.tone === "amber" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              <Clock className="size-2.5" />
                              {dueInfo.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              <CheckCircle2 className="size-2.5" />
                              {dueInfo.label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {item.status === "PUBLISHED" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            Diterbitkan
                          </span>
                        ) : item.status === "DRAFT" ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
                            Draf
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 border border-slate-200">
                            Ditutup
                          </span>
                        )}
                      </td>

                      {/* Submissions count */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800">
                          <Users className="size-3.5 text-slate-500" />
                          <span>{submissionCount}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            title="Edit Tugas"
                          >
                            <Edit3 className="size-3.5" />
                            <span>Edit</span>
                          </button>
                          <Link
                            href={`/assignments/${item.id}`}
                            className="flex items-center gap-1 rounded-lg bg-[#123b63] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0e2f50]"
                          >
                            <span>Rekap & Nilai</span>
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 text-xs text-slate-600">
              <div>
                Menampilkan halaman <span className="font-semibold text-slate-900">{page}</span> dari{" "}
                <span className="font-semibold text-slate-900">{totalPages}</span> ({totalCount} total tugas)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assignment Create / Edit Modal */}
      <AssignmentFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => {
          fetchAssignments();
        }}
        assignmentToEdit={assignmentToEdit}
      />
    </div>
  );
}
