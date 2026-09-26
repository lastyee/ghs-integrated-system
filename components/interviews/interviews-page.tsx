"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  Search,
  Plus,
  Loader2,
  AlertCircle,
  Building2,
  Briefcase,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { InterviewFormModal } from "./interview-form";

export type InterviewListItem = {
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
    studentId: string;
    vacancyId: string;
    student: {
      id: string;
      nim: string;
      name: string;
      userId: string | null;
    };
    vacancy: {
      id: string;
      title: string;
      employerId: string;
      employer: {
        id: string;
        name: string;
      };
    };
  };
};

type InterviewsPageProps = {
  userRole?: string;
  userId?: string;
};

export function InterviewStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PENDING":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          <Clock3 className="size-3" />
          Menunggu
        </span>
      );
    case "RESCHEDULED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <RotateCcw className="size-3" />
          Dijadwalkan Ulang
        </span>
      );
    case "PASSED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="size-3" />
          Lulus
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
          <XCircle className="size-3" />
          Tidak Lulus
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {status}
        </span>
      );
  }
}

export function InterviewsPage({ userRole }: InterviewsPageProps) {
  const [interviews, setInterviews] = useState<InterviewListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const isStaff = useMemo(
    () =>
      userRole === "SUPER_ADMIN" ||
      userRole === "ADMIN" ||
      userRole === "PLACEMENT_STAFF",
    [userRole]
  );

  const isStudent = userRole === "STUDENT";
  const isForbiddenRole =
    userRole === "ACADEMIC_STAFF" || userRole === "INSTRUCTOR";

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (isForbiddenRole) return;

    let isMounted = true;

    fetch("/api/interviews")
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          setError("Gagal memuat daftar wawancara dari server.");
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (isMounted) {
          setInterviews(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Terjadi kesalahan jaringan saat memuat data wawancara.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isForbiddenRole, refreshTrigger]);

  const filteredInterviews = useMemo(() => {
    return interviews.filter((iv) => {
      // Status filter
      if (statusFilter !== "ALL" && iv.status !== statusFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const studentName = iv.application?.student?.name?.toLowerCase() || "";
        const studentNim = iv.application?.student?.nim?.toLowerCase() || "";
        const vacancyTitle = iv.application?.vacancy?.title?.toLowerCase() || "";
        const employerName =
          iv.application?.vacancy?.employer?.name?.toLowerCase() || "";
        const location = iv.location?.toLowerCase() || "";
        const method = iv.method?.toLowerCase() || "";

        return (
          studentName.includes(query) ||
          studentNim.includes(query) ||
          vacancyTitle.includes(query) ||
          employerName.includes(query) ||
          location.includes(query) ||
          method.includes(query)
        );
      }

      return true;
    });
  }, [interviews, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = interviews.length;
    const pending = interviews.filter((i) => i.status === "PENDING").length;
    const rescheduled = interviews.filter((i) => i.status === "RESCHEDULED").length;
    const passed = interviews.filter((i) => i.status === "PASSED").length;
    const failed = interviews.filter((i) => i.status === "FAILED").length;
    return { total, pending, rescheduled, passed, failed };
  }, [interviews]);

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
            Anda tidak memiliki akses ke modul Wawancara.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8 space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#102f50]">
            {isStudent ? "Jadwal Wawancara Saya" : "Manajemen Wawancara (Interview)"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {isStudent
              ? "Pantau jadwal dan informasi pelaksanaan wawancara seleksi kerja Anda"
              : "Kelola agenda wawancara kandidat, penyesuaian jadwal, dan evaluasi hasil"}
          </p>
        </div>

        {isStaff && (
          <button
            type="button"
            data-testid="btn-create-interview"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1a4470] transition-colors"
          >
            <Plus className="size-4" />
            Jadwalkan Wawancara
          </button>
        )}
      </div>

      {/* Stat Cards for Staff & Management */}
      {!isStudent && !loading && !error && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-xs font-medium text-slate-500">Total Wawancara</p>
            <p className="mt-1 text-2xl font-bold text-[#102f50]">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-xs">
            <p className="text-xs font-medium text-blue-700">Menunggu</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{stats.pending}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 shadow-xs">
            <p className="text-xs font-medium text-amber-700">Dijadwalkan Ulang</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{stats.rescheduled}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-xs">
            <p className="text-xs font-medium text-emerald-700">Lulus</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.passed}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 shadow-xs">
            <p className="text-xs font-medium text-rose-700">Tidak Lulus</p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{stats.failed}</p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            type="text"
            data-testid="interview-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan nama kandidat, lowongan, perusahaan, lokasi..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="status-filter-select" className="shrink-0 text-xs font-medium text-slate-500">
            Status:
          </label>
          <select
            id="status-filter-select"
            data-testid="interview-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 p-2 text-xs text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
          >
            <option value="ALL">Semua Status</option>
            <option value="PENDING">Menunggu</option>
            <option value="RESCHEDULED">Dijadwalkan Ulang</option>
            <option value="PASSED">Lolos</option>
            <option value="FAILED">Tidak Lolos</option>
          </select>
        </div>
      </div>

      {/* Content State Handling */}
      {loading ? (
        <div
          data-testid="loading-state"
          className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center"
        >
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-xs font-medium text-slate-500">
            Memuat daftar wawancara...
          </p>
        </div>
      ) : error ? (
        <div
          data-testid="error-state"
          className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center"
        >
          <AlertCircle className="mx-auto size-8 text-rose-500" />
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
      ) : filteredInterviews.length === 0 ? (
        <div
          data-testid="empty-state"
          className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center"
        >
          <CalendarDays className="size-10 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {isStudent
              ? "Belum ada jadwal wawancara."
              : "Belum ada data wawancara yang tersedia."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {searchQuery || statusFilter !== "ALL"
              ? "Tidak ada wawancara yang sesuai dengan kriteria pencarian atau filter."
              : isStudent
              ? "Wawancara akan muncul di sini saat staf menjadwalkan sesi interview untuk lamaran Anda."
              : "Klik tombol 'Jadwalkan Wawancara' di atas untuk membuat jadwal baru."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredInterviews.map((iv) => {
            const scheduledDate = new Date(iv.scheduledAt);
            const dateStr = scheduledDate.toLocaleDateString("id-ID", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const timeStr = scheduledDate.toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={iv.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <InterviewStatusBadge status={iv.status} />
                    <span className="text-[11px] font-medium text-slate-400">
                      {iv.method || "Wawancara"}
                    </span>
                  </div>

                  <div className="mt-3.5 space-y-2">
                    {/* Candidate (for staff / management) */}
                    {!isStudent && (
                      <div className="flex items-center gap-2">
                        <User className="size-3.5 shrink-0 text-slate-400" />
                        <span className="truncate text-xs font-bold text-slate-800">
                          {iv.application?.student?.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({iv.application?.student?.nim})
                        </span>
                      </div>
                    )}

                    {/* Vacancy */}
                    <div className="flex items-center gap-2">
                      <Briefcase className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate text-xs font-semibold text-[#102f50]">
                        {iv.application?.vacancy?.title}
                      </span>
                    </div>

                    {/* Employer */}
                    <div className="flex items-center gap-2">
                      <Building2 className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate text-xs text-slate-600">
                        {iv.application?.vacancy?.employer?.name}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="size-3.5 shrink-0 text-slate-400" />
                      <span>{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock3 className="size-3.5 shrink-0 text-slate-400" />
                      <span>Pukul {timeStr} WIB</span>
                    </div>
                    {iv.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{iv.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    {new Date(iv.createdAt).toLocaleDateString("id-ID")}
                  </span>
                  <Link
                    href={`/interviews/${iv.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-[#102f50] hover:bg-slate-100 transition-colors"
                  >
                    <span>Detail Wawancara</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal create */}
      {isCreateOpen && (
        <InterviewFormModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            setLoading(true);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
