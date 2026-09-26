import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { ClassesPage } from "@/components/classes/classes-page";

export default async function ClassesRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Kelas"
      subtitle="Kelola kelompok belajar dan instruktur pengampu"
      activeLabel="Kelas"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <ClassesPage userRole={user.role} />
    </AppShell>
  );
}
