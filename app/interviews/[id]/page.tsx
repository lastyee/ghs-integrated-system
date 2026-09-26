import { requireAuthenticatedUser } from "@/lib/authorization";
import { InterviewDetail } from "@/components/interviews/interview-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function InterviewDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Rincian Wawancara"
      subtitle="Informasi jadwal, logistik pelaksanaan, dan catatan wawancara kandidat"
      activeLabel={isStudent ? "Interview" : "Wawancara"}
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <InterviewDetail
        interviewId={id}
        userRole={user.role}
        userId={user.id}
      />
    </AppShell>
  );
}
