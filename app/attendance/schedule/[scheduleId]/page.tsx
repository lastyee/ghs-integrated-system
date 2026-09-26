import { AppShell } from "@/components/layout/app-shell";
import { AttendanceSessionDetail } from "@/components/attendance/attendance-session-detail";

export default async function AttendanceSessionRoute({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  return <AppShell title="Attendance Session" subtitle="Input kehadiran berbasis mock state" activeLabel="Kehadiran"><AttendanceSessionDetail scheduleId={scheduleId} /></AppShell>;
}
