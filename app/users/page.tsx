import { AppShell } from "@/components/layout/app-shell";
import { UserManagementPage } from "@/components/users/user-management-page";
import { requireAuthenticatedUser, userHasPermission } from "@/lib/authorization";

export default async function UsersRoute() {
  const user = await requireAuthenticatedUser();
  const canDelete = await userHasPermission(user.id, "user:delete");

  return (
    <AppShell
      title="Manajemen Pengguna"
      subtitle="Kelola dan pantau akun pengguna sistem serta status aktivasi mahasiswa"
      activeLabel="Pengguna"
    >
      <UserManagementPage canDelete={canDelete} />
    </AppShell>
  );
}
