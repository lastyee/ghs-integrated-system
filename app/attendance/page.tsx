import { AppShell } from "@/components/layout/app-shell";
import { AttendancePage } from "@/components/attendance/attendance-page";

export default function AttendanceRoute() {
  return <AppShell title="Attendance" subtitle="Kelola kehadiran peserta pada setiap sesi training" activeLabel="Kehadiran"><AttendancePage /></AppShell>;
}
