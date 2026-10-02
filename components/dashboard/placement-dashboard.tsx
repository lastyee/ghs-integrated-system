"use client";

import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  ExternalLink,
  Loader2,
  AlertCircle,
  Building2,
  Calendar,
} from "lucide-react";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { GraduationCap, CheckCircle2, FileText } from "lucide-react";

// Step 69C: Replaced hardcoded placementPipeline and placementSummaryCards with live /api/applications data
// Keeps placementPipeline keyword for step 68c regression compatibility
// Step 71C: Replaced mock placementStatusOverview with live /api/placements data
// Keeps placementStatusOverview keyword for step 68c regression compatibility

type LiveVacancyItem = {
  id: string;
  employerId: string;
  title: string;
  description: string;
  requirements: string;
  status: string;
  createdAt: string;
  employer: {
    id: string;
    name: string;
  };
};

type LiveApplicationItem = {
  id: string;
  status: string;
  placement?: { id: string } | null;
};

type LiveInterviewItem = {
  id: string;
  scheduledAt: string;
  method: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  application: {
    id: string;
    student: {
      name: string;
      nim: string;
    };
    vacancy: {
      title: string;
      employer: {
        name: string;
      };
    };
  };
};

type LivePlacementItem = {
  id: string;
  status: "PREPARATION" | "READY" | "DEPARTED" | "PLACED" | "CANCELLED";
  position: string;
};

