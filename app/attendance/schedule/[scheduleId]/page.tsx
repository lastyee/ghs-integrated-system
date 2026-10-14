import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { AttendanceSessionDetail } from "@/components/attendance/attendance-session-detail";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function AttendanceSessionRoute({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";
  const [canDelete, canMutate] = await Promise.all([
    userHasPermission(user.id, "attendance:delete"),
    userHasPermission(user.id, "attendance:create"),
  ]);

  let currentStudentId: string | undefined = undefined;
  if (isStudent) {
    const student = await prisma.student.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (student) {
      currentStudentId = student.id;
    }
  }

  return (
    <AppShell
      title={isStudent ? "Kehadiran Saya" : "Attendance Session"}
      subtitle={isStudent ? "Detail catatan kehadiran Anda" : "Input kehadiran berbasis mock state"}
      activeLabel="Kehadiran"
    >
      <AttendanceSessionDetail
        scheduleId={scheduleId}
        canDelete={canDelete}
        canMutate={canMutate}
        isStudent={isStudent}
        currentStudentId={currentStudentId}
      />
    </AppShell>
  );
}
