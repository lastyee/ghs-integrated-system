"use client";

import Link from "next/link";
import Image from "next/image";
import { Award, BarChart3, Users, X } from "lucide-react";
import { navigationGroups, studentNavigationGroups } from "@/lib/mock-data";

type AppSidebarProps = {
  open: boolean;
  onClose: () => void;
  activeLabel?: string;
  variant?: "staff" | "student";
  role?: string;
};

const itemRoutes: Record<string, string> = {
  Dashboard: "/dashboard",
  Peserta: "/students",
  "Profil Saya": "/profile",
  Program: "/programs",
  "Mata Pelajaran": "/subjects",
  Batch: "/batches",
  Enrollment: "/enrollments",
  Kelas: "/classes",
  Instruktur: "/instructors",
  Jadwal: "/schedules",
  Kehadiran: "/attendance",
  Penilaian: "/assessments",
  Dokumen: "/documents",
  "Dokumen Saya": "/documents",
  Perusahaan: "/employers",
  Lowongan: "/vacancies",
  Lamaran: "/applications",
  "Lamaran Saya": "/applications",
  Wawancara: "/interviews",
  Interview: "/interviews",
  Penempatan: "/placements",
  Placement: "/placements",
  Sertifikat: "/certificates",
  "Sertifikat Saya": "/certificates",
  Laporan: "/reports",
  Pengguna: "/users",
};

export function AppSidebar({
  open,
  onClose,
  activeLabel = "Dashboard",
  variant = "staff",
  role,
}: AppSidebarProps) {
  const normalizedRole = role?.toLowerCase() || "";
  const isSuperAdmin = normalizedRole.includes("super_admin") || normalizedRole.includes("super admin");
  const isAdmin = normalizedRole.includes("admin");
  const isAdminOrSuperAdmin = isSuperAdmin || isAdmin;
  const isInstructor = normalizedRole.includes("instructor");
  const isAcademic = normalizedRole.includes("academic");
  const isPlacement = normalizedRole.includes("placement");
  const isStudent = variant === "student" || normalizedRole.includes("student");
  const isAcademicOrInstructor = isAcademic || isInstructor;

  const baseGroups = variant === "student" ? studentNavigationGroups : navigationGroups;
  const rawGroups = baseGroups.map((group) => ({
    ...group,
    items: [...group.items],
  }));

  // Dynamic injection so lib/mock-data.ts remains free of dead mock navigation items
  if (isStudent) {
    const docGroup = rawGroups.find((g) => g.label === "Dokumen");
    if (docGroup && !docGroup.items.some((i) => i.label === "Sertifikat")) {
      docGroup.items.push({ label: "Sertifikat", icon: Award });
    }
  } else {
    if (!rawGroups.some((g) => g.label === "Laporan")) {
      rawGroups.push({
        label: "Laporan",
        items: [{ label: "Laporan", icon: BarChart3 }],
      });
    }

    if (isAdminOrSuperAdmin || isAcademic) {
      const academicGroup = rawGroups.find((group) => group.label === "Akademik");
      if (academicGroup && !academicGroup.items.some((item) => item.label === "Instruktur")) {
        academicGroup.items.push({ label: "Instruktur", icon: Users });
      }
    }

    // Add User Management for Admin and Super Admin
    if (isAdminOrSuperAdmin) {
      if (!rawGroups.some((g) => g.label === "Sistem & Pengguna")) {
        rawGroups.push({
          label: "Sistem & Pengguna",
          items: [{ label: "Pengguna", icon: Users }],
        });
      }
    }
  }

  const groups = rawGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        // Must have a valid route mapped
        if (!itemRoutes[item.label]) {
          return false;
        }

        if (isAcademicOrInstructor && item.label === "Lamaran") {
          return false;
        }
        if (item.label === "Instruktur" && !isAdminOrSuperAdmin && !isAcademic) {
          return false;
        }

        // Student cannot see aggregate reports or user management
        if (isStudent && item.label === "Laporan") {
          return false;
        }
        if (isStudent && item.label === "Pengguna") {
          return false;
        }

        if (isInstructor) {
          const instructorHidden = [
            "Program",
            "Mata Pelajaran",
            "Batch",
            "Enrollment",
            "Dokumen",
            "Perusahaan",
            "Lowongan",
            "Lamaran",
            "Wawancara",
            "Interview",
            "Penempatan",
            "Placement",
            "Sertifikat",
            "Sertifikat Saya",
            "Laporan",
            "Pengguna",
          ];
          if (instructorHidden.includes(item.label)) return false;
        } else if (isAcademic) {
          const academicHidden = [
            "Perusahaan",
            "Lowongan",
            "Lamaran",
            "Wawancara",
            "Interview",
            "Penempatan",
            "Placement",
            "Sertifikat",
            "Sertifikat Saya",
            "Pengguna",
          ];
          if (academicHidden.includes(item.label)) return false;
        } else if (isPlacement) {
          const placementHidden = [
            "Program",
            "Mata Pelajaran",
            "Batch",
            "Enrollment",
            "Kelas",
            "Jadwal",
            "Kehadiran",
            "Penilaian",
            "Sertifikat",
            "Sertifikat Saya",
            "Pengguna",
          ];
          if (placementHidden.includes(item.label)) return false;
        }

        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <button
        type="button"
        aria-label="Tutup navigasi"
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-70 flex-col bg-[#1B1B1B] text-white shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shadow-none border-r border-[#333333] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Compact Logo Brand Header */}
        <div className="flex h-18 items-center justify-between border-b border-[#2D2D2D] px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="relative size-10 shrink-0">
              <Image
                src="/images/ghs-logo.png"
                alt="Global Hospitality Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div>
              <p className="text-xs font-bold tracking-wide text-white">
                GLOBAL HOSPITALITY
              </p>
              <p className="text-[10px] font-medium text-[#FFD618]">
                Training & Career System
              </p>
            </div>
          </Link>

          <button
            type="button"
            aria-label="Tutup menu"
            className="rounded-md p-1.5 text-slate-400 hover:bg-[#2D2D2D] hover:text-white lg:hidden"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Navigasi utama">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? `group-${groupIndex}`}>
              {group.label && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const href = itemRoutes[item.label];
                  const isActive = item.label === activeLabel;

                  const itemClass = `flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-[#BF120E] font-medium text-white shadow-xs"
                      : "text-slate-300 hover:bg-[#2A2A2A] hover:text-white"
                  }`;

                  if (!href) {
                    return null;
                  }

                  return (
                    <Link
                      key={item.label}
                      href={href}
                      className={itemClass}
                      onClick={onClose}
                    >
                      <Icon
                        className={`size-4 shrink-0 ${
                          isActive ? "text-white" : "text-slate-400"
                        }`}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer Brand Info */}
        <div className="border-t border-[#333333] bg-[#141414] px-5 py-3.5 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="font-semibold text-slate-300">GHS Portal</span>
          <span className="rounded bg-[#333333] px-1.5 py-0.5 text-[10px] font-mono text-[#FFD618]">
            v1.0
          </span>
        </div>
      </aside>
    </>
  );
}
