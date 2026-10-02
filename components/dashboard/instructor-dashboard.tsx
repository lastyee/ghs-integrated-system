import Link from "next/link";
import { BookOpen, CalendarDays, ClipboardCheck, Users } from "lucide-react";
import { PrismaClient } from "@prisma/client";
import { StatCard } from "@/components/dashboard/stat-card";
import { requirePermission } from "@/lib/authorization";
import { requireLinkedInstructor } from "@/lib/instructor-ownership";

const prisma = new PrismaClient();

export async function InstructorDashboard() {
  const authenticatedUser = await requirePermission("class:read");
  const instructor = await requireLinkedInstructor(authenticatedUser);

  const classes = await prisma.class.findMany({
    where: {
      deletedAt: null,
      instructorId: instructor.id,
      instructor: { deletedAt: null },
      batch: { deletedAt: null, program: { deletedAt: null } },
    },
    select: {
      id: true,
      name: true,
      batch: { select: { id: true, name: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const classIds = classes.map((classRecord) => classRecord.id);
  const batchIds = [...new Set(classes.map((classRecord) => classRecord.batch.id))];

  const [schedules, scheduleCount, studentCount, attendanceCount, assessments] = await Promise.all([
    prisma.schedule.findMany({
      where: {
        deletedAt: null,
        instructorId: instructor.id,
        instructor: { deletedAt: null },
        subject: { deletedAt: null },
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        room: true,
        class: { select: { id: true, name: true, batch: { select: { name: true } } } },
        subject: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 8,
    }),
    prisma.schedule.count({
      where: {
        deletedAt: null,
        instructorId: instructor.id,
        instructor: { deletedAt: null },
        subject: { deletedAt: null },
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
      },
    }),
    batchIds.length
      ? prisma.student.count({
          where: {
            deletedAt: null,
            enrollments: {
              some: {
                deletedAt: null,
                batchId: { in: batchIds },
                batch: { deletedAt: null, program: { deletedAt: null } },
              },
            },
          },
        })
      : Promise.resolve(0),
    prisma.attendance.count({
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        schedule: {
          deletedAt: null,
          instructorId: instructor.id,
          instructor: { deletedAt: null },
          subject: { deletedAt: null },
          class: {
            deletedAt: null,
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          },
        },
      },
    }),
    prisma.assessment.findMany({
      where: {
        deletedAt: null,
        classId: { in: classIds },
        subject: { deletedAt: null },
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        class: { select: { name: true, batch: { select: { name: true } } } },
        subject: { select: { name: true } },
        _count: {
          select: {
            scores: { where: { deletedAt: null, student: { deletedAt: null } } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 8,
    }),
  ]);

  const cards = [
    { label: "Kelas Saya", value: classes.length, icon: BookOpen, tone: "navy" as const },
    { label: "Jadwal Saya", value: scheduleCount, icon: CalendarDays, tone: "red" as const },
    { label: "Peserta di Batch Kelas", value: studentCount, icon: Users, tone: "yellow" as const },
    { label: "Catatan Kehadiran", value: attendanceCount, icon: ClipboardCheck, tone: "blue" as const },
  ];

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-7">
        <p className="text-sm text-slate-500">Data kelas dan jadwal yang ditugaskan kepada akun Anda.</p>
      </div>

      <section aria-label="Ringkasan instruktur" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={String(card.value)}
            description="Jumlah catatan tersimpan"
            icon={card.icon}
            tone={card.tone}
          />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Jadwal Mengajar" subtitle="Jadwal yang ditetapkan langsung kepada Anda." />
          {schedules.length === 0 ? (
            <EmptyState>Belum ada jadwal yang ditetapkan.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="px-5 py-4">
                  <p className="text-sm font-semibold text-[#1B1B1B]">{schedule.subject.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {schedule.class.name} · {schedule.class.batch.name} · {new Date(schedule.date).toLocaleDateString("id-ID")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(schedule.startTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {new Date(schedule.endTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    {schedule.room ? ` · ${schedule.room}` : ""}
                  </p>
                  <Link href={`/attendance/schedule/${schedule.id}`} className="mt-2 inline-block text-xs font-semibold text-[#BF120E] hover:underline">
                    Buka kehadiran
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Kelas Saya" subtitle="Kelas yang secara langsung ditugaskan kepada Anda." />
          {classes.length === 0 ? (
            <EmptyState>Belum ada kelas yang ditugaskan.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {classes.map((classRecord) => (
                <div key={classRecord.id} className="px-5 py-4">
                  <Link href={`/classes/${classRecord.id}`} className="text-sm font-semibold text-[#1B1B1B] hover:text-[#BF120E]">
                    {classRecord.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">{classRecord.batch.name}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white xl:col-span-2">
          <SectionHeading title="Penilaian Kelas Saya" subtitle="Penilaian berdasarkan kelas yang ditugaskan kepada Anda." />
          {assessments.length === 0 ? (
            <EmptyState>Belum ada penilaian untuk kelas yang ditugaskan.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {assessments.map((assessment) => (
                <div key={assessment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[#1B1B1B]">{assessment.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {assessment.subject.name} · {assessment.class.name} · {assessment.class.batch.name}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600">{assessment.status} · {assessment._count.scores} nilai</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-[#EEEEEE] px-5 py-4">
      <h2 className="text-sm font-semibold text-[#1B1B1B]">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <p className="px-5 py-8 text-center text-sm text-slate-500">{children}</p>;
}
