"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Award,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  Loader2,
  PieChart,
  RotateCcw,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

type BatchOption = {
  id: string;
  name: string;
};

type AcademicReportData = {
  totalStudents: number;
  totalBatches: number;
  totalPrograms: number;
  totalClasses: number;
  activeEnrollments: number;
  totalEnrollments: number;
  attendanceRate: number | null;
  totalAttendanceRecords: number;
  averageAssessmentScore: number | null;
  totalScoreRecords: number;
  assignmentsSummary: {
    totalAssignments: number;
    statusBreakdown: {
      DRAFT: number;
      PUBLISHED: number;
      CLOSED: number;
    };
    totalSubmissions: number;
    submissionStatusBreakdown: {
      SUBMITTED: number;
      LATE: number;
      GRADED: number;
      RESUBMITTED: number;
    };
    averageSubmissionScore: number | null;
    totalGradedSubmissions: number;
  };
  availableBatches?: BatchOption[];
  appliedFilters?: {
    batchId: string | null;
    startDate: string | null;
    endDate: string | null;
  };
};

type AttendanceReportData = {
  totalSchedules: number;
  scheduleStatusBreakdown: {
    SCHEDULED: number;
    COMPLETED: number;
    CANCELLED: number;
  };
  totalRecords: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  absenceBreakdown: {
    sick: number;
    permitted: number;
    unexcused: number;
  };
  overallAttendanceRate: number | null;
  batchRates: Array<{
    batchId: string;
    batchName: string;
    totalRecords: number;
    attendanceRate: number | null;
  }>;
  availableBatches?: BatchOption[];
  appliedFilters?: {
    batchId: string | null;
    startDate: string | null;
    endDate: string | null;
  };
};

type PlacementReportData = {
  totalApplications: number;
  totalInterviews: number;
  totalPlacements: number;
  totalVacancies: number;
  totalEmployers: number;
  applicationFunnel: {
    APPLIED: number;
    SCREENING: number;
    INTERVIEW: number;
    SELECTED: number;
    REJECTED: number;
    WITHDRAWN: number;
  };
  interviewStatusDistribution: {
    PENDING: number;
    PASSED: number;
    FAILED: number;
    RESCHEDULED: number;
  };
  placementStatusDistribution: {
    PREPARATION: number;
    READY: number;
    DEPARTED: number;
    PLACED: number;
    CANCELLED: number;
  };
  appliedFilters?: {
    startDate: string | null;
    endDate: string | null;
  };
};

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  APPLIED: "Terkirim",
  SCREENING: "Seleksi Berkas",
  INTERVIEW: "Wawancara",
  SELECTED: "Terpilih",
  REJECTED: "Ditolak",
  WITHDRAWN: "Dibatalkan",
};

const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: "Menunggu",
  PASSED: "Lulus",
  FAILED: "Tidak Lulus",
  RESCHEDULED: "Dijadwalkan Ulang",
};

const PLACEMENT_STATUS_LABELS: Record<string, string> = {
  PREPARATION: "Persiapan",
  READY: "Siap Berangkat",
  DEPARTED: "Berangkat",
  PLACED: "Ditempatkan",
  CANCELLED: "Dibatalkan",
};

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draf",
  PUBLISHED: "Terbit",
  CLOSED: "Ditutup",
};

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Terkirim Tepat Waktu",
  LATE: "Terkirim Terlambat",
  GRADED: "Sudah Dinilai",
  RESUBMITTED: "Pengumpulan Ulang",
};

const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Terjadwal",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

type TabKey = "academic" | "attendance" | "placement";

