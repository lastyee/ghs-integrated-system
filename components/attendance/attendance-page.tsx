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
  const [date, setDate] = useState("ALL");
  const [batch, setBatch] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [instructor, setInstructor] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | SessionStatus>("ALL");

  const handleReload = () => {
    setLoading(true);
    setError(null);
    setAuthErrorStatus(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        const [schedRes, attRes] = await Promise.all([
          fetch("/api/schedules", { headers: { Accept: "application/json" } }),
          fetch("/api/attendances", { headers: { Accept: "application/json" } }),
        ]);

        if (ignore) return;

        const authError = [schedRes, attRes].find(
          (response) => response.status === 401 || response.status === 403,
        );
        if (authError) {
          setAuthErrorStatus(authError.status === 401 ? 401 : 403);
          const data = await authError.json().catch(() => ({}));
          setError(
            data.error ||
              (authError.status === 401
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

        if (!attRes.ok) {
          const data = await attRes.json().catch(() => ({}));
          setError(data.error || `Gagal memuat absensi (HTTP ${attRes.status})`);
          return;
        }

        const [schedJson, attJson] = await Promise.all([schedRes.json(), attRes.json()]);
        if (ignore) return;

        setSchedules(Array.isArray(schedJson.data) ? schedJson.data : []);
        setAttendances(Array.isArray(attJson.data) ? attJson.data : []);
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
  }, [reloadKey]);

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
    const dates = ["ALL", ...new Set(schedules.map((s) => s.date.substring(0, 10)).sort())];
    const batches = ["ALL", ...new Set(schedules.map((s) => s.class?.batch?.name).filter(Boolean).sort())];
    const subjects = ["ALL", ...new Set(schedules.map((s) => s.subject?.name).filter(Boolean).sort())];
    const instructors = ["ALL", ...new Set(schedules.map((s) => s.instructor?.name).filter(Boolean).sort())];
    return { dates, batches, subjects, instructors };
  }, [schedules]);

  const filtered = useMemo(() => {
    return schedules.filter((schedule) => {
      const records = attendancesBySchedule.get(schedule.id) ?? [];
      const sessionStatus: SessionStatus = records.length > 0 ? "COMPLETED" : "OPEN";
      const q = query.trim().toLowerCase();
      const schedDate = schedule.date.substring(0, 10);
      const batchName = schedule.class?.batch?.name || "";
      const subjectName = schedule.subject?.name || "";
      const instructorName = schedule.instructor?.name || "";
      const room = schedule.room || "";
      const className = schedule.class?.name || "";

      const matchesQuery =
        !q ||
        `${subjectName} ${className} ${batchName} ${instructorName} ${room}`
          .toLowerCase()
          .includes(q);

      const matchDate = date === "ALL" || schedDate === date;
      const matchBatch = batch === "ALL" || batchName === batch;
      const matchSubject = subject === "ALL" || subjectName === subject;
      const matchInstructor = instructor === "ALL" || instructorName === instructor;
      const matchStatus = status === "ALL" || sessionStatus === status;

      return matchesQuery && matchDate && matchBatch && matchSubject && matchInstructor && matchStatus;
    });
  }, [attendancesBySchedule, batch, date, instructor, query, schedules, status, subject]);

  const completedSessionsCount = useMemo(() => {
    let count = 0;
    for (const schedule of schedules) {
      const records = attendancesBySchedule.get(schedule.id) ?? [];
      if (records.length > 0) count++;
    }
    return count;
  }, [attendancesBySchedule, schedules]);

  const openSessionsCount = schedules.length - completedSessionsCount;

  const resetFilters = () => {
    setQuery("");
    setDate("ALL");
    setBatch("ALL");
    setSubject("ALL");
    setInstructor("ALL");
    setStatus("ALL");
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
          value={String(schedules.length)}
          description="Sesi training terdaftar"
          icon={CalendarDays}
          tone="navy"
        />
        <StatCard
          label="Sudah Diisi"
          value={String(completedSessionsCount)}
          description="Sesi dengan absensi"
          icon={CheckCircle2}
          tone="blue"
        />
        <StatCard
          label="Belum Diisi"
          value={String(openSessionsCount)}
          description="Sesi menunggu absensi"
          icon={Clock}
          tone="yellow"
        />
        <StatCard
          label="Rekam Absensi"
          value={String(attendances.length)}
          description="Total data kehadiran"
          icon={CalendarDays}
          tone="red"
        />
      </section>

      {/* Filter Bar */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(210px,1.2fr)_repeat(5,minmax(125px,0.8fr))_auto] xl:items-end">
          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Sesi</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari subject, class, batch, atau room..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#102f50] focus:outline-none"
              />
            </span>
          </label>
          <FilterSelect label="Tanggal" value={date} onChange={setDate} options={options.dates} />
          <FilterSelect label="Batch" value={batch} onChange={setBatch} options={options.batches} />
          <FilterSelect label="Subject" value={subject} onChange={setSubject} options={options.subjects} />
          <FilterSelect label="Instructor" value={instructor} onChange={setInstructor} options={options.instructors} />
          <FilterSelect
            label="Status Sesi"
            value={status}
            onChange={(v) => setStatus(v as "ALL" | SessionStatus)}
            options={["ALL", "OPEN", "COMPLETED"]}
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
            {loading ? "Memuat data dari database..." : `${filtered.length} sesi ditampilkan`}
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
        {!loading && !error && filtered.length === 0 && (
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
        {!loading && !error && filtered.length > 0 && (
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
                  {filtered.map((item) => {
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
              {filtered.map((item) => {
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
    <label>
      <span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
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
