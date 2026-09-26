import { AssessmentDetail } from "@/components/assessments/assessment-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function AssessmentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Assessment Detail" subtitle="Detail assessment dan nilai peserta" activeLabel="Penilaian"><AssessmentDetail assessmentId={id} /></AppShell>;
}
