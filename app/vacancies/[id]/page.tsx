import { VacancyDetail } from "@/components/vacancies/vacancy-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function VacancyDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell
      title="Detail Lowongan"
      subtitle="Rincian informasi deskripsi tugas dan kualifikasi lowongan kerja"
      activeLabel="Lowongan"
    >
      <VacancyDetail vacancyId={id} />
    </AppShell>
  );
}