export function ReportsPage({ initialRole }: { initialRole?: string }) {
  const [userRole, setUserRole] = useState<string | null>(initialRole ?? null);
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    initialRole === "PLACEMENT_STAFF" ? "placement" : "academic",
  );
  const [sessionLoading, setSessionLoading] = useState(!initialRole);

  // Filter states
  const [selectedBatchId, setSelectedBatchId] = useState<string>("ALL");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (activeTab !== "placement" && selectedBatchId && selectedBatchId !== "ALL") count++;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    return count;
  }, [activeTab, selectedBatchId, filterStartDate, filterEndDate]);

  // Available batches list from API
  const [availableBatches, setAvailableBatches] = useState<BatchOption[]>([]);

  // Data states
  const [academicData, setAcademicData] = useState<AcademicReportData | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceReportData | null>(null);
  const [placementData, setPlacementData] = useState<PlacementReportData | null>(null);

  // Status states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load session to identify user role if initialRole wasn't provided
  useEffect(() => {
    if (initialRole) return;

    let isMounted = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        const role = data?.user?.role || "";
        setUserRole(role);

        if (role === "PLACEMENT_STAFF") {
          setActiveTab("placement");
        } else {
          setActiveTab("academic");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setSessionLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialRole]);

  // Determine allowed tabs based on role
  const allowedTabs: TabKey[] = useMemo(() => {
    if (!userRole) return [];
    if (["SUPER_ADMIN", "ADMIN", "MANAGEMENT"].includes(userRole)) {
      return ["academic", "attendance", "placement"];
    }
    if (userRole === "ACADEMIC_STAFF") {
      return ["academic", "attendance"];
    }
    if (userRole === "PLACEMENT_STAFF") {
      return ["placement"];
    }
    return [];
  }, [userRole]);

  // Build query string for active tab
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (activeTab === "academic" || activeTab === "attendance") {
      if (selectedBatchId && selectedBatchId !== "ALL") {
        params.set("batchId", selectedBatchId);
      }
    }
    if (filterStartDate) {
      params.set("startDate", filterStartDate);
    }
    if (filterEndDate) {
      params.set("endDate", filterEndDate);
    }
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [activeTab, selectedBatchId, filterStartDate, filterEndDate]);

  // Fetch report data
  const fetchData = () => {
    if (!userRole || allowedTabs.length === 0) return;
    if (!allowedTabs.includes(activeTab)) return;

    setLoading(true);
    setError(null);

    let endpoint = "";
    if (activeTab === "academic") endpoint = `/api/reports/academic${queryString}`;
    else if (activeTab === "attendance") endpoint = `/api/reports/attendance${queryString}`;
    else if (activeTab === "placement") endpoint = `/api/reports/placement${queryString}`;

    fetch(endpoint)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) throw new Error("Akses ke laporan ini dibatasi");
          if (res.status === 400) {
            const errJson = await res.json().catch(() => null);
            throw new Error(errJson?.error || "Parameter filter tidak valid");
          }
          throw new Error("Gagal memuat data laporan");
        }
        return res.json();
      })
      .then((json) => {
        if (activeTab === "academic") {
          setAcademicData(json.data);
          if (json.data?.availableBatches && json.data.availableBatches.length > 0) {
            setAvailableBatches(json.data.availableBatches);
          }
        } else if (activeTab === "attendance") {
          setAttendanceData(json.data);
          if (json.data?.availableBatches && json.data.availableBatches.length > 0) {
            setAvailableBatches(json.data.availableBatches);
          }
        } else if (activeTab === "placement") {
          setPlacementData(json.data);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // Trigger fetch when tab or query string changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, queryString, userRole]);

  const handleResetFilters = () => {
    setSelectedBatchId("ALL");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  if (sessionLoading) {
    return (
      <div data-testid="loading-state" className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-[#EEEEEE] bg-white p-8">
          <Loader2 className="size-8 animate-spin text-[#BF120E]" />
          <p className="mt-3 text-sm text-slate-500">Memeriksa hak akses laporan...</p>
        </div>
      </div>
    );
  }

  // Unauthorized for roles without any report access
  if (allowedTabs.length === 0) {
    return (
      <div data-testid="unauthorized-state" className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-[#EEEEEE] bg-white p-8 text-center">
          <ShieldAlert className="size-12 text-[#BF120E]" />
          <h2 className="mt-4 text-base font-semibold text-[#1B1B1B]">Akses Ditolak</h2>
          <p className="mt-2 text-sm text-slate-500">
            Anda tidak memiliki akses ke modul Laporan Eksekutif GHS.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1B1B1B] sm:text-2xl">Laporan & Statistik</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ringkasan analitik dan metrik operasional langsung dari basis data sistem informasi GHS
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 font-medium">
            Cakupan Batch: {selectedBatchId === "ALL" ? "Semua Batch" : (availableBatches.find((b) => b.id === selectedBatchId)?.name || selectedBatchId)}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 font-medium">
            Rentang Waktu: {filterStartDate || filterEndDate ? `${filterStartDate || "Awal"} s/d ${filterEndDate || "Sekarang"}` : "Semua Waktu"}
          </span>
        </div>
      </div>

      {/* Role-Aware Navigation Tabs */}
      <div className="mb-6 flex flex-wrap border-b border-[#EEEEEE]">
        {allowedTabs.includes("academic") && (
          <button
            type="button"
            data-testid="tab-academic"
            onClick={() => setActiveTab("academic")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "academic"
                ? "border-[#BF120E] text-[#BF120E]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <GraduationCap className="size-4" />
            Akademik & Tugas
          </button>
        )}

        {allowedTabs.includes("attendance") && (
          <button
            type="button"
            data-testid="tab-attendance"
            onClick={() => setActiveTab("attendance")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "attendance"
                ? "border-[#BF120E] text-[#BF120E]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <CheckCircle2 className="size-4" />
            Jadwal & Kehadiran
          </button>
        )}

        {allowedTabs.includes("placement") && (
          <button
            type="button"
            data-testid="tab-placement"
            onClick={() => setActiveTab("placement")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "placement"
                ? "border-[#BF120E] text-[#BF120E]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <BriefcaseBusiness className="size-4" />
            Penempatan Kerja
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="mb-6 rounded-lg border border-[#EEEEEE] bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase">
              <Filter className="size-3.5 text-slate-500" />
              Filter Laporan
            </span>

            {/* Batch Filter (Academic & Attendance only) */}
            {activeTab !== "placement" && (
              <div className="flex items-center gap-2">
                <label htmlFor="filter-batch" className="text-xs text-slate-500">
                  Batch:
                </label>
                <select
                  id="filter-batch"
                  data-testid="filter-batch"
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="rounded-md border border-[#EEEEEE] bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-[#BF120E] focus:outline-none"
                >
                  <option value="ALL">Semua Batch</option>
                  {availableBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Range Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="filter-start-date" className="text-xs text-slate-500">
                Dari:
              </label>
              <input
                id="filter-start-date"
                data-testid="filter-start-date"
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="rounded-md border border-[#EEEEEE] bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#BF120E] focus:outline-none"
              />

              <label htmlFor="filter-end-date" className="text-xs text-slate-500">
                Sampai:
              </label>
              <input
                id="filter-end-date"
                data-testid="filter-end-date"
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="rounded-md border border-[#EEEEEE] bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#BF120E] focus:outline-none"
              />
            </div>
          </div>

          {/* Reset button & filter count */}
          <div className="flex items-center gap-3">
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-[#BF120E]/10 px-2.5 py-1 text-xs font-medium text-[#BF120E]">
                {activeFiltersCount} filter aktif
              </span>
            )}

            {activeFiltersCount > 0 && (
              <button
                type="button"
                data-testid="btn-reset-filter"
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#BF120E]"
              >
                <RotateCcw className="size-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div
          data-testid="loading-state"
          className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-[#EEEEEE] bg-white p-8"
        >
          <Loader2 className="size-8 animate-spin text-[#BF120E]" />
          <p className="mt-3 text-sm text-slate-500">Memuat data agregat langsung...</p>
        </div>
      ) : error ? (
        <div
          data-testid="error-state"
          className="flex min-h-[250px] flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 text-center"
        >
          <AlertCircle className="size-10 text-red-600" />
          <p className="mt-3 font-semibold text-red-800">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="mt-4 rounded-md bg-[#BF120E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9E0F0B]"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <>
          {/* ================================================================ */}
          {/* SECTION A: ACADEMIC & ASSIGNMENT REPORT                          */}
          {/* ================================================================ */}
          {activeTab === "academic" && academicData && (
            <div data-testid="academic-report-section" className="space-y-6">
              {/* Primary Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard
                  label="Total Siswa"
                  value={String(academicData.totalStudents)}
                  description="Siswa terdaftar aktif"
                  icon={Users}
                  tone="navy"
                />
                <StatCard
                  label="Enrollment Aktif"
                  value={String(academicData.activeEnrollments)}
                  description={`Dari ${academicData.totalEnrollments} total enrollment`}
                  icon={UserCheck}
                  tone="yellow"
                />
                <StatCard
                  label="Total Batch"
                  value={String(academicData.totalBatches)}
                  description="Angkatan pelatihan"
                  icon={Layers}
                  tone="blue"
                />
                <StatCard
                  label="Total Kelas"
                  value={String(academicData.totalClasses)}
                  description="Kelas aktif"
                  icon={BookOpen}
                  tone="navy"
                />
                <StatCard
                  label="Tingkat Kehadiran"
                  value={
                    academicData.attendanceRate !== null
                      ? `${academicData.attendanceRate}%`
                      : "Belum ada data"
                  }
                  description={
                    academicData.totalAttendanceRecords > 0
                      ? `${academicData.totalAttendanceRecords} sesi absensi tercatat`
                      : "Belum ada sesi absensi"
                  }
                  icon={CheckCircle2}
                  tone="yellow"
                />
                <StatCard
                  label="Rata-rata Skor"
                  value={
                    academicData.averageAssessmentScore !== null
                      ? String(academicData.averageAssessmentScore)
                      : "Belum ada data"
                  }
                  description={
                    academicData.totalScoreRecords > 0
                      ? `${academicData.totalScoreRecords} nilai evaluasi diinput`
                      : "Belum ada nilai asesmen"
                  }
                  icon={BarChart3}
                  tone="red"
                />
              </div>

              {/* Assignment & Submission Module Summary */}
              <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#1B1B1B]">
                      Ringkasan Tugas & Pengumpulan (Assignment & Submission)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Pemantauan distribusi tugas instruktur dan status pengumpulan siswa secara real-time
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-2 sm:mt-0">
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      Total {academicData.assignmentsSummary.totalAssignments} Tugas
                    </span>
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      Total {academicData.assignmentsSummary.totalSubmissions} Pengumpulan
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {/* Status Tugas Instruktur */}
                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4">
                    <h4 className="text-xs font-semibold text-slate-700 uppercase">
                      Distribusi Status Tugas Instruktur
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Tugas yang dibuat instruktur untuk kelas pada angkatan ini
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {Object.entries(academicData.assignmentsSummary.statusBreakdown).map(
                        ([st, cnt]) => (
                          <div
                            key={st}
                            className="rounded-md border border-[#EEEEEE] bg-white p-3 shadow-xs"
                          >
                            <span className="text-xs font-medium text-slate-600">
                              {ASSIGNMENT_STATUS_LABELS[st] || st}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono">
                              ({st})
                            </span>
                            <p className="mt-1.5 text-lg font-bold text-[#1B1B1B]">{cnt}</p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Status Pengumpulan Siswa */}
                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4">
                    <h4 className="text-xs font-semibold text-slate-700 uppercase">
                      Distribusi Status Pengumpulan Siswa
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Berkas tugas yang telah diunggah siswa ke sistem
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      {Object.entries(
                        academicData.assignmentsSummary.submissionStatusBreakdown,
                      ).map(([st, cnt]) => (
                        <div
                          key={st}
                          className="rounded-md border border-[#EEEEEE] bg-white p-2.5 shadow-xs"
                        >
                          <span className="text-[11px] font-medium text-slate-600 leading-tight block">
                            {SUBMISSION_STATUS_LABELS[st] || st}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-mono">({st})</span>
                          <p className="mt-1 text-base font-bold text-[#1B1B1B]">{cnt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Score Summary & Policy Note */}
                <div className="mt-4 rounded-lg border border-[#EEEEEE] bg-slate-50 p-4 text-xs text-slate-600">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">
                        Rata-rata Skor Tugas yang Telah Dinilai:{" "}
                      </span>
                      {academicData.assignmentsSummary.averageSubmissionScore !== null ? (
                        <span className="font-bold text-[#BF120E] text-sm">
                          {academicData.assignmentsSummary.averageSubmissionScore} / 100
                        </span>
                      ) : (
                        <span className="italic text-slate-400">
                          (Belum ada pengumpulan yang selesai dinilai)
                        </span>
                      )}
                      <span className="ml-2 text-slate-500">
                        ({academicData.assignmentsSummary.totalGradedSubmissions} tugas dinilai)
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 border-t border-slate-200/60 pt-2">
                    <strong>Catatan Aturan Bisnis:</strong> Persentase penyelesaian tugas (completion
                    rate) dan batas kelulusan minimum tidak ditampilkan secara persentase karena
                    aturan bobot tugas dan KKM resmi belum ditetapkan dalam kebijakan manajemen.
                  </p>
                </div>
              </div>

              {/* Academic Overview Box */}
              <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                <h3 className="text-sm font-semibold text-[#1B1B1B]">
                  Ringkasan Operasional Akademik
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Data live dihitung secara agregat tanpa mengekspos informasi rahasia atau PII.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">
                      Tingkat Kehadiran Keseluruhan
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                      {academicData.attendanceRate !== null ? `${academicData.attendanceRate}%` : "Belum ada data"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {academicData.totalAttendanceRecords > 0
                        ? `Berdasarkan ${academicData.totalAttendanceRecords} catatan sesi absensi siswa yang telah terekam (Hadir & Terlambat).`
                        : "Belum ada catatan sesi absensi siswa untuk filter yang dipilih."}
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">
                      Rata-rata Hasil Evaluasi Asesmen
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                      {academicData.averageAssessmentScore !== null ? academicData.averageAssessmentScore : "Belum ada data"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {academicData.totalScoreRecords > 0
                        ? `Berdasarkan ${academicData.totalScoreRecords} nilai ujian/asesmen yang telah diinput instruktur.`
                        : "Belum ada nilai evaluasi yang diinput instruktur untuk filter yang dipilih."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* SECTION B: SCHEDULE & ATTENDANCE REPORT                          */}
          {/* ================================================================ */}
          {activeTab === "attendance" && attendanceData && (
            <div data-testid="attendance-report-section" className="space-y-6">
              {/* Primary Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard
                  label="Total Sesi Jadwal"
                  value={String(attendanceData.totalSchedules)}
                  description="Jadwal kelas pembelajaran"
                  icon={CalendarDays}
                  tone="navy"
                />
                <StatCard
                  label="Total Catatan"
                  value={String(attendanceData.totalRecords)}
                  description="Akumulasi absensi peserta"
                  icon={Clock}
                  tone="blue"
                />
                <StatCard
                  label="Hadir (PRESENT)"
                  value={String(attendanceData.presentCount)}
                  description="Tepat waktu"
                  icon={CheckCircle2}
                  tone="yellow"
                />
                <StatCard
                  label="Terlambat (LATE)"
                  value={String(attendanceData.lateCount)}
                  description="Hadir dengan toleransi"
                  icon={Clock}
                  tone="blue"
                />
                <StatCard
                  label="Absen (ABSENT)"
                  value={String(attendanceData.absentCount)}
                  description="Tidak hadir"
                  icon={AlertCircle}
                  tone="red"
                />
                <StatCard
                  label="Attendance Rate"
                  value={
                    attendanceData.overallAttendanceRate !== null
                      ? `${attendanceData.overallAttendanceRate}%`
                      : "Belum ada data"
                  }
                  description={
                    attendanceData.totalRecords > 0
                      ? `${attendanceData.totalRecords} sesi absensi tercatat`
                      : "Belum ada catatan kehadiran"
                  }
                  icon={PieChart}
                  tone="yellow"
                />
              </div>

              {/* Status Sesi Jadwal & Breakdown Ketidakhadiran */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Jadwal Status Distribution */}
                <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">
                    Distribusi Status Sesi Jadwal
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Status pelaksanaan seluruh sesi jadwal pembelajaran
                  </p>

                  <div className="mt-4 space-y-2.5">
                    {Object.entries(attendanceData.scheduleStatusBreakdown).map(([st, cnt]) => (
                      <div
                        key={st}
                        className="flex items-center justify-between rounded-md border border-[#EEEEEE] bg-[#F3F3F3]/50 px-4 py-2.5"
                      >
                        <span className="text-xs font-medium text-slate-700">
                          {SCHEDULE_STATUS_LABELS[st] || st}{" "}
                          <span className="text-slate-400 font-mono text-[10px]">({st})</span>
                        </span>
                        <span className="text-sm font-semibold text-[#1B1B1B]">{cnt} sesi</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Absence Breakdown */}
                <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">
                    Rincian Ketidakhadiran (Absence Breakdown)
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Klasifikasi ketidakhadiran resmi yang terekam dalam sistem
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4 text-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase">
                        Sakit (SICK)
                      </span>
                      <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                        {attendanceData.absenceBreakdown.sick}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4 text-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase">
                        Izin (PERMITTED)
                      </span>
                      <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                        {attendanceData.absenceBreakdown.permitted}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4 text-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase">
                        Tanpa Keterangan
                      </span>
                      <p className="mt-2 text-2xl font-bold text-[#BF120E]">
                        {attendanceData.absenceBreakdown.unexcused}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tingkat Kehadiran per Batch */}
              <div className="overflow-hidden rounded-lg border border-[#EEEEEE] bg-white">
                <div className="border-b border-[#EEEEEE] px-6 py-4">
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">
                    Tingkat Kehadiran Per Batch Angkatan
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Formula: (Jumlah Hadir + Terlambat) / Total Catatan Kehadiran
                  </p>
                </div>
                {attendanceData.batchRates.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    Belum ada data kehadiran untuk filter yang dipilih.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-[#F3F3F3] text-xs font-semibold text-slate-600 border-b border-[#EEEEEE]">
                        <tr>
                          <th className="px-6 py-3">Nama Batch</th>
                          <th className="px-6 py-3">Total Sesi Absensi</th>
                          <th className="px-6 py-3">Tingkat Kehadiran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEEEEE]">
                        {attendanceData.batchRates.map((b) => (
                          <tr key={b.batchId} className="hover:bg-slate-50/80">
                            <td className="px-6 py-3.5 font-semibold text-slate-800">
                              {b.batchName}
                            </td>
                            <td className="px-6 py-3.5">{b.totalRecords} sesi</td>
                            <td className="px-6 py-3.5">
                              {b.attendanceRate !== null ? (
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-[#1B1B1B]">
                                    {b.attendanceRate}%
                                  </span>
                                  <div className="h-2 w-28 overflow-hidden rounded-md bg-slate-100">
                                    <div
                                      className="h-full rounded-md bg-[#BF120E]"
                                      style={{ width: `${Math.min(b.attendanceRate, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Belum ada data</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="border-t border-[#EEEEEE] bg-slate-50 px-6 py-3 text-[11px] text-slate-500">
                  <strong>Catatan Kebijakan:</strong> Batas minimum persentase kehadiran (misal
                  75% atau 80%) belum ditetapkan dalam SK akademik. Oleh sebab itu, status kelulusan
                  absensi tidak disimpulkan otomatis oleh sistem.
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* SECTION C: CAREER & PLACEMENT REPORT                             */}
          {/* ================================================================ */}
          {activeTab === "placement" && placementData && (
            <div data-testid="placement-report-section" className="space-y-6">
              {/* Primary Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                  label="Mitra Perusahaan"
                  value={String(placementData.totalEmployers)}
                  description="Mitra kerja sama resmi"
                  icon={Building2}
                  tone="navy"
                />
                <StatCard
                  label="Lowongan Kerja"
                  value={String(placementData.totalVacancies)}
                  description="Posisi yang dibuka"
                  icon={BriefcaseBusiness}
                  tone="blue"
                />
                <StatCard
                  label="Total Lamaran"
                  value={String(placementData.totalApplications)}
                  description="Berkas lamaran siswa"
                  icon={FileText}
                  tone="yellow"
                />
                <StatCard
                  label="Total Wawancara"
                  value={String(placementData.totalInterviews)}
                  description="Sesi interview peserta"
                  icon={Users}
                  tone="navy"
                />
                <StatCard
                  label="Total Penempatan"
                  value={String(placementData.totalPlacements)}
                  description="Peserta dalam proses kerja"
                  icon={Award}
                  tone="red"
                />
              </div>

              {/* Application Funnel */}
              <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                <h3 className="text-sm font-semibold text-[#1B1B1B]">
                  Funnel Lamaran Kerja (Application Funnel)
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Pergerakan berkas lamaran siswa dalam seluruh tahapan seleksi rekrutmen mitra
                </p>

                {placementData.totalVacancies === 0 &&
                  placementData.totalEmployers === 0 &&
                  Object.values(placementData.applicationFunnel).every((v) => v === 0) && (
                    <div className="mb-4 rounded-md border border-[#EEEEEE] bg-[#F3F3F3] p-3.5 text-xs text-slate-500">
                      Basis data penempatan karier saat ini masih kosong (0 lowongan & 0 perusahaan
                      mitra terdaftar).
                    </div>
                  )}

                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {Object.entries(placementData.applicationFunnel).map(([stage, count]) => (
                    <div
                      key={stage}
                      className="rounded-md border border-[#EEEEEE] bg-[#F3F3F3]/50 p-3 text-center"
                    >
                      <span className="text-xs font-semibold text-slate-700">
                        {APPLICATION_STATUS_LABELS[stage] || stage}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono">({stage})</span>
                      <p className="mt-1 text-xl font-bold text-[#1B1B1B]">{count}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interview Status & Placement Distribution */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">
                    Distribusi Status Wawancara
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Hasil sesi wawancara yang telah dijadwalkan oleh tim penempatan
                  </p>

                  <div className="mt-4 space-y-2.5">
                    {Object.entries(placementData.interviewStatusDistribution).map(([st, cnt]) => (
                      <div
                        key={st}
                        className="flex items-center justify-between rounded-md border border-[#EEEEEE] bg-[#F3F3F3]/50 px-4 py-2.5"
                      >
                        <span className="text-xs font-medium text-slate-700">
                          {INTERVIEW_STATUS_LABELS[st] || st}{" "}
                          <span className="text-slate-400 font-mono text-[10px]">({st})</span>
                        </span>
                        <span className="text-sm font-semibold text-[#1B1B1B]">{cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">
                    Distribusi Status Penempatan Kerja
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Tahapan progres keberangkatan dan penempatan peserta
                  </p>

                  <div className="mt-4 space-y-2.5">
                    {Object.entries(placementData.placementStatusDistribution).map(([st, cnt]) => (
                      <div
                        key={st}
                        className="flex items-center justify-between rounded-md border border-[#EEEEEE] bg-[#F3F3F3]/50 px-4 py-2.5"
                      >
                        <span className="text-xs font-medium text-slate-700">
                          {PLACEMENT_STATUS_LABELS[st] || st}{" "}
                          <span className="text-slate-400 font-mono text-[10px]">({st})</span>
                        </span>
                        <span className="text-sm font-semibold text-[#1B1B1B]">{cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Placement Policy Note */}
              <div className="rounded-lg border border-[#EEEEEE] bg-slate-50 p-4 text-xs text-slate-600">
                <p className="text-[11px] text-slate-500">
                  <strong>Catatan Aturan Bisnis:</strong> Rasio keberhasilan penempatan kerja
                  (Placement Rate %) tidak dihitung secara persentase karena aturan baku rasio
                  (apakah dihitung terhadap total seluruh lulusan, total siswa aktif, atau hanya
                  siswa yang melamar) belum disahkan oleh manajemen. Angka disajikan dalam bentuk
                  jumlah absolut per status tahapan nyata.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
