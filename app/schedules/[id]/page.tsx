import { AppShell } from "@/components/layout/app-shell";
import { ScheduleDetail } from "@/components/schedules/schedule-detail";

export default async function ScheduleDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Detail Jadwal" subtitle="Informasi schedule mock" activeLabel="Jadwal"><ScheduleDetail scheduleId={id} /></AppShell>;
}
