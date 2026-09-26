import { requireAuthenticatedUser } from "@/lib/authorization";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function ApplicationDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Lamaran"
      subtitle="Rincian informasi lamaran kerja, tahapan seleksi, dan status kandidat"
      activeLabel={isStudent ? "Lamaran Saya" : "Lamaran"}
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <ApplicationDetail
        applicationId={id}
        userRole={user.role}
        userId={user.id}
      />
    </AppShell>
  );
}
