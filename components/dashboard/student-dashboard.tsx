"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Award,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { ApplicationStatusBadge } from "@/components/applications/applications-page";
import { StatCard } from "@/components/dashboard/stat-card";

type StudentProfileData = {
  id: string;
  name: string;
  nim: string;
  nik: string | null;
  phone: string | null;
  address: string | null;
  enrollment: {
    id: string;
    batchName: string;
    programName: string;
    status: string;
  } | null;
};

type StudentApplication = {
  id: string;
  status: string;
  createdAt: string;
  vacancy: { title: string; employer: { name: string } };
};

type StudentInterview = {
  id: string;
  scheduledAt: string;
  method: string | null;
  location: string | null;
  status: string;
  application: {
    vacancy: { title: string; employer: { name: string } };
  };
};

type StudentPlacement = {
  id: string;
  status: string;
  position: string;
  employer: { name: string };
};

type StudentAttendance = {
  id: string;
  status: string;
  schedule: {
    id: string;
    date: string;
    subject: { name: string };
    class: { name: string; batch: { name: string } };
  };
};

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

type StudentAssessment = {
  id: string;
  name: string;
  status: string;
  subject: { name: string };
};

type StudentDocument = {
  id: string;
  fileName: string;
  type: string;
  status: string;
  createdAt: string;
};

type StudentCertificate = {
  id: string;
  certificateNumber: string;
  status: "ACTIVE" | "REVOKED";
  issuedAt: string;
  program: { name: string };
  batch: { name: string };
};

type DashboardData = {
  profile: StudentProfileData;
  applications: StudentApplication[];
  interviews: StudentInterview[];
  placements: StudentPlacement[];
  schedules: StudentSchedule[];
  attendances: StudentAttendance[];
  assessments: StudentAssessment[];
  documents: StudentDocument[];
  certificates: StudentCertificate[];
};

type StudentDashboardProps = {
  userName?: string;
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
  const urls = [
    "/api/profile",
    "/api/schedules",
    "/api/applications",
    "/api/interviews",
    "/api/placements",
    "/api/attendances",
    "/api/assessments",
    "/api/documents",
    "/api/certificates",
  ] as const;

  const responses = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new DashboardHttpError(
          response.status,
          `Gagal memuat data dashboard (${url}, HTTP ${response.status}).`,
        );
      }
      return response.json();
    }),
  );

  const [
    profile,
    schedules,
    applications,
    interviews,
    placements,
    attendances,
    assessments,
    documents,
    certificates,
  ] = responses;

  if (
    !profile ||
    !Array.isArray(schedules?.data) ||
    !Array.isArray(applications) ||
    !Array.isArray(interviews) ||
    !Array.isArray(placements?.data) ||
    !Array.isArray(attendances?.data) ||
    !Array.isArray(assessments) ||
    !Array.isArray(documents) ||
    !Array.isArray(certificates?.data)
  ) {
    throw new Error("Format data dashboard tidak valid.");
  }

  return {
    profile,
    schedules: schedules.data,
    applications,
    interviews,
    placements: placements.data,
    attendances: attendances.data,
    assessments,
    documents,
    certificates: certificates.data,
  };
}