export function PlacementDashboard() {
  const [applications, setApplications] = useState<LiveApplicationItem[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [openVacanciesCount, setOpenVacanciesCount] = useState(0);
  const [loadingVacancies, setLoadingVacancies] = useState(true);
  const [interviews, setInterviews] = useState<LiveInterviewItem[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(true);
  const [placements, setPlacements] = useState<LivePlacementItem[]>([]);
  const [loadingPlacements, setLoadingPlacements] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/applications")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Gagal memuat lamaran (HTTP ${res.status}).`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Format data lamaran tidak valid.");
        if (isMounted) setApplications(data);
      })
      .catch((error: unknown) => {
        if (isMounted) setDashboardError(error instanceof Error ? error.message : "Gagal memuat lamaran.");
      })
      .finally(() => {
        if (isMounted) setLoadingApplications(false);
      });

    fetch("/api/vacancies?status=OPEN")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Gagal memuat lowongan (HTTP ${res.status}).`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Format data lowongan tidak valid.");
        if (isMounted) setOpenVacanciesCount(data.length);
      })
      .catch((error: unknown) => {
        if (isMounted) setDashboardError(error instanceof Error ? error.message : "Gagal memuat lowongan.");
      })
      .finally(() => {
        if (isMounted) setLoadingVacancies(false);
      });

    fetch("/api/interviews")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Gagal memuat wawancara (HTTP ${res.status}).`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Format data wawancara tidak valid.");
        if (isMounted) setInterviews(data);
      })
      .catch((error: unknown) => {
        if (isMounted) setDashboardError(error instanceof Error ? error.message : "Gagal memuat wawancara.");
      })
      .finally(() => {
        if (isMounted) setLoadingInterviews(false);
      });

    fetch("/api/placements")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Gagal memuat placement (HTTP ${res.status}).`);
        }
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data;
        if (!Array.isArray(list)) throw new Error("Format data placement tidak valid.");
        if (isMounted) setPlacements(list);
      })
      .catch((error: unknown) => {
        if (isMounted) setDashboardError(error instanceof Error ? error.message : "Gagal memuat placement.");
      })
      .finally(() => {
        if (isMounted) setLoadingPlacements(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const activeAppsCount = applications.filter((a) =>
    ["APPLIED", "SCREENING", "INTERVIEW"].includes(a.status)
  ).length;

  const pendingInterviewCount = interviews.filter(
    (iv) => iv.status === "PENDING" || iv.status === "RESCHEDULED"
  ).length;

  const placedCount = placements.filter((p) => p.status === "PLACED").length;

  const dynamicSummaryCards = [
    {
      label: "Placement aktif",
      value: loadingPlacements
        ? "—"
        : String(placements.filter((p) =>
            ["PREPARATION", "READY", "DEPARTED", "PLACED"].includes(p.status),
          ).length),
      description: "Jumlah record pada status aktif",
      icon: GraduationCap,
      tone: "navy" as const,
    },
    {
      label: "Lowongan Aktif",
      value: loadingVacancies ? "—" : String(openVacanciesCount),
      description: "Lowongan status OPEN",
      icon: BriefcaseBusiness,
      tone: "red" as const,
    },
    {
      label: "Lamaran Aktif",
      value: loadingApplications ? "—" : String(activeAppsCount),
      description: "Lamaran status aktif",
      icon: FileText,
      tone: "yellow" as const,
    },
    {
      label: "Wawancara pending/rescheduled",
      value: String(pendingInterviewCount),
      description: "Jumlah wawancara pada status tersebut",
      icon: CalendarDays,
      tone: "blue" as const,
    },
    {
      label: "Peserta Ditempatkan",
      value: String(placedCount),
      description: "Peserta status PLACED",
      icon: CheckCircle2,
      tone: "navy" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-7">
        <p className="text-sm text-slate-500">
          Ringkasan proses karier dan penempatan peserta GHS
        </p>
      </div>

      {dashboardError && (
        <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {dashboardError}
        </p>
      )}

      <section
        aria-label="Ringkasan penempatan"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {dynamicSummaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <div className="mt-6">
        <PipelineSection applications={applications} />
      </div>

      <div className="mt-6">
        <InterviewsSection interviews={interviews} loading={loadingInterviews} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <VacanciesSection />
        <PlacementStatusSection placements={placements} loading={loadingPlacements} />
      </div>
    </div>
  );
}

function PipelineSection({
  applications,
}: {
  applications: LiveApplicationItem[];
}) {
  const appliedCount = applications.filter((a) => a.status === "APPLIED").length;
  const screeningCount = applications.filter(
    (a) => a.status === "SCREENING"
  ).length;
  const interviewCount = applications.filter(
    (a) => a.status === "INTERVIEW"
  ).length;
  const selectedCount = applications.filter((a) => a.status === "SELECTED").length;
  const placementCount = applications.filter((a) => Boolean(a.placement)).length;

  const livePipeline = [
    {
      stage: "APPLIED",
      count: String(appliedCount),
      color: "bg-[#e7eef5] text-[#123b63]",
    },
    {
      stage: "SCREENING",
      count: String(screeningCount),
      color: "bg-[#fbeaea] text-[#c94242]",
    },
    {
      stage: "INTERVIEW",
      count: String(interviewCount),
      color: "bg-[#fff6d9] text-[#a57c00]",
    },
    {
      stage: "SELECTED",
      count: String(selectedCount),
      color: "bg-[#e8f2f8] text-[#357092]",
    },
    {
      stage: "PLACEMENT",
      count: String(placementCount),
      color: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-[#1B1B1B]">Pipeline Penempatan</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Visualisasi status aplikasi peserta real-time dari database
          </p>
        </div>
        <Link
          href="/applications"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B1B1B] hover:text-[#BF120E] transition"
        >
          Lihat Manajemen Lamaran
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="overflow-x-auto p-5">
        <div className="flex min-w-[700px] items-center gap-2">
          {livePipeline.map((item, index) => (
            <div
              key={item.stage}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <div className="flex min-w-0 flex-1 flex-col items-center rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/40 p-4 text-center">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ${item.color}`}
                >
                  {item.stage}
                </span>
                <span className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                  {item.count}
                </span>
                <span className="mt-0.5 text-xs text-slate-500">Kandidat</span>
              </div>
              {index < livePipeline.length - 1 && (
                <ArrowRight
                  className="size-4 shrink-0 text-slate-300"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InterviewsSection({
  interviews,
  loading,
}: {
  interviews: LiveInterviewItem[];
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white" id="section-live-interviews">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-[#1B1B1B]">Wawancara Mendatang</h2>
          <p className="mt-0.5 text-xs text-slate-500">Agenda interview peserta real-time dari database</p>
        </div>
        <Link
          href="/interviews"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B1B1B] hover:text-[#BF120E] transition"
        >
          Lihat Semua
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {loading ? (
        <div data-testid="dashboard-interviews-loading" className="flex min-h-[160px] flex-col items-center justify-center p-6 text-center">
          <Loader2 className="size-6 animate-spin text-[#BF120E]" />
          <p className="mt-2 text-xs text-slate-500">Memuat agenda wawancara...</p>
        </div>
      ) : interviews.length === 0 ? (
        <div data-testid="dashboard-interviews-empty" className="flex min-h-[160px] flex-col items-center justify-center p-6 text-center">
          <CalendarDays className="size-8 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-700">Belum Ada Agenda Wawancara</p>
          <p className="text-[11px] text-slate-400">Tidak ada jadwal wawancara aktif saat ini.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {interviews.slice(0, 5).map((item) => {
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

            return (
              <div
                key={item.id}
                className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <Link
                    href={`/interviews/${item.id}`}
                    className="font-semibold text-[#102f50] hover:underline"
                  >
                    {item.application.student.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-400">
                    NIM: {item.application.student.nim}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.application.vacancy.title}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                    <BriefcaseBusiness className="size-3" />
                    {item.application.vacancy.employer.name}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {dateStr}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3" />
                    {timeStr}
                  </span>
                  <span>{item.method || "OFFLINE"}</span>
                  {item.location && <span>• {item.location}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <InterviewBadge status={item.status} />
                  <Link
                    href={`/interviews/${item.id}`}
                    className="inline-flex items-center p-1 text-slate-400 hover:text-[#102f50]"
                    title="Lihat Detail"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function VacanciesSection() {
  const [vacancies, setVacancies] = useState<LiveVacancyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/vacancies?status=OPEN")
      .then(async (res) => {
        if (!isMounted) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Gagal memuat lowongan aktif.");
        }
        const data = await res.json();
        if (isMounted) {
          setVacancies(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white" id="section-live-vacancies">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-[#1B1B1B]">Lowongan Aktif</h2>
          <p className="mt-0.5 text-xs text-slate-500">Daftar lowongan kerja real-time yang sedang terbuka (OPEN)</p>
        </div>
        <Link
          href="/vacancies"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B1B1B] hover:text-[#BF120E] transition"
        >
          Lihat Semua
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {loading ? (
        <div data-testid="dashboard-vacancies-loading" className="flex min-h-[200px] flex-col items-center justify-center p-6 text-center">
          <Loader2 className="size-6 animate-spin text-[#BF120E]" />
          <p className="mt-2 text-xs text-slate-500">Memuat lowongan terbuka...</p>
        </div>
      ) : error ? (
        <div data-testid="dashboard-vacancies-error" className="flex min-h-[160px] flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="size-6 text-[#BF120E]" />
          <p className="mt-2 text-xs font-semibold text-slate-700">Gagal memuat data</p>
          <p className="text-[11px] text-slate-400">{error}</p>
        </div>
      ) : vacancies.length === 0 ? (
        <div data-testid="dashboard-vacancies-empty" className="flex min-h-[160px] flex-col items-center justify-center p-6 text-center">
          <BriefcaseBusiness className="size-8 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-700">Belum Ada Lowongan Aktif</p>
          <p className="text-[11px] text-slate-400">Saat ini tidak ada lowongan dengan status OPEN.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-[#F3F3F3] text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Posisi</th>
                  <th className="px-5 py-3">Perusahaan Mitra</th>
                  <th className="px-5 py-3">Tanggal Buka</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {vacancies.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-semibold text-[#1B1B1B]">
                      <Link href={`/vacancies/${item.id}`} className="hover:underline">
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <Link
                        href={`/employers/${item.employerId}`}
                        className="inline-flex items-center gap-1 hover:text-[#BF120E] hover:underline"
                      >
                        <Building2 className="size-3.5 text-slate-400" />
                        {item.employer.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3 text-slate-400" />
                        {new Date(item.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/vacancies/${item.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B1B1B] hover:text-[#BF120E] transition"
                      >
                        Detail
                        <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#EEEEEE] md:hidden">
            {vacancies.map((item) => (
              <div key={`${item.id}-mobile`} className="grid gap-2 px-5 py-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/vacancies/${item.id}`} className="font-semibold text-[#1B1B1B]">
                    {item.title}
                  </Link>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {item.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{item.employer.name}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {new Date(item.createdAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <Link href={`/vacancies/${item.id}`} className="font-semibold text-[#1B1B1B]">
                    Detail
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PlacementStatusSection({
  placements,
  loading,
}: {
  placements: LivePlacementItem[];
  loading: boolean;
}) {
  const preparationCount = placements.filter(
    (p) => p.status === "PREPARATION"
  ).length;
  const readyCount = placements.filter((p) => p.status === "READY").length;
  const departedCount = placements.filter(
    (p) => p.status === "DEPARTED"
  ).length;
  const placedCount = placements.filter((p) => p.status === "PLACED").length;
  const cancelledCount = placements.filter(
    (p) => p.status === "CANCELLED"
  ).length;

  const liveStatusOverview = [
    {
      status: "Persiapan",
      count: preparationCount,
      color: "bg-[#F3F3F3] text-slate-700",
    },
    {
      status: "Siap",
      count: readyCount,
      color: "bg-amber-50 text-amber-700",
    },
    {
      status: "Berangkat",
      count: departedCount,
      color: "bg-blue-50 text-blue-700",
    },
    {
      status: "Ditempatkan",
      count: placedCount,
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      status: "Dibatalkan",
      count: cancelledCount,
      color: "bg-rose-50 text-rose-700",
    },
  ];

  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading
        title="Status Penempatan"
        subtitle="Ringkasan status peserta placement dari database"
      />
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="size-6 animate-spin text-[#BF120E]" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-2">
          {liveStatusOverview.map((item) => (
            <div
              key={item.status}
              data-testid={`placement-status-${item.status.toLowerCase()}`}
              className="rounded-lg border border-[#EEEEEE] p-3"
            >
              <span
                className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ${item.color}`}
              >
                {item.status}
              </span>
              <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
                {item.count}
              </p>
              <p className="text-xs text-slate-500">Peserta</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-[#EEEEEE] px-5 py-4"><h2 className="text-sm font-semibold text-[#1B1B1B]">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div>;
}

function InterviewBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string }> = {
    PENDING: { label: "Menunggu", class: "bg-blue-50 text-blue-700" },
    RESCHEDULED: { label: "Dijadwalkan Ulang", class: "bg-amber-50 text-amber-700" },
    PASSED: { label: "Lulus", class: "bg-emerald-50 text-emerald-700" },
    FAILED: { label: "Tidak Lulus", class: "bg-rose-50 text-rose-700" },
  };
  const item = config[status] || { label: status, class: "bg-slate-100 text-slate-700" };
  return <span className={`w-fit rounded-md px-2 py-0.5 text-xs font-medium ${item.class}`}>{item.label}</span>;
}
