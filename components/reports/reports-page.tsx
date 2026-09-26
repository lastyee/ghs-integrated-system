"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  Loader2,
  PieChart,
  ShieldAlert,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

type AcademicReportData = {
  totalStudents: number;
  totalBatches: number;
  totalPrograms: number;
  totalClasses: number;
  attendanceRate: number;
  averageAssessmentScore: number;
  totalScoreRecords: number;
};

type AttendanceReportData = {
  totalRecords: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  absenceBreakdown: {
    sick: number;
    permitted: number;
    unexcused: number;
  };
  overallAttendanceRate: number;
  batchRates: Array<{
    batchId: string;
    batchName: string;
    totalRecords: number;
    attendanceRate: number;
  }>;
};

type PlacementReportData = {
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

type TabKey = "academic" | "attendance" | "placement";

export function ReportsPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("academic");
  const [sessionLoading, setSessionLoading] = useState(true);

  // Data states
  const [academicData, setAcademicData] = useState<AcademicReportData | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceReportData | null>(null);
  const [placementData, setPlacementData] = useState<PlacementReportData | null>(null);

  // Status states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load session to identify user role
  useEffect(() => {
    let isMounted = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        const role = data?.user?.role || "";
        setUserRole(role);

        // Adjust default tab according to role
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
  }, []);

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
    return []; // INSTRUCTOR and STUDENT have no aggregate reports access
  }, [userRole]);

  // Fetch report data for active tab
  useEffect(() => {
    if (!userRole || allowedTabs.length === 0) return;
    if (!allowedTabs.includes(activeTab)) return;

    let isMounted = true;

    let endpoint = "";
    if (activeTab === "academic") endpoint = "/api/reports/academic";
    else if (activeTab === "attendance") endpoint = "/api/reports/attendance";
    else if (activeTab === "placement") endpoint = "/api/reports/placement";

    fetch(endpoint)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) throw new Error("Akses ke laporan ini dibatasi");
          throw new Error("Gagal memuat data laporan");
        }
        const json = await res.json();
        if (!isMounted) return;

        if (activeTab === "academic") setAcademicData(json.data);
        else if (activeTab === "attendance") setAttendanceData(json.data);
        else if (activeTab === "placement") setPlacementData(json.data);
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, userRole, allowedTabs]);

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

  // Unauthorized for roles without any report access (INSTRUCTOR, STUDENT, unauth)
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
          Ringkasan analitik dan metrik langsung dari basis data sistem informasi GHS
        </p>
      </div>

      {/* Role-Aware Navigation Tabs */}
      <div className="mb-6 flex border-b border-[#EEEEEE]">
        {allowedTabs.includes("academic") && (
          <button
            type="button"
            data-testid="tab-academic"
            onClick={() => {
              setActiveTab("academic");
              setLoading(true);
              setError(null);
            }}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "academic"
                ? "border-[#BF120E] text-[#BF120E]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <GraduationCap className="size-4" />
            Laporan Akademik
          </button>
        )}

        {allowedTabs.includes("attendance") && (
          <button
            type="button"
            data-testid="tab-attendance"
            onClick={() => {
              setActiveTab("attendance");
              setLoading(true);
              setError(null);
            }}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "attendance"
                ? "border-[#BF120E] text-[#BF120E]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <CheckCircle2 className="size-4" />
            Laporan Kehadiran
          </button>
        )}

        {allowedTabs.includes("placement") && (
          <button
            type="button"
            data-testid="tab-placement"
            onClick={() => {
              setActiveTab("placement");
              setLoading(true);
              setError(null);
            }}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "placement"
                ? "border-[#BF120E] text-[#BF120E]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <BriefcaseBusiness className="size-4" />
            Laporan Penempatan
          </button>
        )}
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
        </div>
      ) : (
        <>
          {/* SECTION A: ACADEMIC REPORT */}
          {activeTab === "academic" && academicData && (
            <div data-testid="academic-report-section" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard
                  label="Total Siswa"
                  value={String(academicData.totalStudents)}
                  description="Siswa terdaftar aktif"
                  icon={Users}
                  tone="navy"
                />
                <StatCard
                  label="Total Batch"
                  value={String(academicData.totalBatches)}
                  description="Batch pelatihan"
                  icon={Layers}
                  tone="yellow"
                />
                <StatCard
                  label="Total Program"
                  value={String(academicData.totalPrograms)}
                  description="Program studi resmi"
                  icon={GraduationCap}
                  tone="navy"
                />
                <StatCard
                  label="Total Kelas"
                  value={String(academicData.totalClasses)}
                  description="Kelas terdaftar"
                  icon={BookOpen}
                  tone="blue"
                />
                <StatCard
                  label="Tingkat Kehadiran"
                  value={`${academicData.attendanceRate}%`}
                  description="Rasio hadir & telat"
                  icon={CheckCircle2}
                  tone="yellow"
                />
                <StatCard
                  label="Rata-rata Skor"
                  value={String(academicData.averageAssessmentScore)}
                  description="Skor penilaian live"
                  icon={BarChart3}
                  tone="red"
                />
              </div>

              <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                <h3 className="text-sm font-semibold text-[#1B1B1B]">Ringkasan Eksekutif Akademik</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Data live dihitung secara agregat tanpa mengekspos informasi rahasia atau PII.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">
                      Tingkat Kehadiran Keseluruhan
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                      {academicData.attendanceRate}%
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Berdasarkan seluruh sesi absensi yang telah tercatat pada jadwal.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">
                      Rata-rata Hasil Penilaian
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                      {academicData.averageAssessmentScore}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Total {academicData.totalScoreRecords} nilai evaluasi yang telah diinput instruktur.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION B: ATTENDANCE REPORT */}
          {activeTab === "attendance" && attendanceData && (
            <div data-testid="attendance-report-section" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                  label="Total Catatan"
                  value={String(attendanceData.totalRecords)}
                  description="Sesi kehadiran peserta"
                  icon={CalendarDays}
                  tone="navy"
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
                  value={`${attendanceData.overallAttendanceRate}%`}
                  description="Rasio kehadiran global"
                  icon={PieChart}
                  tone="yellow"
                />
              </div>

              {/* Breakdown Absensi */}
              <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                <h3 className="text-sm font-semibold text-[#1B1B1B]">Rincian Ketidakhadiran (Absence Breakdown)</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Klasifikasi ketidakhadiran resmi yang terekam dalam sistem
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4 text-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Sakit (SICK)</span>
                    <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                      {attendanceData.absenceBreakdown.sick}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4 text-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Izin (PERMITTED)</span>
                    <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                      {attendanceData.absenceBreakdown.permitted}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/50 p-4 text-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase">
                      Tanpa Keterangan (UNEXCUSED)
                    </span>
                    <p className="mt-2 text-2xl font-bold text-[#BF120E]">
                      {attendanceData.absenceBreakdown.unexcused}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tingkat Kehadiran per Batch */}
              <div className="overflow-hidden rounded-lg border border-[#EEEEEE] bg-white">
                <div className="border-b border-[#EEEEEE] px-6 py-4">
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">Tingkat Kehadiran Per Batch Angkatan</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Perhitungan rasio kehadiran siswa untuk masing-masing batch
                  </p>
                </div>
                {attendanceData.batchRates.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    Belum ada data kehadiran per batch.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-[#F3F3F3] text-xs font-semibold text-slate-600 border-b border-[#EEEEEE]">
                        <tr>
                          <th className="px-6 py-3">Nama Batch</th>
                          <th className="px-6 py-3">Total Sesi Tercatat</th>
                          <th className="px-6 py-3">Tingkat Kehadiran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEEEEE]">
                        {attendanceData.batchRates.map((b) => (
                          <tr key={b.batchId} className="hover:bg-slate-50/80">
                            <td className="px-6 py-3.5 font-semibold text-slate-800">{b.batchName}</td>
                            <td className="px-6 py-3.5">{b.totalRecords} sesi</td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <span className="font-semibold text-[#1B1B1B]">{b.attendanceRate}%</span>
                                <div className="h-2 w-28 overflow-hidden rounded-md bg-slate-100">
                                  <div
                                    className="h-full rounded-md bg-[#BF120E]"
                                    style={{ width: `${Math.min(b.attendanceRate, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION C: PLACEMENT REPORT */}
          {activeTab === "placement" && placementData && (
            <div data-testid="placement-report-section" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Total Lowongan Kerja"
                  value={String(placementData.totalVacancies)}
                  description="Lowongan dari mitra industri"
                  icon={BriefcaseBusiness}
                  tone="navy"
                />
                <StatCard
                  label="Total Perusahaan Mitra"
                  value={String(placementData.totalEmployers)}
                  description="Mitra kerja sama GHS"
                  icon={Building2}
                  tone="yellow"
                />
              </div>

              {/* Application Funnel */}
              <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
                <h3 className="text-sm font-semibold text-[#1B1B1B]">Funnel Lamaran Kerja (Application Funnel)</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Pergerakan peserta dalam tahap seleksi dan rekrutmen kerja
                </p>

                {placementData.totalVacancies === 0 &&
                  placementData.totalEmployers === 0 &&
                  Object.values(placementData.applicationFunnel).every((v) => v === 0) && (
                    <div className="mb-4 rounded-md border border-[#EEEEEE] bg-[#F3F3F3] p-3.5 text-xs text-slate-500">
                      Basis data penempatan karier saat ini masih kosong (0 lowongan & 0 perusahaan mitra terdaftar).
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
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">Distribusi Status Wawancara</h3>
                  <p className="mt-1 text-xs text-slate-500">Hasil sesi wawancara yang telah dilakukan</p>

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
                  <h3 className="text-sm font-semibold text-[#1B1B1B]">Distribusi Status Penempatan</h3>
                  <p className="mt-1 text-xs text-slate-500">Tahapan penempatan kerja peserta</p>

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
            </div>
          )}
        </>
      )}
    </div>
  );
}
