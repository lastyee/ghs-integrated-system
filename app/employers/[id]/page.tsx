import { requireAuthenticatedUser } from "@/lib/authorization";
import { EmployerDetail } from "@/components/employers/employer-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function EmployerDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  return (
    <AppShell
      title="Detail Perusahaan"
      subtitle="Informasi lengkap mitra industri dan lowongan terkait"
      activeLabel="Perusahaan"
    >
      <EmployerDetail employerId={id} userRole={user.role} />
    </AppShell>
  );
}
