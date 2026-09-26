import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { ClassDetail } from "@/components/classes/class-detail";

export default async function ClassDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Kelas"
      subtitle="Informasi detail kelas pelatihan GHS"
      activeLabel="Kelas"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <ClassDetail classId={id} />
    </AppShell>
  );
}
