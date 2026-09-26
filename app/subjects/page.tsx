import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { SubjectsPage } from "@/components/subjects/subjects-page";

export default async function SubjectsRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Mata Pelajaran"
      subtitle="Kelola mata pelajaran dan materi training"
      activeLabel="Mata Pelajaran"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <SubjectsPage userRole={user.role} />
    </AppShell>
  );
}
