import { AppShell } from "@/components/layout/app-shell";
import { UserManagementPage } from "@/components/users/user-management-page";
import { requireAuthenticatedUser, userHasPermission, UnauthorizedError } from "@/lib/authorization";
import { redirect } from "next/navigation";

export default async function UsersRoute() {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw error;
  }

  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  const canDelete = await userHasPermission(user.id, "user:delete");

  return (
    <AppShell
      title="Manajemen Pengguna"
      subtitle="Kelola dan pantau akun pengguna sistem serta status aktivasi mahasiswa"
      activeLabel="Pengguna"
    >
      <UserManagementPage canDelete={canDelete} currentUserRole={user.role} />
    </AppShell>
  );
}
