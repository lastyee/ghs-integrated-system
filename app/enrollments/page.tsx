import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { EnrollmentsPage } from "@/components/enrollments/enrollments-page";

export default async function EnrollmentsRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Enrollment"
      subtitle="Kelola pendaftaran peserta pada batch pelatihan"
      activeLabel="Enrollment"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <EnrollmentsPage userRole={user.role} />
    </AppShell>
  );
}
