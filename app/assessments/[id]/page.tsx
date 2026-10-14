import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { AssessmentDetail } from "@/components/assessments/assessment-detail";
import { AppShell } from "@/components/layout/app-shell";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function AssessmentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const canDelete = await userHasPermission(user.id, "assessment:delete");
  const canDeleteScores = await userHasPermission(user.id, "assessment-score:delete");
  const canCreateScores = await userHasPermission(user.id, "assessment-score:create") || await userHasPermission(user.id, "assessment-score:update");

  let currentStudentId: string | undefined = undefined;
  if (user.role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (student) {
      currentStudentId = student.id;
    }
  }

  return (
    <AppShell title="Assessment Detail" subtitle="Detail assessment dan nilai peserta" activeLabel="Penilaian">
      <AssessmentDetail
        assessmentId={id}
        canDelete={canDelete}
        canDeleteScores={canDeleteScores}
        canCreateScores={canCreateScores}
        isStudent={user.role === "STUDENT"}
        currentStudentId={currentStudentId}
      />
    </AppShell>
  );
}
