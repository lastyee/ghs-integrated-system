import { CertificateDetail } from "@/components/certificates/certificate-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function CertificateDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell
      title="Rincian Sertifikat"
      subtitle="Metadata dan status penerbitan sertifikat pelatihan"
      activeLabel="Sertifikat"
    >
      <CertificateDetail certificateId={id} />
    </AppShell>
  );
}
