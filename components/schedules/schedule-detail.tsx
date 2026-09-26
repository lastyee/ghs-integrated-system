"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Clock,
  GraduationCap,
  Loader2,
  Lock,
  MapPin,
  Shirt,
  Tag,
  User,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiSchedule } from "@/components/schedules/schedules-page";

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

export function ScheduleDetail({ scheduleId }: { scheduleId: string }) {
  const [schedule, setSchedule] = useState<ApiSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadSchedule() {
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
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadSchedule();

    return () => {
      ignore = true;
    };
  }, [scheduleId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <Link
          href="/schedules"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Jadwal
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-16 text-center shadow-sm">
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm font-medium text-slate-700">Memuat detail jadwal...</p>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <Link
          href="/schedules"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Jadwal
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-amber-100 p-3 text-amber-700">
            <Lock className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-[#102f50]">Akses Ditolak (Unauthorized)</h2>
          <p className="mt-1 text-xs text-slate-500">
            {error || "Anda tidak memiliki izin (schedule:read) untuk melihat jadwal ini."}
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
        <Link
          href="/schedules"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Jadwal
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-100 p-3 text-slate-400">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-bold text-[#102f50]">Jadwal Tidak Ditemukan</h2>
          <p className="mt-1 text-xs text-slate-500">
            Jadwal dengan ID <span className="font-mono">{scheduleId}</span> tidak ditemukan di database.
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

  const startTime = formatUtcTime(schedule.startTime);
  const endTime = formatUtcTime(schedule.endTime);
  const rawDate = schedule.date.substring(0, 10);
  const formattedDate = formatUtcDate(schedule.date);
  const subjectName = schedule.subject?.name || "-";
  const instructorName = schedule.instructor?.name || "-";
  const batchName = schedule.class?.batch?.name || "-";
  const className = schedule.class?.name || "-";

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      {/* Back button */}
      <Link
        href="/schedules"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Jadwal
      </Link>

      {/* Header */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Dashboard / Jadwal / <span className="font-mono">{schedule.id}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#102f50]">{subjectName}</h1>
            {schedule.topic && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-800">
                <Tag className="size-3.5" />
                {schedule.topic}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {batchName} · {className}
          </p>
        </div>
        <div>
          <ScheduleStatusBadge status={schedule.status} />
        </div>
      </div>

      {/* Detailed Card */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <CalendarDays className="size-4 text-[#c94242]" />
          <h2 className="font-bold text-[#102f50]">Informasi Jadwal Pelatihan</h2>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailCard
            icon={<GraduationCap className="size-4 text-[#123b63]" />}
            label="Subject"
            value={subjectName}
            subValue={`Kode: ${schedule.subject?.code ?? "-"}`}
          />
          <DetailCard
            icon={<Users className="size-4 text-[#123b63]" />}
            label="Batch"
            value={batchName}
            subValue={`Class: ${className}`}
          />
          <DetailCard
            icon={<User className="size-4 text-[#123b63]" />}
            label="Instructor"
            value={instructorName}
          />
          <DetailCard
            icon={<CalendarDays className="size-4 text-[#123b63]" />}
            label="Tanggal"
            value={rawDate}
            subValue={formattedDate}
          />
          <DetailCard
            icon={<Clock className="size-4 text-[#123b63]" />}
            label="Waktu Pelaksanaan"
            value={`${startTime} - ${endTime}`}
            subValue="WIB (Waktu Terjadwal)"
          />
          <DetailCard
            icon={<MapPin className="size-4 text-[#123b63]" />}
            label="Ruangan (Room)"
            value={schedule.room}
          />
          <DetailCard
            icon={<Shirt className="size-4 text-[#123b63]" />}
            label="Dresscode"
            value={schedule.dressCode}
          />
          <DetailCard
            icon={<Tag className="size-4 text-[#123b63]" />}
            label="Topic / Catatan"
            value={schedule.topic ?? "-"}
            highlight={Boolean(schedule.topic)}
          />
          <DetailCard
            icon={<CalendarDays className="size-4 text-[#123b63]" />}
            label="Status Jadwal"
            value={schedule.status}
          />
        </div>
      </section>
    </div>
  );
}

function DetailCard({
  icon,
  label,
  value,
  subValue,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p
        className={`mt-2 text-sm font-bold ${
          highlight ? "text-amber-800" : "text-[#102f50]"
        }`}
      >
        {value}
      </p>
      {subValue && <p className="mt-0.5 text-xs text-slate-400">{subValue}</p>}
    </div>
  );
}

function ScheduleStatusBadge({ status }: { status: string }) {
  const classes =
    status === "SCHEDULED"
      ? "bg-[#e8f2f8] text-[#357092] border border-[#bed8e8]"
      : status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : "bg-[#fbeaea] text-[#c94242] border border-red-200";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}
