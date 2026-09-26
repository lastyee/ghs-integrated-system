import { AppShell } from "@/components/layout/app-shell";
import { UserManagementPage } from "@/components/users/user-management-page";

export default function UsersRoute() {
  return (
    <AppShell
      title="Manajemen Pengguna"
      subtitle="Kelola dan pantau akun pengguna sistem serta status aktivasi mahasiswa"
      activeLabel="Pengguna"
    >
      <UserManagementPage />
    </AppShell>
  );
}
