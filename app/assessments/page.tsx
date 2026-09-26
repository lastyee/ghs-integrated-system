import { AssessmentsPage } from "@/components/assessments/assessments-page";
import { AppShell } from "@/components/layout/app-shell";

export default function AssessmentsRoute() {
  return <AppShell title="Assessment" subtitle="Kelola penilaian dan nilai peserta" activeLabel="Penilaian"><AssessmentsPage /></AppShell>;
}
