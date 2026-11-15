"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  Info,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Search,
  Shirt,
  User,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiSchedule } from "@/components/schedules/schedules-page";

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

function BackButton() {
  return (
    <Link
      href="/schedules"
      className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] transition-colors hover:text-[#c94242]"
    >
      <ArrowLeft className="size-4" />
      Kembali ke Jadwal
    </Link>
  );
}

export function ScheduleDetail({ scheduleId }: { scheduleId: string }) {
  const [schedule, setSchedule] = useState<ApiSchedule | null>(null);
  const [courseSchedules, setCourseSchedules] = useState<ApiSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"SESI" | "INFORMASI">("SESI");
  const [sessionSearch, setSessionSearch] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadScheduleData() {
      try {
        const res = await fetch(`/api/schedules/${scheduleId}`, {
          headers: { Accept: "application/json" },
        });

        if (ignore) return;

        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Akses tidak diizinkan.");
          return;
        }

        if (res.status === 404) {
          setNotFound(true);
          setError("Jadwal tidak ditemukan.");
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Gagal memuat jadwal (HTTP ${res.status})`);
          return;
        }

        const json = await res.json();
        if (ignore) return;
        setSchedule(json.data ?? null);
        setCourseSchedules(Array.isArray(json.courseSchedules) ? json.courseSchedules : [json.data]);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
      } finally {
        if (!ignore) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadScheduleData();

    return () => {
      ignore = true;
    };
  }, [scheduleId, reloadKey]);

  // Attendance metrics calculation
  const attendanceStats = useMemo(() => {
    let presentCount = 0;
    let lateCount = 0;
    let sickCount = 0;
    let permittedCount = 0;
    let unexcusedCount = 0;

    for (const s of courseSchedules) {
      if (s.attendances && s.attendances.length > 0) {
        const att = s.attendances[0];
        if (att.status === "PRESENT") {
          presentCount++;
        } else if (att.status === "LATE") {
          lateCount++;
        } else if (att.status === "ABSENT") {
          if (att.absenceType === "SICK") {
            sickCount++;
          } else if (att.absenceType === "PERMITTED") {
            permittedCount++;
          } else {
            unexcusedCount++;
          }
        }
      }
    }

    const totalAttended = presentCount + lateCount;
    const totalSessions = courseSchedules.length;

    return {
      totalAttended,
      totalSessions,
      presentCount,
      lateCount,
      sickCount,
      permittedCount,
      unexcusedCount,
    };
  }, [courseSchedules]);

  // Filtered and sorted sessions
  const filteredSessions = useMemo(() => {
    const list = [...courseSchedules];
    // Sort: newest date first, then asc start time
    list.sort((a, b) => {
      const dateA = a.date.substring(0, 10);
      const dateB = b.date.substring(0, 10);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return a.startTime.localeCompare(b.startTime);
    });

    if (!sessionSearch.trim()) return list;

    const q = sessionSearch.toLowerCase();
    return list.filter((s) => {
      return (
        s.topic?.toLowerCase().includes(q) ||
        s.instructor?.name?.toLowerCase().includes(q) ||
        s.room?.toLowerCase().includes(q) ||
        s.date.includes(q)
      );
    });
  }, [courseSchedules, sessionSearch]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <BackButton />
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-16 text-center shadow-sm">
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm font-medium text-slate-700">Memuat detail mata kuliah...</p>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <BackButton />
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-amber-100 p-3 text-amber-700">
            <Lock className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-[#102f50]">Akses Ditolak (Unauthorized)</h2>
          <p className="mt-1 text-xs text-slate-500">
            {error || "Anda tidak memiliki izin untuk melihat jadwal atau mata kuliah ini."}
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white"
          >
            Login Ulang
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !schedule) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <BackButton />
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-100 p-3 text-slate-400">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-[#102f50]">Mata Kuliah / Jadwal Tidak Ditemukan</h2>
          <p className="mt-1 text-xs text-slate-500">
            Jadwal dengan ID <span className="font-mono">{scheduleId}</span> tidak ditemukan atau tidak aktif.
          </p>
          <Link
            href="/schedules"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white"
          >
            Kembali ke Daftar
          </Link>
        </div>
      </div>
    );
  }

  const subjectName = schedule.subject?.name || "-";
  const subjectCode = schedule.subject?.code;
  const className = schedule.class?.name || "-";
  const batchName = schedule.class?.batch?.name || "-";
  const programName = schedule.class?.batch?.program?.name || "Global Hospitality School";

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      {/* Back button */}
      <BackButton />

      {/* Course Title Header (EdLink Concept) */}
      <div className="mt-5 border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#102f50] sm:text-3xl">
              {subjectName}
            </h1>
            <div className="mt-2 space-y-0.5 text-sm text-slate-600">
              <p>
                <span className="font-medium text-slate-500">Kelas:</span>{" "}
                <span className="font-semibold text-slate-800">{className}</span>
                {subjectCode && <span className="ml-2 font-mono text-xs text-slate-500">({subjectCode})</span>}
              </p>
              <p>
                <span className="font-medium text-slate-500">Periode:</span>{" "}
                <span className="font-semibold text-slate-800">{batchName}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="text-slate-600">{programName}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Stats Bar (Exact EdLink Replica) */}
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4 sm:grid-cols-5 sm:gap-2">
          {/* Main Attendance metric */}
          <div className="col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-slate-500">Kehadiran</span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-base font-bold text-slate-800">
                {attendanceStats.totalAttended} dari {attendanceStats.totalSessions} Sesi
              </span>
              <span title="Dihitung berdasarkan sesi yang telah diverifikasi instruktur">
                <Info className="size-4 text-slate-400 hover:text-slate-600" />
              </span>
            </div>
          </div>

          {/* Hadir */}
          <div className="text-left sm:text-center">
            <span className="text-xs font-medium text-slate-500">Hadir</span>
            <p className="mt-1 text-base font-bold text-emerald-600">
              {attendanceStats.presentCount + attendanceStats.lateCount}
            </p>
          </div>

          {/* Sakit */}
          <div className="text-left sm:text-center">
            <span className="text-xs font-medium text-slate-500">Sakit</span>
            <p className="mt-1 text-base font-bold text-amber-600">
              {attendanceStats.sickCount}
            </p>
          </div>

          {/* Izin */}
          <div className="text-left sm:text-center">
            <span className="text-xs font-medium text-slate-500">Izin</span>
            <p className="mt-1 text-base font-bold text-blue-600">
              {attendanceStats.permittedCount}
            </p>
          </div>

          {/* Alpa */}
          <div className="text-left sm:text-center">
            <span className="text-xs font-medium text-slate-500">Alpa</span>
            <p className="mt-1 text-base font-bold text-red-600">
              {attendanceStats.unexcusedCount}
            </p>
          </div>
        </div>

        {/* Actions row: Perbarui & Lihat Detail Presensi */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              setReloadKey((k) => k + 1);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 font-bold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Perbarui data kehadiran
          </button>
          <Link
            href="/attendance"
            className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            Lihat Detail Presensi
          </Link>
        </div>
      </section>

      {/* Tabs */}
      <div className="mt-6 flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("SESI")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold tracking-wide transition-colors ${
            activeTab === "SESI"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <span>SESI</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {courseSchedules.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("INFORMASI")}
          className={`border-b-2 px-5 py-3 text-sm font-bold tracking-wide transition-colors ${
            activeTab === "INFORMASI"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          INFORMASI KELAS
        </button>
      </div>

      {/* Tab Content: SESI */}
      {activeTab === "SESI" && (
        <div className="mt-6 space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Cari sesi berdasarkan topik, instruktur, atau ruangan..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {filteredSessions.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <CalendarDays className="mx-auto size-8 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada sesi ditemukan</p>
              <p className="mt-1 text-xs text-slate-500">
                {sessionSearch
                  ? "Coba gunakan kata kunci pencarian yang lain."
                  : "Mata kuliah ini belum memiliki jadwal sesi yang terdaftar pada periode ini."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSessions.map((session, index) => {
                const sessionNum = courseSchedules.length - index;
                const formattedDate = formatUtcDate(session.date);
                const startTime = formatUtcTime(session.startTime);
                const endTime = formatUtcTime(session.endTime);
                const att = session.attendances && session.attendances.length > 0 ? session.attendances[0] : null;

                return (
                  <div
                    key={session.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
                  >
                    {/* Session Creator / Instructor header */}
                    <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-600">
                      <div className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold">
                        {session.instructor?.name?.substring(0, 1) || "I"}
                      </div>
                      <div className="flex-1">
                        <span className="font-semibold text-slate-800">
                          {session.instructor?.name || "Instruktur"}
                        </span>
                        <span className="text-slate-500"> menambahkan sesi pelatihan</span>
                      </div>
                      <span className="font-semibold text-slate-500">Sesi #{sessionNum}</span>
                    </div>

                    {/* Session Content Box */}
                    <div className="p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="text-base font-bold text-[#102f50]">
                            {session.topic || `Sesi Pembelajaran ke-${sessionNum}`}
                          </h2>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                              <CalendarDays className="size-3.5 text-slate-400" />
                              {formattedDate}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                              <Clock className="size-3.5 text-slate-400" />
                              {startTime} - {endTime} WIB
                            </span>
                          </div>
                        </div>

                        {/* Status / Attendance Badge */}
                        <div className="flex items-center gap-2">
                          {att ? (
                            <SessionAttendanceBadge
                              status={att.status}
                              absenceType={att.absenceType}
                              lateMinutes={att.lateMinutes}
                            />
                          ) : (
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                              {session.status === "SCHEDULED" ? "Terjadwal" : "Belum Ada Presensi"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Location & Dress Code */}
                      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-slate-400" />
                          <span>Ruangan:</span>
                          <span className="font-semibold text-slate-800">{session.room || "RUANG KELAS"}</span>
                        </div>
                        {session.dressCode && (
                          <div className="flex items-center gap-1.5">
                            <Shirt className="size-3.5 text-slate-400" />
                            <span>Dress Code:</span>
                            <span className="font-semibold text-slate-800">{session.dressCode}</span>
                          </div>
                        )}
                        {att?.notes && (
                          <div className="w-full text-slate-500 border-t border-slate-200 pt-1.5 mt-1">
                            <span className="font-semibold">Catatan Presensi:</span> {att.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: INFORMASI */}
      {activeTab === "INFORMASI" && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-[#102f50]">Informasi Akademik Mata Kuliah</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InfoItem
              icon={<GraduationCap className="size-4 text-[#123b63]" />}
              label="Mata Kuliah"
              value={subjectName}
              sub={subjectCode ? `Kode: ${subjectCode}` : undefined}
            />
            <InfoItem
              icon={<Users className="size-4 text-[#123b63]" />}
              label="Kelas & Periode"
              value={className}
              sub={`Periode: ${batchName}`}
            />
            <InfoItem
              icon={<User className="size-4 text-[#123b63]" />}
              label="Instruktur Utama"
              value={schedule.instructor?.name || "-"}
            />
            <InfoItem
              icon={<CheckCircle2 className="size-4 text-[#123b63]" />}
              label="Total Sesi Terjadwal"
              value={`${courseSchedules.length} Sesi Pertemuan`}
            />
          </div>

          {schedule.subject?.description && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Deskripsi Mata Kuliah
              </h3>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                {schedule.subject.description}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SessionAttendanceBadge({
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

function InfoItem({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
