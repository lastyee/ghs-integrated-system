import { requireAuthenticatedUser } from "@/lib/authorization";
import { VacanciesPage } from "@/components/vacancies/vacancies-page";
import { AppShell } from "@/components/layout/app-shell";

export default async function VacanciesRoute() {
  const user = await requireAuthenticatedUser();

  return (
    <AppShell
      title="Lowongan Kerja"
      subtitle="Kelola peluang karier, kualifikasi posisi, dan rekrutmen mitra"
      activeLabel="Lowongan"
    >
      <VacanciesPage userRole={user.role} />
    </AppShell>
  );
}
