import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { AttendanceSessionDetail } from "@/components/attendance/attendance-session-detail";

export default async function AttendanceSessionRoute({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  const user = await requireAuthenticatedUser();
  const [canDelete, canMutate] = await Promise.all([
    userHasPermission(user.id, "attendance:delete"),
    userHasPermission(user.id, "attendance:create"),
  ]);
  return <AppShell title="Attendance Session" subtitle="Input kehadiran berbasis mock state" activeLabel="Kehadiran"><AttendanceSessionDetail scheduleId={scheduleId} canDelete={canDelete} canMutate={canMutate} /></AppShell>;
}
