import { PrismaClient } from "@prisma/client";
import { StatCard } from "@/components/dashboard/stat-card";
import { requirePermission } from "@/lib/authorization";

const prisma = new PrismaClient();

export async function ManagementDashboard() {
  await Promise.all([
    requirePermission("student:read"),
    requirePermission("program:read"),
    requirePermission("batch:read"),
    requirePermission("enrollment:read"),
    requirePermission("class:read"),
    requirePermission("schedule:read"),
    requirePermission("attendance:read"),
    requirePermission("assessment:read"),
    requirePermission("document:read"),
    requirePermission("employer:read"),
    requirePermission("vacancy:read"),
    requirePermission("application:read"),
    requirePermission("interview:read"),
    requirePermission("placement:read"),
    requirePermission("certificate:read"),
    requirePermission("audit:read"),
  ]);

  const [
    students,
    programs,
    batches,
    enrollments,
    classes,
    schedules,
    attendances,
    assessments,
    documents,
    employers,
    vacancies,
    applications,
    interviews,
    placements,
    certificates,
    placementStatuses,
    applicationStatuses,
    documentStatuses,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.program.count({ where: { deletedAt: null } }),
    prisma.batch.count({
      where: { deletedAt: null, program: { deletedAt: null } },
    }),
    prisma.enrollment.count({
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        batch: { deletedAt: null, program: { deletedAt: null } },
      },
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
    prisma.attendance.count({
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        schedule: {
          deletedAt: null,
          subject: { deletedAt: null },
          instructor: { deletedAt: null },
          class: {
            deletedAt: null,
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          },
        },
      },
    }),
    prisma.assessment.count({
      where: {
        deletedAt: null,
        subject: { deletedAt: null },
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
      },
    }),
    prisma.document.count({
      where: { deletedAt: null, student: { deletedAt: null } },
    }),
    prisma.employer.count({ where: { deletedAt: null } }),
    prisma.vacancy.count({
      where: { deletedAt: null, employer: { deletedAt: null } },
    }),
    prisma.application.count({
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        vacancy: {
          deletedAt: null,
          employer: { deletedAt: null },
        },
      },
    }),
    prisma.interview.count({
      where: {
        deletedAt: null,
        application: {
          deletedAt: null,
          student: { deletedAt: null },
          vacancy: { deletedAt: null, employer: { deletedAt: null } },
        },
      },
    }),
    prisma.placement.count({
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        employer: { deletedAt: null },
        OR: [
          { vacancyId: null },
          { vacancy: { deletedAt: null, employer: { deletedAt: null } } },
        ],
        AND: [
          {
            OR: [
              { applicationId: null },
              {
                application: {
                  deletedAt: null,
                  student: { deletedAt: null },
                  vacancy: { deletedAt: null, employer: { deletedAt: null } },
                },
              },
            ],
          },
        ],
      },
    }),
    prisma.certificate.count({
      where: {
        status: "ACTIVE",
        student: { deletedAt: null },
        program: { deletedAt: null },
        batch: { deletedAt: null },
      },
    }),
    prisma.placement.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        employer: { deletedAt: null },
        OR: [
          { vacancyId: null },
          { vacancy: { deletedAt: null, employer: { deletedAt: null } } },
        ],
        AND: [
          {
            OR: [
              { applicationId: null },
              {
                application: {
                  deletedAt: null,
                  student: { deletedAt: null },
                  vacancy: { deletedAt: null, employer: { deletedAt: null } },
                },
              },
            ],
          },
        ],
      },
    }),
    prisma.application.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        vacancy: { deletedAt: null, employer: { deletedAt: null } },
      },
    }),
    prisma.document.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { deletedAt: null, student: { deletedAt: null } },
    }),
    prisma.auditLog.findMany({
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 8,
    }),
  ]);

  const cards = [
    ["Students", students],
    ["Programs", programs],
    ["Batches", batches],
    ["Enrollments", enrollments],
    ["Classes", classes],
    ["Schedules", schedules],
    ["Attendance records", attendances],
    ["Assessments", assessments],
    ["Documents", documents],
    ["Employers", employers],
    ["Vacancies", vacancies],
    ["Applications", applications],
    ["Interviews", interviews],
    ["Placements", placements],
    ["Certificates", certificates],
  ] as const;

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-7">
        <p className="text-sm text-slate-500">Jumlah catatan aktual yang tersimpan pada sistem.</p>
      </div>

      <section aria-label="Jumlah data operasional" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <StatCard
            key={label}
            label={label}
            value={String(value)}
            description="Jumlah catatan tersimpan"
          />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <StatusSection
          title="Applications"
          statuses={applicationStatuses.map(({ status, _count }) => ({
            status,
            count: _count._all,
          }))}
        />
        <StatusSection
          title="Placements"
          statuses={placementStatuses.map(({ status, _count }) => ({
            status,
            count: _count._all,
          }))}
        />
        <StatusSection
          title="Documents"
          statuses={documentStatuses.map(({ status, _count }) => ({
            status,
            count: _count._all,
          }))}
        />
      </div>

      <section className="mt-6 rounded-lg border border-[#EEEEEE] bg-white">
        <SectionHeading title="Audit log terbaru" subtitle="Catatan terbaru; isi perubahan tidak ditampilkan di dashboard." />
        {recentAuditLogs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Belum ada aktivitas tercatat.</p>
        ) : (
          <div className="divide-y divide-[#EEEEEE]">
            {recentAuditLogs.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-[#1B1B1B]">
                    {entry.action} · {entry.entity}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {entry.user?.name ?? "Akun tidak tersedia"} · {entry.entityId}
                  </p>
                </div>
                <time className="text-xs text-slate-500" dateTime={entry.createdAt.toISOString()}>
                  {entry.createdAt.toLocaleString("id-ID")}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusSection({
  title,
  statuses,
}: {
  title: string;
  statuses: Array<{ status: string; count: number }>;
}) {
  return (
    <section className="rounded-lg border border-[#EEEEEE] bg-white">
      <SectionHeading title={title} subtitle="Jumlah per status tersimpan." />
      {statuses.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">Belum ada catatan.</p>
      ) : (
        <div className="divide-y divide-[#EEEEEE]">
          {statuses.map(({ status, count }) => (
            <div key={status} className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-slate-600">{status}</span>
              <span className="text-sm font-semibold text-[#1B1B1B]">{count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
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
