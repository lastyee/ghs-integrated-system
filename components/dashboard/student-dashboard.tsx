"use client";

import Link from "next/link";
import {
  Award,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  Loader2,
  MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  studentActivities,
  studentAssessments,
  studentAttendance,
  studentDocuments,
  studentProfile,
  studentSchedule,
} from "@/lib/mock-data";
import { ApplicationStatusBadge } from "@/components/applications/applications-page";

type StudentLiveApplication = {
  id: string;
  status: string;
  createdAt: string;
  vacancy: {
    title: string;
    employer: {
      name: string;
    };
  };
};

type StudentLiveInterview = {
  id: string;
  scheduledAt: string;
  method: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  application: {
    id: string;
    vacancy: {
      title: string;
      employer: {
        name: string;
      };
    };
  };
};

type StudentLivePlacement = {
  id: string;
  status: "PREPARATION" | "READY" | "DEPARTED" | "PLACED" | "CANCELLED";
  position: string;
  employer?: {
    name: string;
  };
};

type StudentDashboardProps = {
  userName?: string;
};

export function StudentDashboard({ userName }: StudentDashboardProps = {}) {
  const [applications, setApplications] = useState<StudentLiveApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [interviews, setInterviews] = useState<StudentLiveInterview[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(true);
  const [placements, setPlacements] = useState<StudentLivePlacement[]>([]);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/applications")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data)) {
            setApplications(data);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingApps(false);
      });

    fetch("/api/interviews")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data)) {
            setInterviews(data);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingInterviews(false);
      });

    fetch("/api/placements")
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json) ? json : json.data || [];
          if (isMounted) {
            setPlacements(list);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const activeAppsCount = applications.filter((a) =>
    ["APPLIED", "SCREENING", "INTERVIEW"].includes(a.status)
  ).length;

  const activePlacement =
    placements.find(
      (p) =>
        p.status === "PREPARATION" ||
        p.status === "READY" ||
        p.status === "DEPARTED" ||
        p.status === "PLACED"
    ) || placements[0];

  const placementStatusMap: Record<string, string> = {
    PREPARATION: "Persiapan",
    READY: "Siap",
    DEPARTED: "Berangkat",
    PLACED: "Ditempatkan",
    CANCELLED: "Dibatalkan",
  };

  const placementStatusText = activePlacement
    ? placementStatusMap[activePlacement.status] || activePlacement.status
    : "Belum Ada";

  const placementDesc = activePlacement
    ? activePlacement.position || "Status penempatan Anda"
    : "Belum terdaftar penempatan";

  const dynamicSummaryCards = [
    {
      label: "Progress Training",
      value: "68%",
      description: "Data progress training",
      icon: GraduationCap,
      tone: "navy" as const,
    },
    {
      label: "Kehadiran",
      value: "92%",
      description: "Ringkasan kehadiran",
      icon: CheckCircle2,
      tone: "red" as const,
    },
    {
      label: "Penilaian",
      value: "84",
      description: "Rata-rata Nilai",
      icon: FileCheck2,
      tone: "yellow" as const,
    },
    {
      label: "Lamaran Aktif",
      value: String(activeAppsCount),
      description: "Lamaran aktif Anda",
      icon: BriefcaseBusiness,
      tone: "blue" as const,
    },
    {
      label: "Status Placement",
      value: placementStatusText,
      description: placementDesc,
      icon: BriefcaseBusiness,
      tone: "navy" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
      <section
        aria-label="Ringkasan peserta"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {dynamicSummaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <ProfileSection userName={userName} />
        <ScheduleSection />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <AttendanceSection />
        <AssessmentSection />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <CareerSection applications={applications} loading={loadingApps} />
        <InterviewSection interviews={interviews} loading={loadingInterviews} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <DocumentsSection />
        <CertificateSection />
      </div>
      <div>
        <ActivitySection />
      </div>
    </div>
  );
}

function ProfileSection({ userName }: { userName?: string }) {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-[#1B1B1B]">Profil Mahasiswa</h2>
          <p className="mt-0.5 text-xs text-slate-500">Informasi identitas dan status akademik Anda</p>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#BF120E] hover:underline"
        >
          Lihat Profil Lengkap
          <ExternalLink className="size-3" />
        </Link>
      </div>
      <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
        {[
          ["Nama", userName || studentProfile.name],
          ["NIM Mahasiswa", studentProfile.studentId],
          ["Program", studentProfile.program],
          ["Peminatan", studentProfile.specialization],
          ["Batch", studentProfile.batch],
          ["Status", "Aktif"],
        ].map(([label, value]) => (
          <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-[#1B1B1B]">{value}</p></div>
        ))}
        <div className="sm:col-span-2">
          <div className="mb-2 flex justify-between text-xs"><span className="font-medium text-slate-600">Progress Training</span><span className="font-bold text-[#BF120E]">{studentProfile.progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#BF120E]" style={{ width: `${studentProfile.progress}%` }} /></div>
          <p className="mt-2 text-xs text-slate-500">Progress ini merupakan visualisasi ringkasan akademik untuk portal mahasiswa.</p>
        </div>
      </div>
    </section>
  );
}

function ScheduleSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <SectionHeading title="Jadwal Terdekat" subtitle="Jadwal training berdasarkan agenda perkuliahan" />
      <div className="divide-y divide-slate-100">
        {studentSchedule.map((item) => <div key={item.subject} className="px-5 py-3.5"><div className="flex items-start justify-between gap-3"><h3 className="text-xs font-semibold text-[#1B1B1B]">{item.subject}</h3><ScheduleBadge status={item.status} /></div><p className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 className="size-3" />{item.schedule}</p><p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3" />{item.location}</p></div>)}
      </div>
    </section>
  );
}

function AttendanceSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <SectionHeading title="Kehadiran" subtitle="Ringkasan kehadiran kumulatif mahasiswa" />
      <div className="p-5"><div className="flex h-4 overflow-hidden rounded-full bg-slate-100">{studentAttendance.map((item) => <div key={item.label} className={item.color} style={{ width: `${(item.value / 52) * 100}%` }} title={`${item.label}: ${item.value}`} />)}</div><div className="mt-4 grid grid-cols-2 gap-3">{studentAttendance.map((item) => <div key={item.label} className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${item.color}`} /><span className="text-xs text-slate-600">{item.label}</span><strong className="ml-auto text-xs text-[#1B1B1B]">{item.value}</strong></div>)}</div><Link href="/attendance" className="mt-4 inline-block text-xs font-semibold text-[#BF120E] hover:underline">Lihat Kehadiran</Link></div>
    </section>
  );
}

function AssessmentSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <SectionHeading title="Penilaian Terbaru" subtitle="Rata-rata nilai dan evaluasi kompetensi" />
      <div className="divide-y divide-slate-100">{studentAssessments.map((item) => <div key={item.subject} className="flex items-center justify-between gap-3 px-5 py-3.5"><div><p className="text-xs font-semibold text-[#1B1B1B]">{item.subject}</p><p className="mt-0.5 text-xs text-slate-500">{item.status}</p></div><div className="text-right"><p className="text-base font-bold text-[#1B1B1B]">{item.score}</p><p className="text-[11px] text-slate-500">{item.percentage}</p></div></div>)}</div>
    </section>
  );
}

function CareerSection({
  applications,
  loading,
}: {
  applications: StudentLiveApplication[];
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-[#1B1B1B]">Lamaran Saya</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Status pengajuan lowongan kerja real-time Anda
          </p>
        </div>
        <Link
          href="/applications"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#BF120E] hover:underline"
        >
          Lihat Semua
          <ExternalLink className="size-3" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-5 py-3 text-[11px] font-bold tracking-wide text-[#123b63]">
        <span>Applied</span>
        <span>↓</span>
        <span>Screening</span>
        <span>↓</span>
        <span>Interview</span>
        <span>↓</span>
        <span>Selected</span>
      </div>

      {loading ? (
        <div className="flex min-h-[140px] items-center justify-center p-6 text-xs text-slate-400">
          <Loader2 className="mr-2 size-4 animate-spin text-[#BF120E]" />
          Memuat lamaran...
        </div>
      ) : applications.length === 0 ? (
        <div className="flex min-h-[140px] flex-col items-center justify-center p-6 text-center">
          <BriefcaseBusiness className="size-6 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-700">
            Belum ada lamaran.
          </p>
          <Link
            href="/applications"
            className="mt-1 text-xs font-medium text-[#BF120E] hover:underline"
          >
            Ajukan Lamaran Kerja
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {applications.slice(0, 4).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/60"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/applications/${item.id}`}
                  className="text-xs font-semibold text-[#1B1B1B] hover:text-[#BF120E] hover:underline"
                >
                  {item.vacancy.title}
                </Link>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.vacancy.employer.name}
                </p>
              </div>
              <ApplicationStatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function InterviewSection({
  interviews,
  loading,
}: {
  interviews: StudentLiveInterview[];
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs" id="section-student-interviews">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-[#1B1B1B]">Interview Mendatang</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Agenda wawancara kerja Anda
          </p>
        </div>
        <Link
          href="/interviews"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#BF120E] hover:underline"
        >
          Lihat Semua
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {loading ? (
        <div data-testid="student-interviews-loading" className="flex min-h-[140px] items-center justify-center p-6 text-xs text-slate-400">
          <Loader2 className="mr-2 size-4 animate-spin text-[#BF120E]" />
          Memuat jadwal wawancara...
        </div>
      ) : interviews.length === 0 ? (
        <div data-testid="student-interviews-empty" className="flex min-h-[140px] flex-col items-center justify-center p-6 text-center">
          <CalendarDays className="size-6 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-700">
            Belum ada jadwal wawancara.
          </p>
          <p className="text-[11px] text-slate-400">
            Jadwal akan muncul di sini setelah divalidasi oleh tim penempatan.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {interviews.slice(0, 3).map((item) => {
            const dateObj = new Date(item.scheduledAt);
            const dateStr = !isNaN(dateObj.getTime())
              ? dateObj.toLocaleDateString("id-ID", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : item.scheduledAt;
            const timeStr = !isNaN(dateObj.getTime())
              ? dateObj.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "-";

            const statusConfig: Record<string, { label: string; class: string }> = {
              PENDING: { label: "Menunggu", class: "bg-slate-100 text-slate-700" },
              RESCHEDULED: { label: "Dijadwalkan Ulang", class: "bg-amber-50 text-amber-800" },
              PASSED: { label: "Lulus", class: "bg-emerald-50 text-emerald-700" },
              FAILED: { label: "Tidak Lulus", class: "bg-red-50 text-red-700" },
            };
            const badge = statusConfig[item.status] || {
              label: item.status,
              class: "bg-slate-100 text-slate-600",
            };

            return (
              <div key={item.id} className="p-4 sm:p-5">
                <div className="rounded-lg border border-[#EEEEEE] bg-slate-50/50 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-[#1B1B1B]">
                        {item.application.vacancy.employer.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {item.application.vacancy.title}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${badge.class}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-2.5 grid gap-1.5 text-[11px] text-slate-500 sm:grid-cols-2">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3 text-slate-400" />
                      {dateStr}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3 text-slate-400" />
                      {timeStr}
                    </span>
                    <span>Metode: {item.method || "OFFLINE"}</span>
                    {item.location && <span>Lokasi: {item.location}</span>}
                  </div>
                  {item.notes && (
                    <div className="mt-2 rounded bg-white p-2 text-[11px] text-slate-600 border border-slate-200">
                      <span className="font-medium text-slate-700">Catatan: </span>
                      {item.notes}
                    </div>
                  )}
                  <div className="mt-2.5 text-right">
                    <Link
                      href={`/interviews/${item.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#BF120E] hover:underline"
                    >
                      Lihat Rincian
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DocumentsSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <SectionHeading title="Dokumen Saya" subtitle="Status kelengkapan berkas akademik" />
      <div className="divide-y divide-slate-100">
        {studentDocuments.map((item) => (
          <div key={item.name} className="flex items-center justify-between px-5 py-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#1B1B1B]">
              <FileCheck2 className="size-4 text-slate-400" />
              {item.name}
            </span>
            <DocumentBadge status={item.status} />
          </div>
        ))}
      </div>
      <div className="border-t border-[#EEEEEE] px-5 py-3">
        <Link href="/documents" className="text-xs font-semibold text-[#BF120E] hover:underline">
          Lihat Semua Dokumen
        </Link>
      </div>
    </section>
  );
}

type StudentLiveCertificate = {
  id: string;
  certificateNumber: string;
  status: "ACTIVE" | "REVOKED";
  issuedAt: string;
  path: string | null;
  program: {
    name: string;
  };
  batch: {
    name: string;
  };
};

function CertificateSection() {
  const [certificates, setCertificates] = useState<StudentLiveCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/certificates")
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat sertifikat");
        const json = await res.json();
        if (isMounted) {
          setCertificates(json.data || []);
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Gagal memuat sertifikat");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <SectionHeading title="Sertifikat" subtitle="Informasi sertifikat kelulusan & pelatihan resmi" />
      {loading ? (
        <div data-testid="student-certificates-loading" className="flex min-h-[140px] items-center justify-center p-6 text-xs text-slate-400">
          <Loader2 className="mr-2 size-4 animate-spin text-[#BF120E]" />
          Memuat sertifikat...
        </div>
      ) : error ? (
        <div data-testid="student-certificates-error" className="flex min-h-[120px] flex-col items-center justify-center p-6 text-center text-xs text-red-600">
          <p>{error}</p>
        </div>
      ) : certificates.length === 0 ? (
        <div data-testid="student-certificates-empty" className="p-5">
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 p-4">
            <Award className="mt-0.5 size-5 text-slate-400" />
            <div>
              <p className="text-xs font-semibold text-[#1B1B1B]">Belum Ada Sertifikat</p>
              <p className="mt-0.5 text-xs text-slate-500">Sertifikat Anda akan ditampilkan di sini setelah diterbitkan oleh admin.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {certificates.map((cert) => {
            const dateStr = cert.issuedAt
              ? new Date(cert.issuedAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "-";
            const isRevoked = cert.status === "REVOKED";

            return (
              <div key={cert.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 rounded-lg border border-[#EEEEEE] bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Award className={`mt-0.5 size-5 ${isRevoked ? "text-red-600" : "text-[#BF120E]"}`} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[#1B1B1B]">{cert.certificateNumber}</span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            isRevoked
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {isRevoked ? "Dicabut" : "Aktif"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {cert.program?.name} • {cert.batch?.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Diterbitkan: {dateStr}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Link
                      href={`/certificates/${cert.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-[#1B1B1B] hover:border-slate-300 hover:bg-slate-50"
                    >
                      Lihat Rincian
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="border-t border-[#EEEEEE] px-5 py-3">
            <Link href="/certificates" className="text-xs font-semibold text-[#BF120E] hover:underline">
              Lihat Semua Sertifikat
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function ActivitySection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
      <SectionHeading title="Aktivitas Terbaru" subtitle="Aktivitas mahasiswa terkini" />
      <div className="grid gap-x-6 divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0">
        {studentActivities.map((activity, index) => (
          <div key={activity} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 md:nth-[2n]:border-b-0">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
              {index + 1}
            </span>
            <p className="text-xs font-medium text-slate-800">{activity}</p>
          </div>
        ))}
      </div>
    </section>
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

function ScheduleBadge({ status }: { status: string }) {
  const classes =
    status === "Selesai"
      ? "bg-emerald-50 text-emerald-700"
      : status === "Dibatalkan"
      ? "bg-red-50 text-red-700"
      : "bg-slate-100 text-slate-700";
  return <span className={`w-fit rounded-md px-2 py-0.5 text-[10px] font-medium ${classes}`}>{status}</span>;
}

function DocumentBadge({ status }: { status: string }) {
  const classes =
    status === "Verified"
      ? "bg-emerald-50 text-emerald-700"
      : status === "Rejected" || status === "Expired"
      ? "bg-red-50 text-red-700"
      : status === "Pending"
      ? "bg-amber-50 text-amber-800"
      : "bg-slate-100 text-slate-600";
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${classes}`}>{status}</span>;
}