export function StudentDashboard({ userName }: StudentDashboardProps = {}) {
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

  const activeApplications = data.applications.filter((application) =>
    ["APPLIED", "SCREENING", "INTERVIEW"].includes(application.status),
  ).length;
  const activePlacements = data.placements.filter((placement) =>
    ["PREPARATION", "READY", "DEPARTED", "PLACED"].includes(placement.status),
  ).length;
  const cards = [
    { label: "Lamaran aktif", value: activeApplications, icon: BriefcaseBusiness, tone: "blue" as const },
    { label: "Wawancara", value: data.interviews.length, icon: CalendarDays, tone: "red" as const },
    { label: "Placement", value: activePlacements, icon: GraduationCap, tone: "navy" as const },
    { label: "Catatan kehadiran", value: data.attendances.length, icon: ClipboardCheck, tone: "yellow" as const },
    { label: "Dokumen", value: data.documents.length, icon: FileCheck2, tone: "blue" as const },
  ];
  const visibleSchedules = data.schedules.slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <section aria-label="Ringkasan peserta" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={String(card.value)}
            description="Jumlah catatan Anda"
            icon={card.icon}
            tone={card.tone}
          />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Profil Mahasiswa" subtitle="Informasi yang tercatat pada profil Anda." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <ProfileField label="Nama" value={userName || data.profile.name} />
            <ProfileField label="NIM" value={data.profile.nim} />
            <ProfileField label="Program" value={data.profile.enrollment?.programName ?? "Belum terdaftar"} />
            <ProfileField label="Batch" value={data.profile.enrollment?.batchName ?? "Belum terdaftar"} />
            <ProfileField label="Status enrollment" value={data.profile.enrollment?.status ?? "Belum terdaftar"} />
            <Link href="/profile" className="text-sm font-semibold text-[#BF120E] hover:underline">
              Kelola informasi kontak
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Placement" subtitle="Catatan placement yang tercatat." />
          {data.placements.length === 0 ? (
            <EmptyState>Belum ada catatan placement.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {data.placements.map((placement) => (
                <div key={placement.id} className="px-5 py-4">
                  <p className="text-sm font-semibold text-[#1B1B1B]">{placement.position}</p>
                  <p className="mt-1 text-xs text-slate-500">{placement.employer.name} · {placement.status}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-[#EEEEEE] bg-white">
        <SectionHeading title="Jadwal Saya" subtitle="Sesi pembelajaran dari enrollment aktif Anda." />
        {visibleSchedules.length === 0 ? (
          <EmptyState>Belum ada jadwal.</EmptyState>
        ) : (
          <div className="divide-y divide-[#EEEEEE]">
            {visibleSchedules.map((schedule) => (
              <div key={schedule.id} className="px-5 py-4">
                <p className="text-sm font-semibold text-[#1B1B1B]">
                  {schedule.subject.name} · {schedule.class.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {schedule.class.batch.name} · {schedule.instructor.name}
                  {schedule.room ? ` · ${schedule.room}` : ""}
                </p>
                <time className="mt-1 block text-xs text-slate-500" dateTime={schedule.date}>
                  {new Date(schedule.date).toLocaleDateString("id-ID", { timeZone: "UTC" })} ·{" "}
                  {new Date(schedule.startTime).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  })}
                  {"–"}
                  {new Date(schedule.endTime).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  })}
                </time>
              </div>
            ))}
          </div>
        )}
        <SectionLink href="/schedules">Lihat jadwal</SectionLink>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Kehadiran tercatat" subtitle="Sesi dengan catatan kehadiran Anda." />
          {data.attendances.length === 0 ? (
            <EmptyState>Belum ada catatan kehadiran.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {data.attendances.slice(0, 6).map((attendance) => (
                <div key={attendance.id} className="px-5 py-4">
                  <p className="text-sm font-semibold text-[#1B1B1B]">{attendance.schedule.subject.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {attendance.schedule.class.name} · {attendance.schedule.class.batch.name} · {attendance.status}
                  </p>
                  <time className="mt-1 block text-xs text-slate-500" dateTime={attendance.schedule.date}>
                    {new Date(attendance.schedule.date).toLocaleDateString("id-ID")}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Penilaian" subtitle="Daftar penilaian yang tersedia pada sistem." />
          {data.assessments.length === 0 ? (
            <EmptyState>Belum ada penilaian tersedia.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {data.assessments.slice(0, 6).map((assessment) => (
                <div key={assessment.id} className="px-5 py-4">
                  <p className="text-sm font-semibold text-[#1B1B1B]">{assessment.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{assessment.subject.name} · {assessment.status}</p>
                  <Link href={`/assessments/${assessment.id}`} className="mt-2 inline-block text-xs font-semibold text-[#BF120E] hover:underline">
                    Lihat penilaian
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Lamaran" subtitle="Status lamaran dari data sistem." />
          {data.applications.length === 0 ? (
            <EmptyState>Belum ada lamaran.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {data.applications.slice(0, 6).map((application) => (
                <div key={application.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[#1B1B1B]">{application.vacancy.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{application.vacancy.employer.name}</p>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </div>
              ))}
            </div>
          )}
          <SectionLink href="/applications">Lihat lamaran</SectionLink>
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Wawancara" subtitle="Jadwal dan status wawancara yang tercatat." />
          {data.interviews.length === 0 ? (
            <EmptyState>Belum ada wawancara.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {data.interviews.slice(0, 6).map((interview) => (
                <div key={interview.id} className="px-5 py-4">
                  <p className="text-sm font-semibold text-[#1B1B1B]">{interview.application.vacancy.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {interview.application.vacancy.employer.name} · {interview.status}
                  </p>
                  <time className="mt-1 block text-xs text-slate-500" dateTime={interview.scheduledAt}>
                    {new Date(interview.scheduledAt).toLocaleString("id-ID")}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Dokumen" subtitle="Dokumen yang tercatat pada akun Anda." />
          {data.documents.length === 0 ? (
            <EmptyState>Belum ada dokumen.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {data.documents.slice(0, 6).map((document) => (
                <div key={document.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-[#1B1B1B]">{document.fileName}</p>
                    <p className="mt-1 text-xs text-slate-500">{document.type}</p>
                  </div>
                  <span className="text-xs text-slate-600">{document.status}</span>
                </div>
              ))}
            </div>
          )}
          <SectionLink href="/documents">Lihat dokumen</SectionLink>
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Sertifikat" subtitle="Sertifikat yang tercatat pada akun Anda." />
          {data.certificates.length === 0 ? (
            <EmptyState>Belum ada sertifikat.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {data.certificates.slice(0, 6).map((certificate) => (
                <div key={certificate.id} className="flex items-center gap-3 px-5 py-4">
                  <Award className="size-5 text-[#BF120E]" />
                  <div>
                    <p className="text-sm font-semibold text-[#1B1B1B]">{certificate.certificateNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {certificate.program.name} · {certificate.batch.name} · {certificate.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <SectionLink href="/certificates">Lihat sertifikat</SectionLink>
        </section>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#1B1B1B]">{value}</p>
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

function EmptyState({ children }: { children: string }) {
  return <p className="px-5 py-8 text-center text-sm text-slate-500">{children}</p>;
}

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <div className="border-t border-[#EEEEEE] px-5 py-3">
      <Link href={href} className="text-xs font-semibold text-[#BF120E] hover:underline">
        {children}
      </Link>
    </div>
  );
}
