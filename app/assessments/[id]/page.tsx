import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { AssessmentDetail } from "@/components/assessments/assessment-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function AssessmentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const canDelete = await userHasPermission(user.id, "assessment:delete");
  const canDeleteScores = await userHasPermission(user.id, "assessment-score:delete");

  return <AppShell title="Assessment Detail" subtitle="Detail assessment dan nilai peserta" activeLabel="Penilaian"><AssessmentDetail assessmentId={id} canDelete={canDelete} canDeleteScores={canDeleteScores} /></AppShell>;
}
