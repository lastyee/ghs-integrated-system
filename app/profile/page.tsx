import { AppShell } from "@/components/layout/app-shell";
import { StudentProfilePage } from "@/components/profile/student-profile-page";

export default function ProfileRoute() {
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
