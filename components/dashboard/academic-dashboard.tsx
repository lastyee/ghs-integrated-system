import { CalendarDays, ClipboardCheck, GraduationCap, Users } from "lucide-react";
import { PrismaClient } from "@prisma/client";
import { StatCard } from "@/components/dashboard/stat-card";
import { ForbiddenError, requirePermission } from "@/lib/authorization";

const prisma = new PrismaClient();

export async function AcademicDashboard() {
  const authenticatedUser = await requirePermission("class:read");
  if (authenticatedUser.role === "INSTRUCTOR") {
    throw new ForbiddenError();
  }

  const [programCount, batchCount, classCount, scheduleCount, schedules, batches] =
    await Promise.all([
      prisma.program.count({ where: { deletedAt: null } }),
      prisma.batch.count({
        where: { deletedAt: null, program: { deletedAt: null } },
      }),
      prisma.class.count({
        where: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
      }),
      prisma.schedule.count({
        where: {
          deletedAt: null,
          subject: { deletedAt: null },
          instructor: { deletedAt: null },
          class: {
            deletedAt: null,
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          },
        },
      }),
      prisma.schedule.findMany({
        where: {
          deletedAt: null,
          subject: { deletedAt: null },
          instructor: { deletedAt: null },
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
          subject: { select: { name: true } },
          instructor: { select: { name: true } },
          class: {
            select: {
              name: true,
              batch: { select: { name: true } },
            },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 8,
      }),
      prisma.batch.findMany({
        where: { deletedAt: null, program: { deletedAt: null } },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          program: { select: { name: true } },
          _count: {
            select: {
              enrollments: {
                where: { deletedAt: null, student: { deletedAt: null } },
              },
            },
          },
        },
        orderBy: [{ startDate: "desc" }, { id: "asc" }],
        take: 8,
      }),
    ]);

  const cards = [
    { label: "Programs", value: programCount, icon: GraduationCap, tone: "navy" as const },
    { label: "Batches", value: batchCount, icon: ClipboardCheck, tone: "red" as const },
    { label: "Classes", value: classCount, icon: Users, tone: "yellow" as const },
    { label: "Schedules", value: scheduleCount, icon: CalendarDays, tone: "blue" as const },
  ];

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-7">
        <p className="text-sm text-slate-500">Ringkasan data akademik dari catatan sistem.</p>
      </div>

      <section aria-label="Ringkasan akademik" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          <SectionHeading title="Jadwal" subtitle="Jadwal tersimpan, diurutkan berdasarkan tanggal dan waktu." />
          {schedules.length === 0 ? (
            <EmptyState>Belum ada jadwal tersimpan.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)]">
                  <p className="text-sm font-semibold text-[#1B1B1B]">
                    {new Date(schedule.date).toLocaleDateString("id-ID")}
                  </p>
                  <div>
                    <p className="text-sm font-semibold text-[#1B1B1B]">{schedule.subject.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {schedule.class.name} · {schedule.class.batch.name} · {schedule.instructor.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(schedule.startTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(schedule.endTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      {schedule.room ? ` · ${schedule.room}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <SectionHeading title="Batch" subtitle="Data batch dan jumlah enrollment tersimpan." />
          {batches.length === 0 ? (
            <EmptyState>Belum ada batch tersimpan.</EmptyState>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {batches.map((batch) => (
                <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[#1B1B1B]">{batch.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {batch.program.name} · Mulai {new Date(batch.startDate).toLocaleDateString("id-ID")}
                      {batch.endDate ? ` · Selesai ${new Date(batch.endDate).toLocaleDateString("id-ID")}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600">{batch._count.enrollments} enrollment</p>
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
