import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import {
  ForbiddenError,
  requireAuthenticatedUser,
  requirePermission,
} from "@/lib/authorization";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemOverview } from "@/components/dashboard/system-overview";
import { AppShell } from "@/components/layout/app-shell";
import { FileCheck2, GraduationCap, Users, ClipboardCheck } from "lucide-react";

const prisma = new PrismaClient();

export default async function Home() {
  const user = await requireAuthenticatedUser();

  if (user.role === "STUDENT") {
    redirect("/dashboard/student");
  }
  if (user.role === "INSTRUCTOR") {
    redirect("/dashboard/instructor");
  }
  if (user.role === "ACADEMIC_STAFF") {
    redirect("/dashboard/academic");
  }
  if (user.role === "PLACEMENT_STAFF") {
    redirect("/dashboard/placement");
  }
  if (user.role === "MANAGEMENT") {
    redirect("/dashboard/management");
  }
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    throw new ForbiddenError();
  }

  await Promise.all([
    requirePermission("student:read"),
    requirePermission("batch:read"),
    requirePermission("document:read"),
    requirePermission("audit:read"),
  ]);

  const [
    userCount,
    studentCount,
    pendingDocumentCount,
    auditCount,
    programCount,
    classCount,
    scheduleCount,
    recentLogs,
  ] =
    await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      prisma.document.count({
        where: { deletedAt: null, student: { deletedAt: null }, status: "PENDING" },
      }),
      prisma.auditLog.count(),
      prisma.program.count({ where: { deletedAt: null } }),
      prisma.class.count({
        where: {
          deletedAt: null,
          batch: { program: { deletedAt: null } },
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
            batch: { program: { deletedAt: null } },
            instructor: { deletedAt: null },
          },
        },
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
        take: 5,
      }),
    ]);

  const statCards = [
    { label: "Users", value: userCount, icon: Users, tone: "navy" as const },
    { label: "Peserta Aktif", value: studentCount, icon: GraduationCap, tone: "red" as const },
    {
      label: "Batch Aktif",
      value: "—",
      description: "Kriteria Batch Aktif belum ditetapkan oleh GHS",
      icon: ClipboardCheck,
      tone: "yellow" as const,
    },
    { label: "Audit events", value: auditCount, icon: FileCheck2, tone: "blue" as const },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-375 p-4 sm:p-8">
        <div className="mb-7">
          <p className="text-sm text-slate-500">Ringkasan aktivitas dan kondisi sistem GHS</p>
        </div>
        <section aria-label="Statistik ringkasan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={String(card.value)}
              description={card.description ?? "Jumlah catatan tersimpan"}
              icon={card.icon}
              tone={card.tone}
            />
          ))}
        </section>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <RecentActivity entries={recentLogs} />
          <SystemOverview
            items={[
              { label: "Programs", value: programCount },
              { label: "Classes", value: classCount },
              { label: "Schedules", value: scheduleCount },
              { label: "Pending documents", value: pendingDocumentCount },
            ]}
          />
        </div>
      </div>
    </AppShell>
  );
}
