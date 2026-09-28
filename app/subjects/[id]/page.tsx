import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { SubjectDetail } from "@/components/subjects/subject-detail";

export default async function SubjectDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Mata Pelajaran"
      subtitle="Informasi detail mata pelajaran training GHS"
      activeLabel="Mata Pelajaran"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <SubjectDetail subjectId={id} userRole={user.role} />
    </AppShell>
  );
}
