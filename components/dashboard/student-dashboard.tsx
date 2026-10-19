"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";

type StudentSchedule = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  class: {
    name: string;
    batch: { name: string };
  };
  subject: { name: string };
  instructor: { name: string };
};

type DashboardData = {
  schedules: StudentSchedule[];
};

class DashboardHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function fetchDashboardData(): Promise<DashboardData> {
  const response = await fetch("/api/schedules", { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new DashboardHttpError(
      response.status,
      `Gagal memuat data jadwal (HTTP ${response.status}).`,
    );
  }
  
  const schedules = await response.json();

  if (!Array.isArray(schedules?.data)) {
    throw new Error("Format data jadwal tidak valid.");
  }

  return {
    schedules: schedules.data,
  };
}

export function StudentDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetchDashboardData()
      .then((result) => {
        if (isMounted) setData(result);
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          if (loadError instanceof DashboardHttpError) {
            setErrorStatus(loadError.status);
          }
          setError(loadError instanceof Error ? loadError.message : "Gagal memuat data dashboard.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 size-4 animate-spin text-[#BF120E]" />
        Memuat data dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="mx-auto max-w-7xl p-6 text-sm text-red-700">
        <p>
          {errorStatus === 401
            ? "Sesi Anda berakhir. Silakan login kembali."
            : errorStatus === 403
              ? "Anda tidak memiliki akses untuk membaca data dashboard."
              : errorStatus !== null && errorStatus >= 500
                ? "Terjadi kesalahan saat memuat dashboard. Silakan coba lagi."
                : error ?? "Data dashboard tidak tersedia."}
        </p>
        {errorStatus === 401 && (
          <Link href="/login" className="mt-2 inline-block font-semibold underline">
            Login Ulang
          </Link>
        )}
      </div>
    );
  }

  const today = new Date(new Date().toDateString()).getTime();
  
  const upcomingSchedules = [...data.schedules]
    .filter((schedule) => new Date(schedule.date).getTime() >= today)
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      return timeA - timeB;
    })
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <section className="rounded-lg border border-[#EEEEEE] bg-white">
        <SectionHeading title="Jadwal Kelas Saya" subtitle="Informasi kelas dan jadwal pembelajaran Anda." />
        {upcomingSchedules.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            <p>Belum ada jadwal kelas terbaru.</p>
            <p className="mt-1">Jadwal kelas akan muncul di sini setelah admin/dosen membuat jadwal untuk kelas Anda.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#EEEEEE]">
            {upcomingSchedules.map((schedule) => {
              const scheduleTime = new Date(schedule.date).getTime();
              const isToday = scheduleTime === today;
              
              return (
                <Link
                  key={schedule.id}
                  href={`/schedules/${schedule.id}`}
                  className="group flex items-center justify-between px-5 py-4 cursor-pointer transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#BF120E] focus-visible:ring-inset"
                  aria-label={`Lihat detail jadwal ${schedule.subject.name}`}
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="mb-2">
                      <span className={`inline-block rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${isToday ? "bg-[#BF120E] text-white" : "bg-blue-100 text-blue-700"}`}>
                        {isToday ? "Kelas Hari Ini" : "Kelas Berikutnya"}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-[#1B1B1B] transition-colors group-hover:text-[#BF120E]">
                      {schedule.subject.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {schedule.class.name} {schedule.class.batch.name ? `· ${schedule.class.batch.name}` : ""} · {schedule.instructor.name}
                      {schedule.room ? ` · Ruangan: ${schedule.room}` : ""}
                    </p>
                    <time className="mt-2 flex items-center gap-1.5 text-sm font-medium text-slate-700" dateTime={schedule.date}>
                      <CalendarDays className="size-4 text-slate-400" />
                      {new Date(schedule.date).toLocaleDateString("id-ID", {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: "UTC"
                      })}
                      {" · "}
                      {new Date(schedule.startTime).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                      {" – "}
                      {new Date(schedule.endTime).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                    </time>
                  </div>
                  <div className="flex shrink-0 items-center pl-2">
                    <ChevronRight className="size-5 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-slate-600" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-[#EEEEEE] px-5 py-4">
      <h2 className="text-sm font-bold text-[#1B1B1B]">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}
