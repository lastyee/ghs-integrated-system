import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { AssessmentsPage } from "@/components/assessments/assessments-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function AssessmentsRoute() {
  const user = await requireAuthenticatedUser();
  const canDelete = await userHasPermission(user.id, "assessment:delete");

  return <AppShell title="Assessment" subtitle="Kelola penilaian dan nilai peserta" activeLabel="Penilaian"><AssessmentsPage canDelete={canDelete} /></AppShell>;
}
