import { requireAuthenticatedUser } from "@/lib/authorization";
import { PlacementDetail } from "@/components/placements/placement-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function PlacementDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Rincian Penempatan Kerja"
      subtitle="Informasi status kesiapan, rincian posisi, perusahaan mitra, dan jadwal penempatan"
      activeLabel={isStudent ? "Placement" : "Penempatan"}
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <PlacementDetail
        placementId={id}
        userRole={user.role}
        userId={user.id}
      />
    </AppShell>
  );
}
