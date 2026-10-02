import { CertificatesPage } from "@/components/certificates/certificates-page";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";

export default async function CertificatesRoute() {
  const user = await requireAuthenticatedUser();
  const canDelete = await userHasPermission(user.id, "certificate:delete");

  return (
    <AppShell
      title="Sertifikat"
      subtitle="Kelola sertifikat pelatihan dan verifikasi status kelulusan peserta"
      activeLabel="Sertifikat"
    >
      <CertificatesPage canDelete={canDelete} />
    </AppShell>
  );
}
