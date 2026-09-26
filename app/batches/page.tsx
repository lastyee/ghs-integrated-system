import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { BatchesPage } from "@/components/batches/batches-page";

export default async function BatchesRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Batch"
      subtitle="Kelola batch training dan periode akademik"
      activeLabel="Batch"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <BatchesPage userRole={user.role} />
    </AppShell>
  );
}
