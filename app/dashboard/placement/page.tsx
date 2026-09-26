import { PlacementDashboard } from "@/components/dashboard/placement-dashboard";
import { AppShell } from "@/components/layout/app-shell";

export default function PlacementPage() {
  return (
    <AppShell title="Dashboard Penempatan" activeLabel="Dashboard">
      <PlacementDashboard />
    </AppShell>
  );
}
