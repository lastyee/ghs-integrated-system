import { requireAuthenticatedUser } from "@/lib/authorization";
import { StudentDetail } from "@/components/students/student-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function StudentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthenticatedUser();
  const { id } = await params;
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Peserta"
      subtitle="Informasi peserta dan progress training"
      activeLabel="Peserta"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <StudentDetail studentId={id} userRole={user.role} />
    </AppShell>
  );
}
