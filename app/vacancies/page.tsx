import { VacanciesPage } from "@/components/vacancies/vacancies-page";
import { AppShell } from "@/components/layout/app-shell";

export default function VacanciesRoute() {
  return (
    <AppShell
      title="Lowongan Kerja"
      subtitle="Kelola peluang karier, kualifikasi posisi, dan rekrutmen mitra"
      activeLabel="Lowongan"
    >
      <VacanciesPage />
    </AppShell>
  );
}
