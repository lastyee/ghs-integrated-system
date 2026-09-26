import { ManagementDashboard } from "@/components/dashboard/management-dashboard";
import { AppShell } from "@/components/layout/app-shell";

export default function ManagementPage() {
  return (
    <AppShell title="Dashboard Manajemen" activeLabel="Dashboard">
      <ManagementDashboard />
    </AppShell>
  );
}
