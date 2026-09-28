import { requireAuthenticatedUser } from "@/lib/authorization";
import { VacancyDetail } from "@/components/vacancies/vacancy-detail";
import { AppShell } from "@/components/layout/app-shell";

export default async function VacancyDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  return (
    <AppShell
      title="Detail Lowongan"
      subtitle="Rincian informasi deskripsi tugas dan kualifikasi lowongan kerja"
      activeLabel="Lowongan"
    >
      <VacancyDetail vacancyId={id} userRole={user.role} />
    </AppShell>
  );
}
