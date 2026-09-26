import { requireAuthenticatedUser } from "@/lib/authorization";
import { PlacementsPage } from "@/components/placements/placements-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function PlacementsRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title={isStudent ? "Penempatan Kerja Saya" : "Manajemen Penempatan Kerja"}
      subtitle={
        isStudent
          ? "Pantau status kesiapan, keberangkatan, dan penempatan kerja Anda"
          : "Kelola data penempatan kerja peserta, status kesiapan, keberangkatan, dan laporan mitra"
      }
      activeLabel={isStudent ? "Placement" : "Penempatan"}
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <PlacementsPage userRole={user.role} userId={user.id} />
    </AppShell>
  );
}
