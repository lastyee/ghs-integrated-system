import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { AttendanceSessionDetail } from "@/components/attendance/attendance-session-detail";

export default async function AttendanceSessionRoute({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  const user = await requireAuthenticatedUser();
  const canDelete = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  return <AppShell title="Attendance Session" subtitle="Input kehadiran berbasis mock state" activeLabel="Kehadiran"><AttendanceSessionDetail scheduleId={scheduleId} canDelete={canDelete} /></AppShell>;
}
