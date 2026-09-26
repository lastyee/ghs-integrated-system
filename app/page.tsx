import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemOverview } from "@/components/dashboard/system-overview";
import { AppShell } from "@/components/layout/app-shell";
import { statCards } from "@/lib/mock-data";

export default async function Home() {
  const user = await requireAuthenticatedUser();

  if (user.role === "STUDENT") {
    redirect("/dashboard/student");
  }
  if (user.role === "INSTRUCTOR") {
    redirect("/dashboard/instructor");
  }
  if (user.role === "ACADEMIC_STAFF") {
    redirect("/dashboard/academic");
  }
  if (user.role === "PLACEMENT_STAFF") {
    redirect("/dashboard/placement");
  }
  if (user.role === "MANAGEMENT") {
    redirect("/dashboard/management");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-375 p-4 sm:p-8">
        <div className="mb-7">
          <p className="text-sm text-slate-500">Ringkasan aktivitas dan kondisi sistem GHS</p>
        </div>
        <section aria-label="Statistik ringkasan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </section>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <RecentActivity />
          <SystemOverview />
        </div>
      </div>
    </AppShell>
  );
}
