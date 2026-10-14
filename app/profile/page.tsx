import { AppShell } from "@/components/layout/app-shell";
import { StudentProfilePage } from "@/components/profile/student-profile-page";
import { StaffProfilePage } from "@/components/profile/staff-profile-page";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/authorization";
import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function ProfileRoute() {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw error;
  }

  const isStudent = user.role === "STUDENT";

  if (isStudent) {
    return (
      <AppShell
        title="Profil Saya"
        subtitle="Informasi identitas resmi akademik dan akun mahasiswa"
        activeLabel="Profil Saya"
      >
        <StudentProfilePage />
      </AppShell>
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      role: {
        select: {
          name: true,
          description: true,
        },
      },
    },
  });

  return (
    <AppShell
      title="Profil Saya"
      subtitle="Informasi identitas resmi dan hak akses akun sistem"
      activeLabel="Profil Saya"
    >
      <StaffProfilePage
        user={{
          id: user.id,
          name: account?.name ?? user.name ?? null,
          email: account?.email ?? user.email ?? "",
          role: user.role,
          createdAt: account?.createdAt,
          roleDescription: account?.role?.description,
        }}
      />
    </AppShell>
  );
}
