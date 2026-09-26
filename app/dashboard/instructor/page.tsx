import { InstructorDashboard } from "@/components/dashboard/instructor-dashboard";
import { AppShell } from "@/components/layout/app-shell";

export default function InstructorPage() {
  return (
    <AppShell title="Dashboard Instruktur" activeLabel="Dashboard">
      <InstructorDashboard />
    </AppShell>
  );
}
