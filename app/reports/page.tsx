import { ReportsPage } from "@/components/reports/reports-page";
import { AppShell } from "@/components/layout/app-shell";

export default function ReportsRoute() {
  return (
    <AppShell
      title="Laporan & Statistik"
      subtitle="Analitik live data performa akademik dan penempatan kerja GHS"
      activeLabel="Laporan"
    >
      <ReportsPage />
    </AppShell>
  );
}
