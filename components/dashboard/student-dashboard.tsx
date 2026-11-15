"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar as CalendarIcon,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  Shirt,
  Sparkles,
  Tag,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface StudentSchedule {
  id: string;
  classId: string;
  subjectId: string;
  instructorId: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  dressCode: string | null;
  topic: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  class: {
    id: string;
    name: string;
    batch: {
      id: string;
      name: string;
      program?: {
        name: string;
        code: string;
      };
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
  };
  instructor: {
    id: string;
    name: string;
  };
  attendances?: Array<{
    id: string;
    status: "PRESENT" | "LATE" | "ABSENT";
    absenceType?: "SICK" | "PERMITTED" | "UNEXCUSED" | null;
    lateMinutes?: number | null;
    notes?: string | null;
  }>;
}

function getTodayJakartaIso(): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date()); // YYYY-MM-DD
  } catch {
    return new Date().toISOString().substring(0, 10);
  }
}

function formatUtcDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.substring(0, 10).split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
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

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function StudentDashboard({ studentName }: { studentName?: string | null }) {
  const [schedules, setSchedules] = useState<StudentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  // Today reference in Asia/Jakarta (WIB)
  const todayIso = useMemo(() => getTodayJakartaIso(), []);
  const todayDateObj = useMemo(() => {
    const [y, m, d] = todayIso.split("-").map(Number);
    return { year: y, month: m - 1, day: d };
  }, [todayIso]);

  // Selected date on calendar, default to today
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  // Calendar month & year navigation
  const [currentYear, setCurrentYear] = useState<number>(todayDateObj.year);
  const [currentMonth, setCurrentMonth] = useState<number>(todayDateObj.month);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        setErrorStatus(null);

        const res = await fetch("/api/schedules?limit=100", {
          headers: { Accept: "application/json" },
        });

        if (ignore) return;

        if (res.status === 401 || res.status === 403) {
          setErrorStatus(res.status);
          const json = await res.json().catch(() => ({}));
          setError(json.error || "Akses tidak diizinkan untuk melihat jadwal.");
          return;
        }

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error || `Gagal memuat jadwal (HTTP ${res.status})`);
          return;
        }

        const json = await res.json();
        if (ignore) return;
        setSchedules(Array.isArray(json.data) ? json.data : []);
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
  }, []);

  // Map of schedules by date: "YYYY-MM-DD" -> StudentSchedule[]
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, StudentSchedule[]>();
    for (const item of schedules) {
      const d = item.date.substring(0, 10);
      if (!map.has(d)) {
        map.set(d, []);
      }
      map.get(d)!.push(item);
    }

    // Sort each day's sessions by start time ascending
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return map;
  }, [schedules]);

  // Today's schedules
  const todaySchedules = useMemo(() => {
    return schedulesByDate.get(todayIso) || [];
  }, [schedulesByDate, todayIso]);

  // Selected date's schedules
  const selectedDateSchedules = useMemo(() => {
    return schedulesByDate.get(selectedDate) || [];
  }, [schedulesByDate, selectedDate]);

  // Calendar math for currentYear & currentMonth
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    // Monday as day 0
    const rawFirstDay = new Date(currentYear, currentMonth, 1).getDay();
    const firstDayIndex = (rawFirstDay + 6) % 7;

    const pad = (n: number) => n.toString().padStart(2, "0");

    const days: Array<{
      dayNumber: number;
      dateIso: string;
      hasSchedule: boolean;
      scheduleCount: number;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
      const daySchedules = schedulesByDate.get(dateIso) || [];
      days.push({
        dayNumber: day,
        dateIso,
        hasSchedule: daySchedules.length > 0,
        scheduleCount: daySchedules.length,
        isToday: dateIso === todayIso,
        isSelected: dateIso === selectedDate,
      });
    }

    return {
      firstDayIndex,
      days,
    };
  }, [currentYear, currentMonth, schedulesByDate, todayIso, selectedDate]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToToday = () => {
    setCurrentYear(todayDateObj.year);
    setCurrentMonth(todayDateObj.month);
    setSelectedDate(todayIso);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm">
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Memuat dashboard mahasiswa...</p>
          <p className="mt-1 text-xs text-slate-500">Menyiapkan jadwal dan kalender pembelajaran</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 p-12 text-center shadow-sm">
          <AlertCircle className="size-8 text-red-600" />
          <h2 className="mt-3 text-base font-bold text-slate-800">Gagal Memuat Dashboard</h2>
          <p className="mt-1 max-w-md text-xs text-slate-600">
            {errorStatus === 401
              ? "Sesi Anda telah berakhir. Silakan login kembali untuk melanjutkan."
              : errorStatus === 403
              ? "Anda tidak memiliki akses untuk melihat data jadwal pelatihan ini."
              : error}
          </p>
          {errorStatus === 401 ? (
            <Link
              href="/login"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              Login Ulang
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a83232]"
            >
              <RefreshCw className="size-3.5" />
              Muat Ulang
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      {/* 1. Header & Welcome Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
            <Sparkles className="size-3.5" />
            Portal Pembelajaran Mahasiswa
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102f50] sm:text-3xl">
            {studentName ? `Selamat Datang, ${studentName}` : "Selamat Datang di Portal GHS"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pantau jadwal pelatihan harian, kalender sesi pembelajaran, dan kehadiran Anda.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/schedules"
            className="inline-flex items-center gap-2 rounded-xl bg-[#102f50] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a4470] transition"
          >
            <BookOpen className="size-4" />
            <span>Lihat Seluruh Jadwal</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* 2. Ringkasan Jadwal Hari Ini (Prominent Today's Schedule Banner) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-[#c94242]" />
              <h2 className="text-lg font-bold text-[#102f50]">Jadwal Hari Ini</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 font-medium">
              {formatUtcDate(todayIso)} (Waktu Indonesia Barat)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                todaySchedules.length > 0
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {todaySchedules.length > 0
                ? `${todaySchedules.length} Sesi Terjadwal`
                : "Tidak Ada Sesi Hari Ini"}
            </span>
          </div>
        </div>

        {/* Today's Schedule Cards List */}
        <div className="mt-4">
          {todaySchedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50/60 p-8 text-center border border-dashed border-slate-200">
              <CalendarIcon className="size-10 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-700">Tidak Ada Jadwal Hari Ini</p>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Anda tidak memiliki sesi pembelajaran yang dijadwalkan pada hari ini. Gunakan kalender di bawah
                untuk melihat jadwal pada tanggal lain atau periksa daftar mata kuliah.
              </p>
              <button
                type="button"
                onClick={() => {
                  // Find next scheduled session if any
                  const nextUpcoming = schedules
                    .filter((s) => s.date.substring(0, 10) >= todayIso)
                    .sort((a, b) => a.date.localeCompare(b.date))[0];
                  if (nextUpcoming) {
                    const nextDate = nextUpcoming.date.substring(0, 10);
                    setSelectedDate(nextDate);
                    const [ny, nm] = nextDate.split("-").map(Number);
                    setCurrentYear(ny);
                    setCurrentMonth(nm - 1);
                  }
                }}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                <span>Lihat Sesi Mendatang</span>
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {todaySchedules.map((session) => (
                <SessionCard key={session.id} session={session} isTodayHighlight={true} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. Kalender Interaktif & Jadwal Harian (Two-column layout on desktop) */}
      <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Left Column: Interactive Monthly Calendar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 flex flex-col justify-between">
          <div>
            {/* Calendar Month Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="size-5 text-[#102f50]" />
                <h2 className="text-base font-bold text-[#102f50]">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGoToToday}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hari Ini
                </button>
                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    title="Bulan sebelumnya"
                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-l-lg transition"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    title="Bulan berikutnya"
                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-r-lg transition"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Days of week header */}
            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Sen</span>
              <span>Sel</span>
              <span>Rab</span>
              <span>Kam</span>
              <span>Jum</span>
              <span>Sab</span>
              <span className="text-red-400">Min</span>
            </div>

            {/* Calendar Days Grid */}
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {/* Empty padding cells for start of month */}
              {Array.from({ length: calendarDays.firstDayIndex }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-11 sm:h-12" />
              ))}

              {/* Day cells */}
              {calendarDays.days.map((item) => {
                let cellClasses =
                  "relative flex flex-col items-center justify-center rounded-xl h-11 sm:h-12 text-sm font-semibold transition cursor-pointer ";

                if (item.isSelected) {
                  cellClasses += "bg-[#102f50] text-white shadow-sm font-bold ";
                } else if (item.isToday) {
                  cellClasses +=
                    "border-2 border-emerald-500 bg-emerald-50/40 text-emerald-900 font-bold hover:bg-emerald-50 ";
                } else if (item.hasSchedule) {
                  cellClasses += "bg-slate-50 text-slate-800 hover:bg-slate-100 font-bold ";
                } else {
                  cellClasses += "text-slate-600 hover:bg-slate-50 ";
                }

                return (
                  <button
                    type="button"
                    key={item.dateIso}
                    onClick={() => setSelectedDate(item.dateIso)}
                    className={cellClasses}
                    title={`${item.dateIso} ${
                      item.scheduleCount > 0 ? `(${item.scheduleCount} sesi)` : ""
                    }`}
                  >
                    <span>{item.dayNumber}</span>

                    {/* Has Schedule Indicator Dot */}
                    {item.hasSchedule && (
                      <span
                        className={`absolute bottom-1 size-1.5 rounded-full ${
                          item.isSelected
                            ? "bg-amber-300"
                            : item.isToday
                            ? "bg-emerald-600"
                            : "bg-[#c94242]"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Legend */}
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#c94242]" />
              <span>Ada Sesi Kelas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded border-2 border-emerald-500 bg-emerald-50" />
              <span>Hari Ini</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-[#102f50]" />
              <span>Tanggal Dipilih</span>
            </div>
          </div>
        </div>

        {/* Right Column: Sesi pada Tanggal Terpilih */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-[#102f50]">
                  Sesi Pelatihan: {formatUtcDate(selectedDate)}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedDate === todayIso
                    ? "Menampilkan jadwal hari ini"
                    : "Menampilkan jadwal pada tanggal yang Anda pilih"}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                {selectedDateSchedules.length} Sesi
              </span>
            </div>

            {/* List of sessions for selected date */}
            <div className="mt-4 space-y-3">
              {selectedDateSchedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50/60 p-8 text-center border border-dashed border-slate-200">
                  <CalendarDays className="size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-700">Tidak Ada Sesi</p>
                  <p className="mt-1 text-xs text-slate-500 max-w-xs">
                    Tidak ada jadwal sesi pelatihan untuk tanggal {formatUtcDate(selectedDate)}.
                  </p>
                </div>
              ) : (
                selectedDateSchedules.map((session) => (
                  <SessionCard key={session.id} session={session} isTodayHighlight={false} />
                ))
              )}
            </div>
          </div>

          {/* Quick link to course detail / schedule module */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <Link
              href="/schedules"
              className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold text-[#102f50] hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-[#c94242]" />
                <span>Buka Jadwal & Daftar Mata Kuliah Lengkap</span>
              </div>
              <ChevronRight className="size-4 text-slate-400" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Quick Access Navigation Cards */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/schedules"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <BookOpen className="size-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#102f50] group-hover:text-emerald-700 transition">
                  Mata Kuliah & Sesi
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Lihat rincian materi, ruang, pengajar, dan linimasa sesi per mata kuliah.
                </p>
              </div>
            </div>
            <ArrowRight className="size-5 text-slate-300 group-hover:translate-x-1 group-hover:text-emerald-700 transition" />
          </div>
        </Link>

        <Link
          href="/attendance"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#102f50] group-hover:text-blue-700 transition">
                  Riwayat Presensi
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Periksa rekapitulasi kehadiran (hadir, sakit, izin, alpa) resmi Anda.
                </p>
              </div>
            </div>
            <ArrowRight className="size-5 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-700 transition" />
          </div>
        </Link>
      </section>
    </div>
  );
}

function SessionCard({
  session,
  isTodayHighlight,
}: {
  session: StudentSchedule;
  isTodayHighlight: boolean;
}) {
  const startTime = formatUtcTime(session.startTime);
  const endTime = formatUtcTime(session.endTime);
  const subjectName = session.subject?.name || "Mata Kuliah";
  const className = session.class?.name || "Kelas";
  const instructorName = session.instructor?.name || "Instruktur";
  const att = session.attendances && session.attendances.length > 0 ? session.attendances[0] : null;

  return (
    <div
      className={`rounded-xl border p-4 transition shadow-xs hover:border-slate-300 ${
        isTodayHighlight
          ? "border-emerald-200 bg-emerald-50/20"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-[#102f50]">{subjectName}</h4>
            {session.topic && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                <Tag className="size-2.5" />
                {session.topic}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{className}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 font-bold text-slate-800">
              <Clock className="size-3.5 text-slate-400" />
              {startTime} - {endTime} WIB
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-slate-400" />
              {session.room || "RUANG KELAS"}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <User className="size-3.5 text-slate-400" />
              {instructorName}
            </span>
            {session.dressCode && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Shirt className="size-3.5 text-slate-400" />
                  {session.dressCode}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right side badge and link */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {att ? (
            <StudentAttendanceBadge
              status={att.status}
              absenceType={att.absenceType}
              lateMinutes={att.lateMinutes}
            />
          ) : (
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
              {session.status === "SCHEDULED" ? "Terjadwal" : "Selesai"}
            </span>
          )}

          <Link
            href={`/schedules/${session.id}`}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-[#102f50] transition"
            title="Lihat Detail Sesi"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StudentAttendanceBadge({
  status,
  absenceType,
  lateMinutes,
}: {
  status: "PRESENT" | "LATE" | "ABSENT";
  absenceType?: "SICK" | "PERMITTED" | "UNEXCUSED" | null;
  lateMinutes?: number | null;
}) {
  if (status === "PRESENT") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
        <CheckCircle2 className="size-3" />
        HADIR
      </span>
    );
  }

  if (status === "LATE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
        <Clock className="size-3" />
        TERLAMBAT {lateMinutes ? `(${lateMinutes}m)` : ""}
      </span>
    );
  }

  if (status === "ABSENT") {
    if (absenceType === "SICK") {
      return (
        <span className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
          SAKIT
        </span>
      );
    }
    if (absenceType === "PERMITTED") {
      return (
        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
          IZIN
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
        ALPA
      </span>
    );
  }

  return null;
}
