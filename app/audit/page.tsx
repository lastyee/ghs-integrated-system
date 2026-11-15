import { AppShell } from "@/components/layout/app-shell";
import { AuditLogsPage } from "@/components/audit/audit-logs-page";
import {
  requirePermission,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/ui/page-container";

export default async function AuditRoute() {
  let user;
  try {
    user = await requirePermission("audit:read");
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }

  return (
    <AppShell
      title="Audit Log Sistem"
      subtitle="Riwayat aktivitas dan mutasi data sistem terenkapsulasi dan transparan"
      activeLabel="Audit Log"
    >
      <PageContainer maxWidth="wide">
        <PageHeader
          title="Audit Log Sistem"
          description="Riwayat aktivitas dan mutasi data sistem terenkapsulasi dan transparan"
        />
        <AuditLogsPage currentUserRole={user.role} />
      </PageContainer>
    </AppShell>
  );
}
