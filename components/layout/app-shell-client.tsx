"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

type AppShellClientProps = {
  children: React.ReactNode;
  title: string;
  role: string;
  initials: string;
  userName: string;
  email?: string | null;
  activeLabel: string;
  subtitle?: string;
  sidebarVariant: "staff" | "student";
};

export function AppShellClient({
  children,
  title,
  role,
  initials,
  userName,
  email,
  activeLabel,
  subtitle,
  sidebarVariant,
}: AppShellClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full min-w-0 bg-[#f5f7fa]">
      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeLabel={activeLabel}
        variant={sidebarVariant}
        role={role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          onMenuClick={() => setSidebarOpen(true)}
          title={title}
          role={role}
          initials={initials}
          userName={userName}
          email={email}
          subtitle={subtitle}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
