import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/lib/authorization";

export default async function StudentPage() {
  const user = await requireAuthenticatedUser();

  return (
    <AppShell
      title="Dashboard"
      subtitle="Ringkasan perkembangan training dan career Anda"
      activeLabel="Dashboard"
      sidebarVariant="student"
    >
      <StudentDashboard userName={user.name || undefined} />
    </AppShell>
  );
}
