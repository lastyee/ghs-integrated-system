import { requireAuthenticatedUser } from "@/lib/authorization";
import { ApplicationsPage } from "@/components/applications/applications-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function ApplicationsRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title={isStudent ? "Lamaran Saya" : "Manajemen Lamaran"}
      subtitle={
        isStudent
          ? "Pantau status pengajuan lowongan kerja dan riwayat lamaran Anda"
          : "Kelola proses seleksi, screening kandidat, dan riwayat lamaran peserta"
      }
      activeLabel={isStudent ? "Lamaran Saya" : "Lamaran"}
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <ApplicationsPage userRole={user.role} userId={user.id} />
    </AppShell>
  );
}
