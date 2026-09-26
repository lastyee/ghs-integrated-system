"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  MapPin,
  RotateCcw,
  User,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiAttendanceItem, ApiScheduleSummary } from "@/components/attendance/attendance-page";

interface StudentItem {
  id: string;
  nim: string;
  name: string;
}

interface EnrollmentItem {
  id: string;
  studentId: string;
  batchId: string;
  status: string;
}

type UIStatusChoice =
  | "UNMARKED"
  | "PRESENT"
  | "LATE"
  | "ABSENT_SICK"
  | "ABSENT_PERMITTED"
  | "ABSENT_UNEXCUSED";

function formatUtcDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.substring(0, 10).split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember",
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

export function AttendanceSessionDetail({ scheduleId }: { scheduleId: string }) {
  const [schedule, setSchedule] = useState<ApiScheduleSummary | null>(null);
  const [attendances, setAttendances] = useState<ApiAttendanceItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleReload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let ignore = false;

    async function loadSessionData() {
      try {
        const [schedRes, attRes, studRes, enrRes] = await Promise.all([
          fetch(`/api/schedules/${scheduleId}`, { headers: { Accept: "application/json" } }),
          fetch(`/api/attendances?scheduleId=${scheduleId}`, { headers: { Accept: "application/json" } }),
          fetch("/api/students", { headers: { Accept: "application/json" } }),
          fetch("/api/enrollments", { headers: { Accept: "application/json" } }),
        ]);

        if (ignore) return;

        if (
          schedRes.status === 401 ||
          attRes.status === 401 ||
          studRes.status === 401 ||
          schedRes.status === 403 ||
          attRes.status === 403 ||
          studRes.status === 403
        ) {
          setUnauthorized(true);
          setError("Akses tidak diizinkan untuk melihat atau mengelola absensi sesi ini.");
          return;
        }

        if (schedRes.status === 404) {
          setNotFound(true);
          setError("Jadwal tidak ditemukan.");
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

        const [schedJson, attJson, studJson, enrJson] = await Promise.all([
          schedRes.json(),
          attRes.json(),
          studRes.json(),
          enrRes.json(),
        ]);

        if (ignore) return;

        setSchedule(schedJson.data ?? null);
        setAttendances(Array.isArray(attJson.data) ? attJson.data : []);
        setStudents(Array.isArray(studJson.data) ? studJson.data : []);
        setEnrollments(Array.isArray(enrJson.data) ? enrJson.data : []);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadSessionData();

    return () => {
      ignore = true;
    };
  }, [scheduleId, reloadKey]);

  // Resolve students that belong to this schedule's batch
  const sessionStudents = useMemo(() => {
    if (!schedule) return [];
    const batchId = schedule.class?.batch?.id;
    if (!batchId) return students;

    const enrolledStudentIds = new Set(
      enrollments
        .filter((e) => e.batchId === batchId && e.status === "ACTIVE")
        .map((e) => e.studentId),
    );

    const filtered = students.filter((s) => enrolledStudentIds.has(s.id));
    // If enrollments filter returned students, use them; otherwise fallback to all students
    return filtered.length > 0 ? filtered : students;
  }, [enrollments, schedule, students]);

  // Map studentId to existing attendance
  const attendanceMap = useMemo(() => {
    const map = new Map<string, ApiAttendanceItem>();
    for (const att of attendances) {
      map.set(att.studentId, att);
    }
    return map;
  }, [attendances]);

  // Compute counts
  const summaryCounts = useMemo(() => {
    const counts = {
      PRESENT: 0,
      LATE: 0,
      SICK: 0,
      PERMITTED: 0,
      UNEXCUSED: 0,
      UNMARKED: 0,
    };

    for (const student of sessionStudents) {
      const att = attendanceMap.get(student.id);
      if (!att) {
        counts.UNMARKED++;
      } else if (att.status === "PRESENT") {
        counts.PRESENT++;
      } else if (att.status === "LATE") {
        counts.LATE++;
      } else if (att.status === "ABSENT") {
        if (att.absenceType === "SICK") counts.SICK++;
        else if (att.absenceType === "PERMITTED") counts.PERMITTED++;
        else if (att.absenceType === "UNEXCUSED") counts.UNEXCUSED++;
      }
    }

    return counts;
  }, [attendanceMap, sessionStudents]);

  const updateAttendanceForStudent = async (
    studentId: string,
    choice: UIStatusChoice,
    lateMinutesInput?: number,
  ) => {
    if (choice === "UNMARKED") return;

    setSavingId(studentId);
    setNotice(null);

    let status: "PRESENT" | "LATE" | "ABSENT" = "PRESENT";
    let absenceType: "SICK" | "PERMITTED" | "UNEXCUSED" | null = null;
    let lateMinutes: number | null = null;

    if (choice === "PRESENT") {
      status = "PRESENT";
    } else if (choice === "LATE") {
      status = "LATE";
      lateMinutes = lateMinutesInput && lateMinutesInput >= 1 ? lateMinutesInput : 10;
    } else if (choice === "ABSENT_SICK") {
      status = "ABSENT";
      absenceType = "SICK";
    } else if (choice === "ABSENT_PERMITTED") {
      status = "ABSENT";
      absenceType = "PERMITTED";
    } else if (choice === "ABSENT_UNEXCUSED") {
      status = "ABSENT";
      absenceType = "UNEXCUSED";
    }

    const existing = attendanceMap.get(studentId);

    try {
      if (existing) {
        // Update via PATCH
        const res = await fetch(`/api/attendances/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, absenceType, lateMinutes }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `Gagal mengubah absensi (HTTP ${res.status})`);
        }

        const json = await res.json();
        setAttendances((prev) =>
          prev.map((item) => (item.id === existing.id ? json.data : item)),
        );
        setNotice("Perubahan absensi berhasil disimpan ke database.");
      } else {
        // Create via POST
        const res = await fetch("/api/attendances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId,
            studentId,
            status,
            absenceType,
            lateMinutes,
            notes: null,
          }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `Gagal mencatat absensi (HTTP ${res.status})`);
        }

        const json = await res.json();
        setAttendances((prev) => [...prev, json.data]);
        setNotice("Absensi berhasil dicatat ke database.");
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Gagal menyimpan absensi.");
    } finally {
      setSavingId(null);
    }
  };

  const handleSetAllPresent = async () => {
    if (!window.confirm("Tandai semua peserta sesi ini sebagai HADIR (PRESENT)?")) return;

    setSavingId("ALL");
    setNotice(null);

    let successCount = 0;
    const errors: string[] = [];

    for (const student of sessionStudents) {
      const existing = attendanceMap.get(student.id);
      try {
        if (existing) {
          if (existing.status !== "PRESENT") {
            const res = await fetch(`/api/attendances/${existing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "PRESENT", absenceType: null, lateMinutes: null }),
            });
            if (res.ok) successCount++;
          }
        } else {
          const res = await fetch("/api/attendances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scheduleId,
              studentId: student.id,
              status: "PRESENT",
              absenceType: null,
              lateMinutes: null,
            }),
          });
          if (res.ok) successCount++;
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Error");
      }
    }

    setSavingId(null);
    setNotice(`Selesai memperbarui kehadiran: ${successCount} record berhasil disimpan.`);
    handleReload();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <Link
          href="/attendance"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Attendance
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-16 text-center shadow-sm">
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm font-medium text-slate-700">Memuat sesi absensi...</p>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <Link
          href="/attendance"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Attendance
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-amber-100 p-3 text-amber-700">
            <Lock className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-[#102f50]">Akses Ditolak (Unauthorized)</h2>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
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
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <Link
          href="/attendance"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Attendance
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-100 p-3 text-slate-400">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-[#102f50]">Sesi Tidak Ditemukan</h2>
          <p className="mt-1 text-xs text-slate-500">
            Jadwal sesi dengan ID <span className="font-mono">{scheduleId}</span> tidak ditemukan di database.
          </p>
          <Link
            href="/attendance"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white"
          >
            Kembali ke Daftar
          </Link>
        </div>
      </div>
    );
  }

  const startTime = formatUtcTime(schedule.startTime);
  const endTime = formatUtcTime(schedule.endTime);
  const formattedDate = formatUtcDate(schedule.date);
  const batchName = schedule.class?.batch?.name || "-";
  const subjectName = schedule.subject?.name || "-";
  const instructorName = schedule.instructor?.name || "-";

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      {/* Back button */}
      <Link
        href="/attendance"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Attendance
      </Link>

      {/* Header */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Dashboard / Attendance / <span className="font-mono">{schedule.id}</span>
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102f50]">
            {subjectName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {batchName} · {formattedDate} ({startTime} - {endTime})
          </p>
        </div>
        <button
          type="button"
          onClick={handleSetAllPresent}
          disabled={savingId !== null}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#b03636] disabled:opacity-50"
        >
          {savingId === "ALL" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Set Semua Hadir
        </button>
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-[#bed8e8] bg-[#f0f7fb] px-4 py-3 text-xs text-[#205070]">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Schedule Info Section */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
          <CalendarDays className="size-4 text-[#c94242]" />
          <h2 className="font-bold text-[#102f50]">Informasi Sesi Training</h2>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard icon={<GraduationCap className="size-4" />} label="Subject" value={subjectName} />
          <DetailCard icon={<Users className="size-4" />} label="Batch" value={batchName} />
          <DetailCard icon={<User className="size-4" />} label="Instructor" value={instructorName} />
          <DetailCard icon={<MapPin className="size-4" />} label="Ruangan" value={schedule.room ?? "-"} />
        </div>
      </section>

      {/* Summary Counts Section */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
          <CheckCircle2 className="size-4 text-[#c94242]" />
          <h2 className="font-bold text-[#102f50]">Ringkasan Kehadiran Sesi</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <CountCard label="Hadir (Present)" count={summaryCounts.PRESENT} tone="emerald" />
          <CountCard label="Terlambat (Late)" count={summaryCounts.LATE} tone="amber" />
          <CountCard label="Sakit (Sick)" count={summaryCounts.SICK} tone="blue" />
          <CountCard label="Izin (Permitted)" count={summaryCounts.PERMITTED} tone="cyan" />
          <CountCard label="Alpha (Unexcused)" count={summaryCounts.UNEXCUSED} tone="rose" />
          <CountCard label="Belum Diisi" count={summaryCounts.UNMARKED} tone="slate" />
        </div>
      </section>

      {/* Participants Table */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-[#102f50]">Daftar Mahasiswa ({sessionStudents.length})</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Input status kehadiran per mahasiswa untuk sesi ini
            </p>
          </div>
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="size-3.5" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-175 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">NIM</th>
                <th className="px-5 py-3 font-semibold">Nama Mahasiswa</th>
                <th className="px-5 py-3 font-semibold">Status Saat Ini</th>
                <th className="px-5 py-3 font-semibold">Tandai Kehadiran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessionStudents.map((student) => {
                const att = attendanceMap.get(student.id);
                const isSaving = savingId === student.id;

                let currentChoice: UIStatusChoice = "UNMARKED";
                if (att) {
                  if (att.status === "PRESENT") currentChoice = "PRESENT";
                  else if (att.status === "LATE") currentChoice = "LATE";
                  else if (att.status === "ABSENT") {
                    if (att.absenceType === "SICK") currentChoice = "ABSENT_SICK";
                    else if (att.absenceType === "PERMITTED") currentChoice = "ABSENT_PERMITTED";
                    else if (att.absenceType === "UNEXCUSED") currentChoice = "ABSENT_UNEXCUSED";
                  }
                }

                return (
                  <tr key={student.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-[#123b63]">
                      {student.nim}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#102f50]">{student.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <CurrentStatusBadge att={att} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <select
                          value={currentChoice}
                          disabled={isSaving}
                          onChange={(e) => {
                            const val = e.target.value as UIStatusChoice;
                            if (val === "LATE") {
                              const minutes = window.prompt("Jumlah menit keterlambatan (integer >= 1):", "10");
                              const num = minutes ? parseInt(minutes, 10) : 10;
                              updateAttendanceForStudent(student.id, val, isNaN(num) || num < 1 ? 10 : num);
                            } else {
                              updateAttendanceForStudent(student.id, val);
                            }
                          }}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-[#102f50] focus:outline-none disabled:opacity-50"
                        >
                          <option value="UNMARKED">Pilih Status Kehadiran</option>
                          <option value="PRESENT">Hadir (PRESENT)</option>
                          <option value="LATE">Terlambat (LATE)</option>
                          <option value="ABSENT_SICK">Sakit (ABSENT - SICK)</option>
                          <option value="ABSENT_PERMITTED">Izin (ABSENT - PERMITTED)</option>
                          <option value="ABSENT_UNEXCUSED">Alpha (ABSENT - UNEXCUSED)</option>
                        </select>
                        {isSaving && <Loader2 className="size-4 animate-spin text-[#102f50]" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DetailCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-bold text-[#102f50]">{value}</p>
    </div>
  );
}

function CountCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "blue" | "cyan" | "rose" | "slate";
}) {
  const colorMap = {
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    cyan: "text-cyan-700 bg-cyan-50 border-cyan-200",
    rose: "text-rose-700 bg-rose-50 border-rose-200",
    slate: "text-slate-600 bg-slate-100 border-slate-200",
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[tone]}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="mt-0.5 text-[11px] font-medium">{label}</p>
    </div>
  );
}

function CurrentStatusBadge({ att }: { att: ApiAttendanceItem | undefined }) {
  if (!att) {
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
        Belum Diisi
      </span>
    );
  }

  if (att.status === "PRESENT") {
    return (
      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
        Hadir (PRESENT)
      </span>
    );
  }

  if (att.status === "LATE") {
    return (
      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
        Terlambat ({att.lateMinutes ?? "-"} mnt)
      </span>
    );
  }

  if (att.status === "ABSENT") {
    if (att.absenceType === "SICK") {
      return (
        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
          Sakit (SICK)
        </span>
      );
    }
    if (att.absenceType === "PERMITTED") {
      return (
        <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">
          Izin (PERMITTED)
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
        Alpha (UNEXCUSED)
      </span>
    );
  }

  return null;
}
