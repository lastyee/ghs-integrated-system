import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { SchedulesPage } from "@/components/schedules/schedules-page";

export default async function SchedulesRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";
  return (
    <AppShell
      title={isStudent ? "Kelas & Jadwal" : "Jadwal"}
      subtitle={isStudent ? "Jadwal mata kuliah dan sesi pembelajaran" : "Kelola jadwal pembelajaran dan session training"}
      activeLabel="Jadwal"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <SchedulesPage userRole={user.role} />
    </AppShell>
  );
}
