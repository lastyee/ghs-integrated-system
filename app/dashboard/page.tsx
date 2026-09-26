import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authorization";

export default async function DashboardHubPage() {
  const user = await requireAuthenticatedUser();

  switch (user.role) {
    case "STUDENT":
      redirect("/dashboard/student");
    case "INSTRUCTOR":
      redirect("/dashboard/instructor");
    case "ACADEMIC_STAFF":
      redirect("/dashboard/academic");
    case "PLACEMENT_STAFF":
      redirect("/dashboard/placement");
    case "MANAGEMENT":
      redirect("/dashboard/management");
    case "SUPER_ADMIN":
    case "ADMIN":
    default:
      redirect("/");
  }
}
