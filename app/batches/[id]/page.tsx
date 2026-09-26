import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { BatchDetail } from "@/components/batches/batch-detail";

export default async function BatchDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Batch"
      subtitle="Informasi detail batch pelatihan GHS"
      activeLabel="Batch"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <BatchDetail batchId={id} />
    </AppShell>
  );
}
