"use client";

import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Loader2,
  Lock,
  RotateCcw,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";

export interface ApiScheduleSummary {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  dressCode: string | null;
  topic: string | null;
  status: string;
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
  instructor: {
    id: string;
    name: string;
  };
}

export interface ApiAttendanceItem {
  id: string;
  scheduleId: string;
  studentId: string;
  status: "PRESENT" | "LATE" | "ABSENT";
  absenceType: "SICK" | "PERMITTED" | "UNEXCUSED" | null;
  lateMinutes: number | null;
  notes: string | null;
  student: {
    id: string;
    nim: string;
    name: string;
  };
}

type SessionStatus = "OPEN" | "COMPLETED";

function formatUtcDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.substring(0, 10).split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
      "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
    ];
    return `${days[d.getUTCDay()]}, ${day} ${months[month - 1]} ${year}`;
  } catch {
    return dateStr.substring(0, 10);
  }
}

function formatUtcTime(timeStr: string): string {
  if (!timeStr) return "-";
  if (timeStr.includes("T")) {
    return timeStr.split("T")[1].substring(0, 5);
  }
  return timeStr.substring(0, 5);
}

export function AttendancePage() {
  const [schedules, setSchedules] = useState<ApiScheduleSummary[]>([]);
  const [attendances, setAttendances] = useState<ApiAttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authErrorStatus, setAuthErrorStatus] = useState<401 | 403 | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [date, setDate] = useState("ALL");
  const [batch, setBatch] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [instructor, setInstructor] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | SessionStatus>("ALL");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    totalSchedules: 0,
    completedSchedules: 0,
    openSchedules: 0,
    totalAttendances: 0,
  });

  const [filterDates, setFilterDates] = useState<string[]>([]);
  const [filterBatches, setFilterBatches] = useState<string[]>([]);
  const [filterSubjects, setFilterSubjects] = useState<string[]>([]);
  const [filterInstructors, setFilterInstructors] = useState<string[]>([]);

  const handleReload = () => {
    setLoading(true);
    setError(null);
    setAuthErrorStatus(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      setLoading(true);
      try {
        const schedParams = new URLSearchParams({
          page: page.toString(),
          limit: "20",
          ...(debouncedQuery ? { search: debouncedQuery } : {}),
          ...(status !== "ALL" ? { status } : {}),
          ...(date !== "ALL" ? { date } : {}),
          ...(batch !== "ALL" ? { batch } : {}),
          ...(subject !== "ALL" ? { subject } : {}),
          ...(instructor !== "ALL" ? { instructor } : {}),
        });

        const schedRes = await fetch(`/api/schedules?${schedParams.toString()}`, { headers: { Accept: "application/json" } });

        if (ignore) return;

        if (schedRes.status === 401 || schedRes.status === 403) {
          setAuthErrorStatus(schedRes.status as 401 | 403);
          const data = await schedRes.json().catch(() => ({}));
          setError(
            data.error ||
              (schedRes.status === 401
                ? "Sesi Anda berakhir. Silakan login kembali."
                : "Akses tidak diizinkan untuk membaca data absensi."),
          );
          return;
        }

        if (!schedRes.ok) {
          const data = await schedRes.json().catch(() => ({}));
          setError(data.error || `Gagal memuat jadwal (HTTP ${schedRes.status})`);
          return;
        }

        const schedJson = await schedRes.json();
        if (ignore) return;

        const fetchedSchedules = Array.isArray(schedJson.data) ? schedJson.data : [];
        setSchedules(fetchedSchedules);
        setTotal(schedJson.pagination?.total || 0);
        setTotalPages(schedJson.pagination?.totalPages || 1);
        setFilterDates(["ALL", ...(schedJson.filterOptions?.dates || [])]);
        setFilterBatches(["ALL", ...(schedJson.filterOptions?.batches || [])]);
        setFilterSubjects(["ALL", ...(schedJson.filterOptions?.subjects || [])]);
        setFilterInstructors(["ALL", ...(schedJson.filterOptions?.instructors || [])]);

        // Fetch attendances for these schedules + global stats
        if (fetchedSchedules.length === 0) {
          setAttendances([]);
          // Fetch global stats with scheduleIds="" so no attendances are queried
          const attRes = await fetch(`/api/attendances?limit=1&scheduleIds=`, {
            headers: { Accept: "application/json" },
          });
          if (attRes.ok) {
            const attJson = await attRes.json();
            if (!ignore && attJson.stats) {
              setStats(attJson.stats);
            }
          }
        } else {
          const scheduleIds = fetchedSchedules.map((s: ApiScheduleSummary) => s.id).join(",");
          const attParams = new URLSearchParams({ limit: "1000", scheduleIds });

          const attRes = await fetch(`/api/attendances?${attParams.toString()}`, {
            headers: { Accept: "application/json" },
          });
          if (!attRes.ok) {
            // Silently fail or log, but continue to show schedules
            console.error("Failed to load attendances");
          } else {
            const attJson = await attRes.json();
            if (!ignore) {
              setAttendances(Array.isArray(attJson.data) ? attJson.data : []);
              if (attJson.stats) {
                setStats(attJson.stats);
              }
            }
          }
        }
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      ignore = true;
    };
  }, [reloadKey, page, debouncedQuery, status, date, batch, subject, instructor]);

  const attendancesBySchedule = useMemo(() => {
    const map = new Map<string, ApiAttendanceItem[]>();
    for (const att of attendances) {
      const list = map.get(att.scheduleId) ?? [];
      list.push(att);
      map.set(att.scheduleId, list);
    }
    return map;
  }, [attendances]);

  const options = useMemo(() => {
    return { dates: filterDates, batches: filterBatches, subjects: filterSubjects, instructors: filterInstructors };
  }, [filterDates, filterBatches, filterSubjects, filterInstructors]);

  const resetFilters = () => {
    setQuery("");
    setDate("ALL");
    setBatch("ALL");
    setSubject("ALL");
    setInstructor("ALL");
    setStatus("ALL");
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Attendance</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102f50]">Attendance Sesi</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola dan pantau kehadiran mahasiswa pada setiap sesi training resmi GHS
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Statistik kehadiran">
        <StatCard
          label="Total Sesi"
          value={String(stats.totalSchedules)}
          description="Sesi training terdaftar"
          icon={CalendarDays}
          tone="navy"
        />
        <StatCard
          label="Sudah Diisi"
          value={String(stats.completedSchedules)}
          description="Sesi dengan absensi"
          icon={CheckCircle2}
          tone="blue"
        />
        <StatCard
          label="Belum Diisi"
          value={String(stats.openSchedules)}
          description="Sesi menunggu absensi"
          icon={Clock}
          tone="yellow"
        />
        <StatCard
          label="Rekam Absensi"
          value={String(stats.totalAttendances)}
          description="Total data kehadiran"
          icon={CalendarDays}
          tone="red"
        />
      </section>

      {/* Filter Bar */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] xl:items-end">
          <label className="block min-w-0 sm:col-span-2 md:col-span-3 lg:col-span-2 xl:col-span-1">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Cari Sesi</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari subject, class, batch"
                className="h-10 w-full min-w-0 rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#102f50] focus:outline-none"
              />
            </span>
          </label>
          <FilterSelect label="Tanggal" value={date} onChange={(v) => { setDate(v); setPage(1); }} options={options.dates} />
          <FilterSelect label="Batch" value={batch} onChange={(v) => { setBatch(v); setPage(1); }} options={options.batches} />
          <FilterSelect label="Subject" value={subject} onChange={(v) => { setSubject(v); setPage(1); }} options={options.subjects} />
          <FilterSelect label="Instructor" value={instructor} onChange={(v) => { setInstructor(v); setPage(1); }} options={options.instructors} />
          <FilterSelect
            label="Status Sesi"
            value={status}
            onChange={(v) => { setStatus(v as "ALL" | SessionStatus); setPage(1); }}
            options={["ALL", "OPEN", "COMPLETED"]}
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 xl:w-auto"
          >
            <RotateCcw className="size-4" />
            Reset
          </button>
        </div>
      </section>

      {/* Main Table / State Section */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-[#102f50]">Daftar Sesi Attendance</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Memuat data dari database..." : `${total} sesi ditampilkan`}
          </p>
        </div>

        {/* 1. Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <Loader2 className="size-8 animate-spin text-[#102f50]" />
            <p className="mt-3 text-sm font-medium text-slate-700">Memuat sesi absensi...</p>
            <p className="mt-1 text-xs text-slate-500">Mengambil data dari server</p>
          </div>
        )}

        {/* 2. Unauthorized State */}
        {!loading && authErrorStatus !== null && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-amber-100 p-3 text-amber-700">
              <Lock className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">
              {authErrorStatus === 401 ? "Login Diperlukan" : "Akses Ditolak"}
            </h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {error ||
                (authErrorStatus === 401
                  ? "Sesi Anda berakhir. Silakan login kembali."
                  : "Anda tidak memiliki izin untuk melihat data kehadiran.")}
            </p>
            {authErrorStatus === 401 && (
              <Link
                href="/login"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
              >
                Login Ulang
              </Link>
            )}
          </div>
        )}

        {/* 3. Error State */}
        {!loading && authErrorStatus === null && error && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-red-100 p-3 text-red-600">
              <AlertCircle className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Gagal Memuat Data</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={handleReload}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-xs font-semibold text-white hover:bg-[#b03636]"
            >
              <RotateCcw className="size-3.5" />
              Coba Lagi
            </button>
          </div>
        )}

        {/* 4. Empty State */}
        {!loading && !error && schedules.length === 0 && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-slate-100 p-3 text-slate-400">
              <Filter className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Tidak Ada Sesi</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {schedules.length === 0
                ? "Belum ada jadwal training yang terdaftar."
                : "Tidak ada sesi attendance yang sesuai dengan filter pencarian."}
            </p>
            {schedules.length > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset Filter
              </button>
            )}
          </div>
        )}

        {/* 5. Successful Data */}
        {!loading && !error && schedules.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-225 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Tanggal</th>
                    <th className="px-5 py-3 font-semibold">Waktu</th>
                    <th className="px-5 py-3 font-semibold">Subject</th>
                    <th className="px-5 py-3 font-semibold">Batch</th>
                    <th className="px-5 py-3 font-semibold">Instructor</th>
                    <th className="px-5 py-3 font-semibold">Rekap Kehadiran</th>
                    <th className="px-5 py-3 font-semibold">Status Sesi</th>
                    <th className="px-5 py-3 font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedules.map((item) => {
                    const records = attendancesBySchedule.get(item.id) ?? [];
                    return (
                      <SessionRow
                        key={item.id}
                        schedule={item}
                        records={records}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {schedules.map((item) => {
                const records = attendancesBySchedule.get(item.id) ?? [];
                return (
                  <SessionCard
                    key={item.id}
                    schedule={item}
                    records={records}
                  />
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                <span className="text-sm text-slate-500">
                  Halaman {page} dari {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
      >
        <option value="ALL">Semua {label}</option>
        {options
          .filter((opt) => opt !== "ALL")
          .map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
      </select>
    </label>
  );
}

function getStatusSummary(records: ApiAttendanceItem[]) {
  if (records.length === 0) return "Belum diisi";

  const counts = {
    PRESENT: 0,
    LATE: 0,
    SICK: 0,
    PERMITTED: 0,
    UNEXCUSED: 0,
  };

  for (const r of records) {
    if (r.status === "PRESENT") counts.PRESENT++;
    else if (r.status === "LATE") counts.LATE++;
    else if (r.status === "ABSENT") {
      if (r.absenceType === "SICK") counts.SICK++;
      else if (r.absenceType === "PERMITTED") counts.PERMITTED++;
      else if (r.absenceType === "UNEXCUSED") counts.UNEXCUSED++;
    }
  }

  return `H ${counts.PRESENT} · T ${counts.LATE} · S ${counts.SICK} · I ${counts.PERMITTED} · A ${counts.UNEXCUSED}`;
}

function SessionRow({
  schedule,
  records,
}: {
  schedule: ApiScheduleSummary;
  records: ApiAttendanceItem[];
}) {
  const sessionStatus: SessionStatus = records.length > 0 ? "COMPLETED" : "OPEN";
  const startTime = formatUtcTime(schedule.startTime);
  const endTime = formatUtcTime(schedule.endTime);
  const formattedDate = formatUtcDate(schedule.date);
  const batchName = schedule.class?.batch?.name || "-";
  const instructorName = schedule.instructor?.name || "-";

  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-5 py-4 text-xs font-medium text-slate-700">{formattedDate}</td>
      <td className="px-5 py-4 text-xs font-medium text-slate-600">
        {startTime} - {endTime}
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold text-[#102f50]">{schedule.subject?.name}</p>
        <p className="mt-0.5 text-xs text-slate-400">{schedule.room ?? "-"}</p>
      </td>
      <td className="px-5 py-4 text-xs font-semibold text-[#123b63]">{batchName}</td>
      <td className="px-5 py-4 text-xs text-slate-600">{instructorName}</td>
      <td className="px-5 py-4 text-xs font-medium text-slate-700">{getStatusSummary(records)}</td>
      <td className="px-5 py-4">
        <SessionStatusBadge status={sessionStatus} />
      </td>
      <td className="px-5 py-4">
        <Link
          href={`/attendance/schedule/${schedule.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <Eye className="size-3.5 text-slate-500" />
          Detail
        </Link>
      </td>
    </tr>
  );
}

function SessionCard({
  schedule,
  records,
}: {
  schedule: ApiScheduleSummary;
  records: ApiAttendanceItem[];
}) {
  const sessionStatus: SessionStatus = records.length > 0 ? "COMPLETED" : "OPEN";
  const startTime = formatUtcTime(schedule.startTime);
  const endTime = formatUtcTime(schedule.endTime);
  const formattedDate = formatUtcDate(schedule.date);

  return (
    <article className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#102f50]">{schedule.subject?.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formattedDate} · {startTime} - {endTime}
          </p>
        </div>
        <SessionStatusBadge status={sessionStatus} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {schedule.class?.batch?.name} · {schedule.instructor?.name} · {schedule.room}
      </p>
      <div className="mt-2 text-xs font-medium text-slate-700">
        Rekap: {getStatusSummary(records)}
      </div>
      <div className="mt-3">
        <Link
          href={`/attendance/schedule/${schedule.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#c94242]"
        >
          <Eye className="size-3.5" />
          Buka Absensi Sesi
        </Link>
      </div>
    </article>
  );
}

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const classes =
    status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : "bg-amber-50 text-amber-700 border border-amber-200";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classes}`}>
      {status === "COMPLETED" ? "Sudah Diisi" : "Belum Diisi"}
    </span>
  );
}
