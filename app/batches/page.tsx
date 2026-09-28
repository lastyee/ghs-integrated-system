import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { BatchesPage } from "@/components/batches/batches-page";

export default async function BatchesRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";
  const canDelete = await userHasPermission(user.id, "batch:delete");

  return (
    <AppShell
      title="Batch"
      subtitle="Kelola batch training dan periode akademik"
      activeLabel="Batch"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <BatchesPage userRole={user.role} canDelete={canDelete} />
    </AppShell>
  );
}
