import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { ProgramDetail } from "@/components/programs/program-detail";

export default async function ProgramDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Program"
      subtitle="Informasi detail program training GHS"
      activeLabel="Program"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <ProgramDetail programId={id} />
    </AppShell>
  );
}
