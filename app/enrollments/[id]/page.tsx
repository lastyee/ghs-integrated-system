import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShell } from "@/components/layout/app-shell";
import { EnrollmentDetail } from "@/components/enrollments/enrollment-detail";

export default async function EnrollmentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const isStudent = user.role === "STUDENT";

  return (
    <AppShell
      title="Detail Enrollment"
      subtitle="Informasi detail pendaftaran pelatihan GHS"
      activeLabel="Enrollment"
      sidebarVariant={isStudent ? "student" : "staff"}
    >
      <EnrollmentDetail enrollmentId={id} />
    </AppShell>
  );
}
