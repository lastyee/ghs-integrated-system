import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { SchedulesPage } from "@/components/schedules/schedules-page";

export default async function SchedulesRoute() {
  const user = await requireAuthenticatedUser();
  return <AppShell title="Jadwal" subtitle="Kelola jadwal pembelajaran dan session training" activeLabel="Jadwal"><SchedulesPage userRole={user.role} /></AppShell>;
}
