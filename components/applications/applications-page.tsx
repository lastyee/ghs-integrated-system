"use client";

import Link from "next/link";
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";
import {
  APPLICATION_STATUS_BADGES,
  APPLICATION_STATUS_LABELS,
  ApplicationStatusValue,
  VALID_APPLICATION_STATUSES,
} from "@/schemas/application";

export type ApplicationItem = {
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
  };
  vacancy: {
    id: string;
    title: string;
    status: string;
    employer: {
      id: string;
      name: string;
    };
  };
};

export type MinimalVacancyItem = {
  id: string;
  title: string;
  employer: {
    name: string;
  };
};

export type ApplicationsPageProps = {
  userRole?: string;
  userId?: string;
};

export function ApplicationStatusBadge({
  status,
}: {
  status: ApplicationStatusValue | string;
}) {
  const badgeConfig =
    APPLICATION_STATUS_BADGES[status as ApplicationStatusValue] || {
      label: status,
      bg: "bg-slate-100",
      text: "text-slate-700",
      border: "border-slate-200",
    };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badgeConfig.bg} ${badgeConfig.text} ${badgeConfig.border}`}
    >
      {badgeConfig.label}
    </span>
  );
}

export function ApplicationsPage({ userRole = "" }: ApplicationsPageProps) {
  const canDelete = ["SUPER_ADMIN", "ADMIN"].includes(userRole.toUpperCase());
  const isStudent =
    userRole.toUpperCase() === "STUDENT" || userRole.toLowerCase() === "student";
  const isManagement =
    userRole.toUpperCase() === "MANAGEMENT" ||
    userRole.toLowerCase() === "management";
  const isAcademicOrInstructor =
    userRole.toUpperCase() === "ACADEMIC_STAFF" ||
    userRole.toUpperCase() === "INSTRUCTOR" ||
    userRole.toLowerCase().includes("academic") ||
    userRole.toLowerCase().includes("instructor");

  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(!isAcademicOrInstructor);
  const [error, setError] = useState<string | null>(null);
  const [unauthorizedFromApi, setUnauthorizedFromApi] = useState(false);
  const unauthorized = isAcademicOrInstructor || unauthorizedFromApi;
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters & Search & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [apiStats, setApiStats] = useState<{
    total: number;
    active: number;
    applied?: number;
    screening: number;
    interview: number;
    selected: number;
    closed: number;
    placement?: number;
  } | null>(null);

  // Notice banner
  const [notice, setNotice] = useState<string>("");

  // Withdraw Modal State (Student)
  const [withdrawModalApp, setWithdrawModalApp] =
    useState<ApplicationItem | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  // Staff Quick Transition State
  const [transitionModal, setTransitionModal] = useState<{
    app: ApplicationItem;
    targetStatus: ApplicationStatusValue;
  } | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionError, setTransitionError] = useState("");

  // Create Application Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createVacancyId, setCreateVacancyId] = useState("");
  const [createStudentId, setCreateStudentId] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Vacancies for dropdown
  const [availableVacancies, setAvailableVacancies] = useState<MinimalVacancyItem[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(false);

  // Students for dropdown (staff only)
  const [availableStudents, setAvailableStudents] = useState<{ id: string; name: string; nim: string }[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Search debounce 500ms
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== debouncedSearchQuery) {
        setDebouncedSearchQuery(searchQuery);
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery, debouncedSearchQuery]);

  // Fetch applications
  useEffect(() => {
    let isMounted = true;

    // Do not fetch if user has unauthorized role
    if (isAcademicOrInstructor) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      ...(debouncedSearchQuery.trim() ? { search: debouncedSearchQuery.trim() } : {}),
      ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
    });

    fetch(`/api/applications?${params.toString()}`)
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 401 || res.status === 403) {
          setUnauthorizedFromApi(true);
          setApplications([]);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Gagal memuat daftar lamaran.");
        }
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        setApplications(list);
        setUnauthorizedFromApi(false);
        if (json.pagination) {
          setTotal(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        } else {
          setTotal(list.length);
          setTotalPages(1);
        }
        if (json.stats) {
          setApiStats(json.stats);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data."
          );
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [page, debouncedSearchQuery, statusFilter, refreshTrigger, isAcademicOrInstructor]);

  // Fetch vacancies for create form
  useEffect(() => {
    let isMounted = true;
    if (createModalOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVacanciesLoading(true);
      fetch("/api/vacancies")
        .then(res => res.json())
        .then(data => {
          if (!isMounted) return;
          if (Array.isArray(data)) {
            setAvailableVacancies(data);
          } else if (data && Array.isArray(data.data)) {
            setAvailableVacancies(data.data);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setVacanciesLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [createModalOpen]);

  // Fetch students for create form (staff only)
  useEffect(() => {
    let isMounted = true;
    if (createModalOpen && !isStudent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStudentsLoading(true);
      fetch("/api/students?limit=100")
        .then(res => res.json())
        .then(data => {
          if (!isMounted) return;
          const list = Array.isArray(data) ? data : data?.data || [];
          if (Array.isArray(list)) {
            setAvailableStudents(
              list.map((s: { id: string; name: string; nim: string }) => ({
                id: s.id,
                name: s.name,
                nim: s.nim,
              }))
            );
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setStudentsLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [createModalOpen, isStudent]);

  // Computed stats: uses server aggregate apiStats when available, falls back to loaded list
  const studentTotal = apiStats ? apiStats.total : applications.length;
  const studentActiveCount = apiStats
    ? apiStats.active
    : applications.filter((a) =>
        ["APPLIED", "SCREENING", "INTERVIEW"].includes(a.status)
      ).length;
  const studentSelectedCount = apiStats
    ? apiStats.selected
    : applications.filter((a) => a.status === "SELECTED").length;
  const studentRejectedCount = apiStats
    ? apiStats.closed
    : applications.filter((a) =>
        ["REJECTED", "WITHDRAWN"].includes(a.status)
      ).length;

  // Counts for Staff view
  const staffTotal = apiStats ? apiStats.total : applications.length;
  const staffScreeningCount = apiStats
    ? apiStats.screening
    : applications.filter((a) => a.status === "SCREENING").length;
  const staffInterviewCount = apiStats
    ? apiStats.interview
    : applications.filter((a) => a.status === "INTERVIEW").length;
  const staffSelectedCount = apiStats
    ? apiStats.selected
    : applications.filter((a) => a.status === "SELECTED").length;
  const staffClosedCount = apiStats
    ? apiStats.closed
    : applications.filter((a) =>
        ["REJECTED", "WITHDRAWN"].includes(a.status)
      ).length;

  // Handle Student Withdraw
  const handleConfirmWithdraw = async () => {
    if (!withdrawModalApp) return;
    setWithdrawLoading(true);
    setWithdrawError("");

    try {
      const res = await fetch(`/api/applications/${withdrawModalApp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "WITHDRAWN" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Gagal menarik lamaran.");
      }

      setNotice(
        `Lamaran untuk posisi "${withdrawModalApp.vacancy.title}" berhasil ditarik.`
      );
      setWithdrawModalApp(null);
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
    if (!transitionModal) return;
    setTransitionLoading(true);
    setTransitionError("");

    try {
      const res = await fetch(`/api/applications/${transitionModal.app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: transitionModal.targetStatus }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Gagal memperbarui status.");
      }

      setNotice(
        `Status kandidat "${transitionModal.app.student.name}" berhasil diubah menjadi ${
          APPLICATION_STATUS_LABELS[transitionModal.targetStatus]
        }.`
      );
      setTransitionModal(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setTransitionError(
        err instanceof Error ? err.message : "Gagal memperbarui status."
      );
    } finally {
      setTransitionLoading(false);
    }
  };

  // Handle Create Application
  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (!createVacancyId.trim()) {
      setCreateError("ID Lowongan kerja wajib diisi.");
      return;
    }

    if (!isStudent && !createStudentId.trim()) {
      setCreateError("ID Peserta / Student wajib diisi untuk pembuatan oleh staf.");
      return;
    }

    setCreateLoading(true);

    try {
      const payload: Record<string, string> = {
        vacancyId: createVacancyId.trim(),
      };
      if (!isStudent && createStudentId.trim()) {
        payload.studentId = createStudentId.trim();
      }
      if (createNotes.trim()) {
        payload.notes = createNotes.trim();
      }

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Lowongan tidak ditemukan.");
        } else if (res.status === 409) {
          if (data.message && data.message.includes("closed")) {
            throw new Error("Lowongan ini sudah tidak tersedia untuk dilamar.");
          } else {
            throw new Error("Anda sudah memiliki lamaran untuk lowongan ini.");
          }
        } else if (res.status === 403) {
          throw new Error("Anda tidak memiliki akses untuk melakukan tindakan ini.");
        } else {
          throw new Error(data.message || "Terjadi kesalahan. Silakan coba lagi.");
        }
      }

      setNotice("Lamaran baru berhasil diajukan.");
      setCreateModalOpen(false);
      setCreateVacancyId("");
      setCreateStudentId("");
      setCreateNotes("");
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Terjadi kesalahan sistem."
      );
    } finally {
      setCreateLoading(false);
    }
  };

  // Render Unauthorized
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
            Anda tidak memiliki akses ke modul Lamaran. Silakan hubungi Administrator
            jika Anda memerlukan akses ke halaman ini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
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

      {/* Summary Cards */}
      {isStudent ? (
        <section
          aria-label="Ringkasan Lamaran Saya"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            label="Total Lamaran"
            value={String(studentTotal)}
            description="Riwayat seluruh lamaran yang diajukan"
            icon={FileText}
            tone="navy"
          />
          <StatCard
            label="Lamaran Aktif"
            value={String(studentActiveCount)}
            description="Dalam tahap Applied / Screening / Interview"
            icon={BriefcaseBusiness}
            tone="blue"
          />
          <StatCard
            label="Terpilih (Selected)"
            value={String(studentSelectedCount)}
            description="Kandidat berhasil lolos seleksi"
            icon={CheckCircle2}
            tone="yellow"
          />
          <StatCard
            label="Selesai / Ditolak"
            value={String(studentRejectedCount)}
            description="Lamaran ditarik atau tidak berlanjut"
            icon={XCircle}
            tone="red"
          />
        </section>
      ) : (
        <section
          aria-label="Ringkasan Manajemen Lamaran"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <StatCard
            label="Total Lamaran"
            value={String(staffTotal)}
            description="Semua lamaran yang masuk"
            icon={FileText}
            tone="navy"
          />
          <StatCard
            label="Tahap Screening"
            value={String(staffScreeningCount)}
            description="Proses seleksi berkas/kualifikasi"
            icon={Users}
            tone="yellow"
          />
          <StatCard
            label="Tahap Interview"
            value={String(staffInterviewCount)}
            description="Kandidat terjadwal wawancara"
            icon={Calendar}
            tone="blue"
          />
          <StatCard
            label="Terpilih (Selected)"
            value={String(staffSelectedCount)}
            description="Lolos seleksi untuk penempatan"
            icon={CheckCircle2}
            tone="navy"
          />
          <StatCard
            label="Ditolak / Ditarik"
            value={String(staffClosedCount)}
            description="Lamaran dihentikan atau ditarik"
            icon={XCircle}
            tone="red"
          />
        </section>
      )}

      {/* Filter and Action Bar */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              id="application-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isStudent
                  ? "Cari posisi atau perusahaan..."
                  : "Cari kandidat, NIM, posisi, perusahaan..."
              }
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-slate-400" />
            <select
              id="application-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
            >
              <option value="ALL">Semua Status</option>
              {VALID_APPLICATION_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {APPLICATION_STATUS_LABELS[st]} ({st})
                </option>
              ))}
            </select>
          </div>

          {(searchQuery || statusFilter !== "ALL") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setDebouncedSearchQuery("");
                setStatusFilter("ALL");
                setPage(1);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>
          )}
        </div>

        {/* Action button */}
        {!isManagement && (
          <div>
            <button
              id="btn-open-create-application"
              onClick={() => {
                setCreateError("");
                setCreateVacancyId("");
                setCreateStudentId("");
                setCreateNotes("");
                setCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1a4470]"
            >
              <Plus className="size-4" />
              {isStudent ? "Ajukan Lamaran" : "Tambah Lamaran"}
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="mt-6">
        {loading ? (
          <div
            data-testid="loading-state"
            className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <Loader2 className="size-8 animate-spin text-[#102f50]" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              Memuat data lamaran...
            </p>
          </div>
        ) : error ? (
          <div
            data-testid="error-state"
            className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm"
          >
            <AlertCircle className="size-8 text-[#c94242]" />
            <p className="mt-3 text-base font-semibold text-slate-800">
              Gagal Memuat Data
            </p>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
            <button
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="mt-4 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              Coba Lagi
            </button>
          </div>
        ) : applications.length === 0 ? (
          <div
            data-testid="empty-state"
            className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <FileText className="size-10 text-slate-300" />
            <p className="mt-3 text-base font-semibold text-slate-800">
              {isStudent ? "Belum ada lamaran." : "Belum ada data lamaran."}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {searchQuery || statusFilter !== "ALL"
                ? "Tidak ada lamaran yang cocok dengan kriteria pencarian Anda."
                : isStudent
                ? "Anda belum mengajukan lamaran ke lowongan yang tersedia. Silakan gunakan tombol Ajukan Lamaran dengan ID lowongan yang valid."
                : "Belum ada lamaran yang terdaftar di sistem."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" id="applications-table">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {!isStudent && <th className="px-5 py-3.5">Kandidat</th>}
                    <th className="px-5 py-3.5">Posisi & Perusahaan</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5">Tanggal Melamar</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/70">
                      {/* Candidate info (Staff only) */}
                      {!isStudent && (
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[#102f50]">
                            {app.student.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            NIM: {app.student.nim}
                          </p>
                        </td>
                      )}

                      {/* Vacancy & Employer info */}
                      <td className="px-5 py-4">
                        <Link
                          href={`/applications/${app.id}`}
                          className="font-semibold text-[#102f50] hover:underline"
                        >
                          {app.vacancy.title}
                        </Link>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <Building2 className="size-3.5 text-slate-400" />
                          <span>{app.vacancy.employer.name}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        <ApplicationStatusBadge status={app.status} />
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3 text-slate-400" />
                          {new Date(app.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/applications/${app.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#102f50] hover:text-[#1a4470] hover:underline"
                          >
                            Detail
                            <ExternalLink className="size-3" />
                          </Link>

                          {/* Student: Withdraw button if APPLIED */}
                          {isStudent && app.status === "APPLIED" && (
                            <button
                              data-testid="withdraw-button"
                              onClick={() => {
                                setWithdrawError("");
                                setWithdrawModalApp(app);
                              }}
                              className="rounded bg-rose-50 border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              Tarik Lamaran
                            </button>
                          )}
                          {canDelete && (
                            <SoftDeleteAction
                              endpoint={`/api/applications/${app.id}`}
                              recordName="Lamaran"
                              identifier={`${app.student.name} / ${app.vacancy.title}`}
                              description="Lamaran akan disembunyikan dari data aktif. Riwayat seleksi dan relasi penempatan tetap tersimpan."
                              onDeleted={() => setRefreshTrigger((prev) => prev + 1)}
                            />
                          )}

                          {/* Staff: Fast status transitions if not Management */}
                          {!isStudent && !isManagement && (
                            <>
                              {app.status === "APPLIED" && (
                                <button
                                  data-testid="btn-to-screening"
                                  onClick={() =>
                                    setTransitionModal({
                                      app,
                                      targetStatus: "SCREENING",
                                    })
                                  }
                                  className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                >
                                  Mulai Screening
                                </button>
                              )}
                              {app.status === "SCREENING" && (
                                <>
                                  <button
                                    data-testid="btn-to-interview"
                                    onClick={() =>
                                      setTransitionModal({
                                        app,
                                        targetStatus: "INTERVIEW",
                                      })
                                    }
                                    className="rounded bg-indigo-50 border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                  >
                                    Interview
                                  </button>
                                  <button
                                    data-testid="btn-to-rejected"
                                    onClick={() =>
                                      setTransitionModal({
                                        app,
                                        targetStatus: "REJECTED",
                                      })
                                    }
                                    className="rounded bg-rose-50 border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                  >
                                    Tolak
                                  </button>
                                </>
                              )}
                              {app.status === "INTERVIEW" && (
                                <>
                                  <button
                                    data-testid="btn-to-selected"
                                    onClick={() =>
                                      setTransitionModal({
                                        app,
                                        targetStatus: "SELECTED",
                                      })
                                    }
                                    className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    Pilih Kandidat
                                  </button>
                                  <button
                                    data-testid="btn-to-rejected"
                                    onClick={() =>
                                      setTransitionModal({
                                        app,
                                        targetStatus: "REJECTED",
                                      })
                                    }
                                    className="rounded bg-rose-50 border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                  >
                                    Tolak
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {total > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-4">
                <span className="text-xs text-slate-500">
                  Halaman {page} dari {totalPages} ({total} lamaran)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Student Withdraw Confirmation Modal */}
      {withdrawModalApp && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#102f50]">Tarik Lamaran?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Apakah Anda yakin ingin menarik lamaran untuk posisi{" "}
              <strong>{withdrawModalApp.vacancy.title}</strong> di{" "}
              <strong>{withdrawModalApp.vacancy.employer.name}</strong>?
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Tindakan ini tidak dapat dibatalkan setelah diproses.
            </p>

            {withdrawError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {withdrawError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setWithdrawModalApp(null)}
                disabled={withdrawLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-withdraw"
                onClick={handleConfirmWithdraw}
                disabled={withdrawLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#c94242] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a83434] disabled:opacity-50"
              >
                {withdrawLoading && <Loader2 className="size-3.5 animate-spin" />}
                Tarik Lamaran Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Transition Modal */}
      {transitionModal && (
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
              Ubah status lamaran kandidat{" "}
              <strong>{transitionModal.app.student.name}</strong> menjadi{" "}
              <span className="font-semibold text-[#102f50]">
                {APPLICATION_STATUS_LABELS[transitionModal.targetStatus]}
              </span>
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
                onClick={() => setTransitionModal(null)}
                disabled={transitionLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-transition"
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

      {/* Create Application Modal */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <form
            onSubmit={handleCreateApplication}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#102f50]">
                {isStudent ? "Ajukan Lamaran Kerja" : "Tambah Lamaran Peserta"}
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              {isStudent && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  Pengajuan lamaran melalui lowongan yang tersedia. Pastikan ID lowongan
                  telah sesuai dengan posisi yang ingin Anda tuju.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Lowongan *
                </label>
                <select
                  id="create-application-vacancy-id"
                  value={createVacancyId}
                  onChange={(e) => setCreateVacancyId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50] disabled:bg-slate-50 disabled:text-slate-500"
                  required
                  disabled={vacanciesLoading || createLoading}
                >
                  <option value="" disabled>Pilih Lowongan</option>
                  {availableVacancies.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} — {v.employer?.name || "Perusahaan"}
                    </option>
                  ))}
                </select>
                {vacanciesLoading && (
                  <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Memuat daftar lowongan...
                  </p>
                )}
              </div>

              {!isStudent && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Peserta (Student) *
                  </label>
                  <select
                    id="create-application-student-id"
                    value={createStudentId}
                    onChange={(e) => setCreateStudentId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50] disabled:bg-slate-50 disabled:text-slate-500"
                    required
                    disabled={studentsLoading || createLoading}
                  >
                    <option value="" disabled>
                      Pilih Peserta
                    </option>
                    {availableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.nim})
                      </option>
                    ))}
                  </select>
                  {studentsLoading && (
                    <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> Memuat daftar peserta...
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    Pilih peserta yang akan diajukan ke lowongan kerja ini.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Catatan Pengajuan (Opsional)
                </label>
                <textarea
                  id="create-application-notes"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  rows={3}
                  placeholder="Catatan pendukung atau keterangan lamaran..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                />
              </div>

              {createError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  {createError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={createLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                id="btn-submit-create-application"
                disabled={createLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470] disabled:opacity-50"
              >
                {createLoading && <Loader2 className="size-3.5 animate-spin" />}
                {isStudent ? "Kirim Lamaran" : "Simpan Lamaran"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
