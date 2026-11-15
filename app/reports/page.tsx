import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/authorization";
import { redirect } from "next/navigation";
import { ReportsPage } from "@/components/reports/reports-page";
import { AppShell } from "@/components/layout/app-shell";

const ALLOWED_REPORT_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGEMENT",
  "ACADEMIC_STAFF",
  "PLACEMENT_STAFF",
];

export default async function ReportsRoute() {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  if (!ALLOWED_REPORT_ROLES.includes(user.role)) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      title="Laporan & Statistik"
      subtitle="Analitik live data performa akademik dan penempatan kerja GHS"
      activeLabel="Laporan"
    >
      <ReportsPage initialRole={user.role} />
    </AppShell>
  );
}
