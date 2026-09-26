import { AppShell } from "@/components/layout/app-shell";
import { SchedulesPage } from "@/components/schedules/schedules-page";

export default function SchedulesRoute() {
  return <AppShell title="Jadwal" subtitle="Kelola jadwal pembelajaran dan session training" activeLabel="Jadwal"><SchedulesPage /></AppShell>;
}
