import { StatCard } from "@/components/dashboard/stat-card";
import {
  managementAcademicProgress,
  managementAttendanceOverview,
  managementCompletionOverview,
  managementInsights,
  managementPlacementDestinations,
  managementPlacementOverview,
  managementSummaryCards,
  managementTrainingOverview,
} from "@/lib/mock-data";

export function ManagementDashboard() {
  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-7">
        <p className="text-sm text-slate-500">Ringkasan perkembangan training dan penempatan peserta GHS</p>
      </div>

      <section aria-label="Ringkasan manajemen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {managementSummaryCards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <TrainingOverview />
        <AttendanceOverview />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AcademicProgress />
        <CompletionOverview />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <PlacementOverview />
        <PlacementDestination />
      </div>
      <div className="mt-6">
        <ManagementInsights />
      </div>
    </div>
  );
}

function TrainingOverview() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Ringkasan Training" subtitle="Program dan progress berdasarkan mock data" />
      <div className="divide-y divide-[#EEEEEE]">
        {managementTrainingOverview.map((item) => (
          <div key={item.program} className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[#1B1B1B]">{item.program}</h3>
              <span className="text-sm font-semibold text-[#1B1B1B]">{item.progress}%</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{item.participants}</span><span>{item.batches}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-md bg-slate-100">
              <div className={`h-full rounded-md ${item.color}`} style={{ width: `${item.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AttendanceOverview() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Ringkasan Kehadiran" subtitle="Distribusi kehadiran dari mock data" />
      <div className="p-5">
        <div className="flex h-4 overflow-hidden rounded-md bg-slate-100" aria-label="Distribusi kehadiran mock">
          {managementAttendanceOverview.map((item) => (
            <div key={item.label} className={item.color} style={{ width: `${item.value}%` }} title={`${item.label} ${item.value}%`} />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          {managementAttendanceOverview.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${item.color}`} />
              <span className="text-sm text-slate-600">{item.label}</span>
              <span className="ml-auto text-sm font-semibold text-[#1B1B1B]">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AcademicProgress() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Progress Akademik" subtitle="Progress per batch dari mock data" />
      <div className="space-y-5 p-5">
        {managementAcademicProgress.map((item) => (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">{item.label}</span>
              <span className="font-semibold text-[#1B1B1B]">{item.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-slate-100">
              <div className={`h-full rounded-md ${item.color}`} style={{ width: `${item.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompletionOverview() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Status Penyelesaian Peserta" subtitle="Distribusi status peserta dari mock data" />
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
        {managementCompletionOverview.map((item) => (
          <div key={item.status} className="rounded-lg border border-[#EEEEEE] p-3">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium tracking-wide ${item.color}`}>{item.status}</span>
            <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">{item.count}</p>
            <p className="text-xs text-slate-500">Peserta</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlacementOverview() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Ringkasan Penempatan" subtitle="Status placement dari mock data" />
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
        {managementPlacementOverview.map((item) => (
          <div key={item.status} className="rounded-lg border border-[#EEEEEE] p-3">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium tracking-wide ${item.color}`}>{item.status}</span>
            <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">{item.count}</p>
            <p className="text-xs text-slate-500">Peserta</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlacementDestination() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Distribusi Penempatan" subtitle="Wilayah dari Company Profile GHS dengan angka mock" />
      <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
        {managementPlacementDestinations.map((item) => (
          <div key={item.region}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">{item.region}</span>
              <span className="font-semibold text-[#1B1B1B]">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-slate-100">
              <div className={`h-full rounded-md ${item.color}`} style={{ width: `${Math.max(item.count * 10, 8)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ManagementInsights() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Ringkasan Informasi" subtitle="Ringkasan faktual berdasarkan mock data yang ditampilkan" />
      <div className="grid gap-3 p-5 md:grid-cols-3">
        {managementInsights.map((insight, index) => (
          <div key={insight} className="flex items-start gap-3 rounded-lg border border-[#EEEEEE] bg-[#F3F3F3]/60 p-4">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-[#1B1B1B] shadow-xs">{index + 1}</span>
            <p className="text-sm font-medium leading-6 text-slate-700">{insight}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-[#EEEEEE] px-5 py-4"><h2 className="text-sm font-semibold text-[#1B1B1B]">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div>;
}
