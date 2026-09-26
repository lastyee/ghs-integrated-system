import { EmployersPage } from "@/components/employers/employers-page";
import { AppShell } from "@/components/layout/app-shell";

export default function EmployersRoute() {
  return (
    <AppShell
      title="Perusahaan Mitra"
      subtitle="Kelola jaringan perusahaan mitra industri dan penempatan kerja"
      activeLabel="Perusahaan"
    >
      <EmployersPage />
    </AppShell>
  );
}
