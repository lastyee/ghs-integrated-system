import { AcademicDashboard } from "@/components/dashboard/academic-dashboard";
import { AppShell } from "@/components/layout/app-shell";

export default function AcademicPage() {
  return (
    <AppShell title="Dashboard Akademik" activeLabel="Dashboard">
      <AcademicDashboard />
    </AppShell>
  );
}