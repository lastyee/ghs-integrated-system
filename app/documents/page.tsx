import { requirePermission, requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";
import { DocumentsPage } from "@/components/documents/documents-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function DocumentsRoute() {
  const user = await requireAuthenticatedUser();
  await requirePermission("document:read");
  const canDelete = await userHasPermission(user.id, "document:delete");

  return <AppShell title="Dokumen" subtitle="Kelola dokumen peserta dan proses verifikasi" activeLabel="Dokumen"><DocumentsPage canDelete={canDelete} /></AppShell>;
}
