import { CertificateDetail } from "@/components/certificates/certificate-detail";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";

export default async function CertificateDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const canDelete = await userHasPermission(user.id, "certificate:delete");
  return (
    <AppShell
      title="Rincian Sertifikat"
      subtitle="Metadata dan status penerbitan sertifikat pelatihan"
      activeLabel="Sertifikat"
    >
      <CertificateDetail certificateId={id} canDelete={canDelete} />
    </AppShell>
  );
}
