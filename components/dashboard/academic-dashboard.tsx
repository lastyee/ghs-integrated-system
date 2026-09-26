import { CalendarDays, Clock3, MapPin, UserRound } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  academicActivities,
  academicBatches,
  academicProgress,
  academicSchedule,
  academicSummaryCards,
} from "@/lib/mock-data";

export function AcademicDashboard() {
  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-7">
        <p className="text-sm text-slate-500">Ringkasan kegiatan akademik dan pelatihan GHS</p>
      </div>

      <section aria-label="Ringkasan akademik" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {academicSummaryCards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <ScheduleSection />
        <ProgressSection />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <BatchSection />
        <ActivitySection />
      </div>
    </div>
  );
}

function ScheduleSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Jadwal Hari Ini" subtitle="Agenda akademik mock untuk hari ini" />
      <div className="divide-y divide-[#EEEEEE]">
        {academicSchedule.map((item) => (
          <div key={`${item.time}-${item.subject}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[125px_minmax(0,1fr)_auto] sm:items-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1B1B1B]"><Clock3 className="size-4 text-[#BF120E]" />{item.time}</div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">{item.subject}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{item.batch}</span><span className="inline-flex items-center gap-1"><UserRound className="size-3" />{item.instructor}</span><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{item.room}</span>
              </div>
            </div>
            <span className="w-fit rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{item.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BatchSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Batch Aktif" subtitle="Daftar batch aktif berdasarkan mock data" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-155 text-left text-sm">
          <thead className="bg-[#F3F3F3] text-xs font-semibold text-slate-600"><tr>{["Nama Batch", "Program", "Jumlah Peserta", "Status", "Periode"].map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#EEEEEE]">{academicBatches.map((batch) => <tr key={batch.name}><td className="px-5 py-3.5 font-semibold text-[#1B1B1B]">{batch.name}</td><td className="px-5 py-3.5 text-slate-600">{batch.program}</td><td className="px-5 py-3.5 text-slate-600">{batch.participants}</td><td className="px-5 py-3.5"><span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{batch.status}</span></td><td className="px-5 py-3.5 text-slate-600">{batch.period}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ProgressSection() {
  return <section className="rounded-lg border border-[#EEEEEE] bg-white p-5"><SectionHeading title="Progress Akademik" subtitle="Visual progress mock setiap batch" /><div className="space-y-5">{academicProgress.map((item) => <div key={item.batch}><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-slate-600">{item.batch}</span><span className="font-semibold text-[#1B1B1B]">{item.progress}%</span></div><div className="h-2 overflow-hidden rounded-md bg-slate-100"><div className={`h-full rounded-md ${item.color}`} style={{ width: `${item.progress}%` }} /></div></div>)}</div></section>;
}

function ActivitySection() {
  return <section className="rounded-lg border border-[#EEEEEE] bg-white"><SectionHeading title="Aktivitas Akademik Terbaru" subtitle="Aktivitas mock terbaru" /><div className="divide-y divide-[#EEEEEE]">{academicActivities.map((activity, index) => <div key={activity} className="flex items-center gap-3 px-5 py-3.5"><span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#F3F3F3] text-xs font-semibold text-[#1B1B1B]">{index + 1}</span><p className="text-sm font-medium text-slate-800">{activity}</p><CalendarDays className="ml-auto size-4 shrink-0 text-slate-400" /></div>)}</div></section>;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-[#EEEEEE] px-5 py-4"><h2 className="text-sm font-semibold text-[#1B1B1B]">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div>;
}