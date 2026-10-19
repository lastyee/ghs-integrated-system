import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { ScheduleDetail } from "@/components/schedules/schedule-detail";

export default async function ScheduleDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Jadwal"
      subtitle="Informasi detail jadwal sesi pembelajaran"
      activeLabel="Jadwal"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <ScheduleDetail scheduleId={id} />
    </AppShell>
  );
}
