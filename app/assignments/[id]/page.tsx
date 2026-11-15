import { requireAuthenticatedUser, requirePermission } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { StudentAssignmentDetail } from "@/components/assignments/student-assignment-detail";
import { InstructorAssignmentDetail } from "@/components/assignments/instructor-assignment-detail";

export default async function AssignmentDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuthenticatedUser();
  await requirePermission("assignment:read");
  const { id } = await params;

  return (
    <AppShell
      title="Detail Tugas"
      subtitle={
        user.role === "STUDENT"
          ? "Instruksi, materi lampiran, dan pengumpulan tugas"
          : "Detail penugasan, berkas instruksi, dan rekap penilaian mahasiswa"
      }
      activeLabel="Tugas"
    >
      {user.role === "STUDENT" ? (
        <StudentAssignmentDetail assignmentId={id} />
      ) : (
        <InstructorAssignmentDetail assignmentId={id} />
      )}
    </AppShell>
  );
}
