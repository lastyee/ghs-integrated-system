import { CertificatesPage } from "@/components/certificates/certificates-page";
import { AppShell } from "@/components/layout/app-shell";

export default function CertificatesRoute() {
  return (
    <AppShell
      title="Sertifikat"
      subtitle="Kelola sertifikat pelatihan dan verifikasi status kelulusan peserta"
      activeLabel="Sertifikat"
    >
      <CertificatesPage />
    </AppShell>
  );
}
