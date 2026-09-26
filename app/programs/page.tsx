import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { ProgramsPage } from "@/components/programs/programs-page";

export default async function ProgramsRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Program"
      subtitle="Kelola program training GHS"
      activeLabel="Program"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <ProgramsPage userRole={user.role} />
    </AppShell>
  );
}
