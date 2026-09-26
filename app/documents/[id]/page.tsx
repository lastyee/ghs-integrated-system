import { DocumentDetail } from "@/components/documents/document-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function DocumentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Document Detail" subtitle="Metadata dan verifikasi dokumen mock" activeLabel="Dokumen"><DocumentDetail documentId={id} /></AppShell>;
}
