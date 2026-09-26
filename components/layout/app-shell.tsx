import { PrismaClient } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { AppShellClient } from "@/components/layout/app-shell-client";

const prisma = new PrismaClient();

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  activeLabel?: string;
  subtitle?: string;
  sidebarVariant?: "staff" | "student";
};

function getInitials(name: string | null | undefined, email?: string | null) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  if (email && email.trim()) {
    const prefix = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).filter(Boolean);
    if (prefix.length >= 2) {
      return (prefix[0][0] + prefix[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  }

  return "GH";
}

function formatRole(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function AppShell({
  children,
  title = "Dashboard",
  activeLabel = "Dashboard",
  subtitle,
  sidebarVariant,
}: AppShellProps) {
  const user = await requireAuthenticatedUser();
  const effectiveSidebarVariant =
    sidebarVariant ?? (user.role === "STUDENT" ? "student" : "staff");

  let displayName = user.name || user.email || "User";

  // For Student role, resolve authentic linked Student name
  if (user.role === "STUDENT") {
    try {
      const linkedStudent = await prisma.student.findUnique({
        where: { userId: user.id },
        select: { name: true },
      });
      if (linkedStudent?.name) {
        displayName = linkedStudent.name;
      }
    } catch {
      // Graceful fallback to user.name if DB query fails
    }
  }

  return (
    <AppShellClient
      title={title}
      role={formatRole(user.role)}
      initials={getInitials(user.name, user.email)}
      userName={displayName}
      email={user.email}
      activeLabel={activeLabel}
      subtitle={subtitle}
      sidebarVariant={effectiveSidebarVariant}
    >
      {children}
    </AppShellClient>
  );
}
