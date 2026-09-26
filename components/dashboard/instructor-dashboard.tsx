import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  Clock3,
  FileCheck2,
  MapPin,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  instructorActivities,
  instructorAssessments,
  instructorAttendance,
  instructorStudents,
  instructorSummaryCards,
  instructorTodayClasses,
} from "@/lib/mock-data";

export function InstructorDashboard() {
  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-7">
        <p className="text-sm text-slate-500">Ringkasan kelas dan aktivitas mengajar Anda</p>
      </div>

      <section aria-label="Ringkasan instruktur" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {instructorSummaryCards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <TodayClassesSection />
        <AttendanceSection />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <StudentsSection />
        <AssessmentsSection />
      </div>
      <div className="mt-6">
        <ActivitySection />
      </div>
    </div>
  );
}

function TodayClassesSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Jadwal Mengajar Hari Ini" subtitle="Kelas yang ditangani instructor hari ini" />
      <div className="divide-y divide-[#EEEEEE]">
        {instructorTodayClasses.map((item) => (
          <div key={`${item.time}-${item.subject}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[125px_minmax(0,1fr)_auto] sm:items-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1B1B1B]">
              <Clock3 className="size-4 text-[#BF120E]" />{item.time}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">{item.subject}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{item.batch}</span>
                <span>{item.className}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{item.room}</span>
                <span className="inline-flex items-center gap-1"><Users className="size-3" />{item.participants}</span>
              </div>
            </div>
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
    </section>
  );
}

function AttendanceSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Kehadiran" subtitle="Kelas yang membutuhkan input kehadiran" />
      <div className="p-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <h3 className="font-semibold text-[#1B1B1B]">{instructorAttendance.subject}</h3>
              <p className="mt-1 text-sm text-slate-600">{instructorAttendance.batch} · {instructorAttendance.participants}</p>
              <StatusBadge status={instructorAttendance.status} />
              <Link href="/attendance" className="mt-4 inline-block rounded-md bg-[#BF120E] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a00f0c] transition">
                Isi Kehadiran
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StudentsSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Peserta Kelas Saya" subtitle="Daftar peserta berdasarkan mock data" />
      <div className="md:hidden divide-y divide-[#EEEEEE]">
        {instructorStudents.map((student) => <StudentCard key={student.id} student={student} />)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-155 text-left text-sm">
          <thead className="bg-[#F3F3F3] text-xs font-semibold text-slate-600">
            <tr>{["Nama", "ID Peserta", "Batch", "Kehadiran", "Status"].map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {instructorStudents.map((student) => (
              <tr key={student.id}>
                <td className="px-5 py-3.5 font-semibold text-[#1B1B1B]">{student.name}</td>
                <td className="px-5 py-3.5 text-slate-600">{student.id}</td>
                <td className="px-5 py-3.5 text-slate-600">{student.batch}</td>
                <td className="px-5 py-3.5 text-slate-600">{student.attendance}</td>
                <td className="px-5 py-3.5"><StudentStatus status={student.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StudentCard({ student }: { student: (typeof instructorStudents)[number] }) {
  return (
    <div className="grid gap-2 px-5 py-4 text-sm">
      <div className="flex items-center justify-between gap-3"><span className="font-semibold text-[#1B1B1B]">{student.name}</span><StudentStatus status={student.status} /></div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{student.id}</span><span>{student.batch}</span><span>Kehadiran {student.attendance}</span></div>
    </div>
  );
}

function AssessmentsSection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Penilaian" subtitle="Assessment yang membutuhkan perhatian instructor" />
      <div className="divide-y divide-[#EEEEEE]">
        {instructorAssessments.map((item) => (
          <div key={item.assessment} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-semibold text-[#1B1B1B]">{item.assessment}</h3><p className="mt-1 text-xs text-slate-500">{item.subject} · {item.batch} · {item.participants}</p></div>
              <StatusBadge status={item.status} />
            </div>
            <Link href="/assessments" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#BF120E] hover:text-[#a00f0c] transition">
              <FileCheck2 className="size-3.5" />Lihat Penilaian
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivitySection() {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title="Aktivitas Terbaru" subtitle="Aktivitas mengajar mock terbaru" />
      <div className="grid gap-x-6 divide-y divide-[#EEEEEE] md:grid-cols-2 md:divide-y-0">
        {instructorActivities.map((activity, index) => (
          <div key={activity} className="flex items-center gap-3 border-b border-[#EEEEEE] px-5 py-3.5 last:border-0 md:nth-[2n]:border-b-0">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#F3F3F3] text-xs font-semibold text-[#1B1B1B]">{index + 1}</span>
            <p className="text-sm font-medium text-slate-800">{activity}</p>
            <CalendarDays className="ml-auto size-4 shrink-0 text-slate-400" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-[#EEEEEE] px-5 py-4"><h2 className="text-sm font-semibold text-[#1B1B1B]">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  const classes = status === "Selesai"
    ? "bg-emerald-50 text-emerald-700"
    : status === "Sedang Berlangsung"
      ? "bg-blue-50 text-blue-700"
      : "bg-amber-50 text-amber-700";
  return <span className={`mt-2 inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-medium ${classes}`}>{status}</span>;
}

function StudentStatus({ status }: { status: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${status === "Aktif" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{status}</span>;
}
