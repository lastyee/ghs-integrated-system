import { requireAuthenticatedUser, requirePermission, userHasPermission } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { InstructorsPage } from "@/components/instructors/instructors-page";

export default async function InstructorsRoute() {
  const user = await requireAuthenticatedUser();
  await requirePermission("class:read");
  const canDelete = await userHasPermission(user.id, "instructor:delete");

  return (
    <AppShell
      title="Instruktur"
      subtitle="Kelola data instruktur pengampu"
      activeLabel="Instruktur"
      sidebarVariant="staff"
    >
      <InstructorsPage canDelete={canDelete} />
    </AppShell>
  );
}
