import { requireAuthenticatedUser } from "@/lib/authorization";
import { EmployersPage } from "@/components/employers/employers-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function EmployersRoute() {
  const user = await requireAuthenticatedUser();

  return (
    <AppShell
      title="Perusahaan Mitra"
      subtitle="Kelola jaringan perusahaan mitra industri dan penempatan kerja"
      activeLabel="Perusahaan"
    >
      <EmployersPage userRole={user.role} />
    </AppShell>
  );
}
