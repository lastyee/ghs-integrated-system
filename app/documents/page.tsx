import { DocumentsPage } from "@/components/documents/documents-page";
import { AppShell } from "@/components/layout/app-shell";

export default function DocumentsRoute() {
  return <AppShell title="Dokumen" subtitle="Kelola dokumen peserta dan proses verifikasi" activeLabel="Dokumen"><DocumentsPage /></AppShell>;
}
