import { requireAuthenticatedUser, requirePermission } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { StudentAssignmentsPage } from "@/components/assignments/student-assignments-page";
import { InstructorAssignmentsPage } from "@/components/assignments/instructor-assignments-page";

export default async function AssignmentsRoute() {
  const user = await requireAuthenticatedUser();
  await requirePermission("assignment:read");

  return (
    <AppShell
      title="Tugas"
      subtitle={
        user.role === "STUDENT"
          ? "Lihat tugas yang ditugaskan, batas pengumpulan, dan nilai"
          : "Kelola penugasan, lampiran materi, dan penilaian kelas"
      }
      activeLabel="Tugas"
    >
      {user.role === "STUDENT" ? (
        <StudentAssignmentsPage />
      ) : (
        <InstructorAssignmentsPage />
      )}
    </AppShell>
  );
}
