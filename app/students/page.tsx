import { requireAuthenticatedUser } from "@/lib/authorization";
import { StudentsPage } from "@/components/students/students-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function StudentsRoute() {
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title={isStudent ? "Data Peserta Saya" : "Peserta"}
      subtitle={isStudent ? "Informasi profil dan data kepesertaan Anda" : "Kelola dan lihat informasi peserta GHS"}
      activeLabel="Peserta"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <StudentsPage userRole={user.role} userId={user.id} />
    </AppShell>
  );
}
