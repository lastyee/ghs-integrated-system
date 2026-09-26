import { requireAuthenticatedUser } from "@/lib/authorization";
import { InterviewsPage } from "@/components/interviews/interviews-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function InterviewsRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title={isStudent ? "Wawancara Saya" : "Manajemen Wawancara"}
      subtitle={
        isStudent
          ? "Pantau jadwal dan informasi pelaksanaan wawancara seleksi kerja Anda"
          : "Kelola agenda wawancara kandidat, penyesuaian jadwal, dan evaluasi hasil seleksi"
      }
      activeLabel={isStudent ? "Interview" : "Wawancara"}
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <InterviewsPage userRole={user.role} userId={user.id} />
    </AppShell>
  );
}
