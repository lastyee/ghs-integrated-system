import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { AssessmentsPage } from "@/components/assessments/assessments-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function AssessmentsRoute() {
  const user = await requireAuthenticatedUser();
  const [canDelete, canCreate] = await Promise.all([
    userHasPermission(user.id, "assessment:delete"),
    userHasPermission(user.id, "assessment:create"),
  ]);

  return <AppShell title="Assessment" subtitle="Kelola penilaian dan nilai peserta" activeLabel="Penilaian"><AssessmentsPage canDelete={canDelete} canCreate={canCreate} /></AppShell>;
}

