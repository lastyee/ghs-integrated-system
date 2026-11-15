"use client";

import Link from "next/link";
import Image from "next/image";
import { Award, BarChart3, ClipboardList, History, Users, X } from "lucide-react";
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
  Tugas: "/assignments",
  "Tugas Saya": "/assignments",
  "Audit Log": "/audit",
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
  const isManagement = normalizedRole.includes("management");
  const canViewAudit = isAdminOrSuperAdmin || isManagement;
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
    const trainingGroup = rawGroups.find((g) => g.label === "Training");
    if (trainingGroup && !trainingGroup.items.some((i) => i.label === "Tugas")) {
      trainingGroup.items.push({ label: "Tugas", icon: ClipboardList });
    }
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

    const academicGroup = rawGroups.find((group) => group.label === "Akademik");
    if (academicGroup && !academicGroup.items.some((item) => item.label === "Tugas")) {
      academicGroup.items.push({ label: "Tugas", icon: ClipboardList });
    }

    if (isAdminOrSuperAdmin || isAcademic) {
      if (academicGroup && !academicGroup.items.some((item) => item.label === "Instruktur")) {
        academicGroup.items.push({ label: "Instruktur", icon: Users });
      }
    }

    // Add User Management for Admin and Super Admin
    if (isAdminOrSuperAdmin) {
      let sysGroup = rawGroups.find((g) => g.label === "Sistem & Pengguna");
      if (!sysGroup) {
        sysGroup = {
          label: "Sistem & Pengguna",
          items: [],
        };
        rawGroups.push(sysGroup);
      }
      if (!sysGroup.items.some((item) => item.label === "Pengguna")) {
        sysGroup.items.push({ label: "Pengguna", icon: Users });
      }
    }

    // Add Audit Log for Super Admin, Admin, and Management
    if (canViewAudit) {
      let sysGroup = rawGroups.find((g) => g.label === "Sistem & Pengguna");
      if (!sysGroup) {
        sysGroup = {
          label: "Sistem & Pengguna",
          items: [],
        };
        rawGroups.push(sysGroup);
      }
      if (!sysGroup.items.some((item) => item.label === "Audit Log")) {
        sysGroup.items.push({ label: "Audit Log", icon: History });
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

        // Student cannot see aggregate reports, user management, or audit logs
        if (isStudent && (item.label === "Laporan" || item.label === "Pengguna" || item.label === "Audit Log")) {
          return false;
        }

        // Restrict Audit Log to roles with audit:read permission
        if (!canViewAudit && item.label === "Audit Log") {
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
            "Audit Log",
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
            "Audit Log",
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
            "Tugas",
            "Sertifikat",
            "Sertifikat Saya",
            "Pengguna",
            "Audit Log",
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(17.5rem,calc(100vw-2rem))] shrink-0 flex-col border-r border-[#333333] bg-[#1B1B1B] text-white shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Compact Logo Brand Header (h-16 exactly aligned with AppHeader) */}
        <div className="flex h-16 items-center justify-between border-b border-[#2D2D2D] px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="relative size-8 shrink-0">
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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#2D2D2D] hover:text-white lg:hidden"
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

                  const itemClass = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-[#BF120E] font-semibold text-white shadow-xs"
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
        <div className="flex items-center justify-between border-t border-[#333333] bg-[#141414] px-5 py-3 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">GHS Portal</span>
          <span className="rounded bg-[#2A2A2A] px-1.5 py-0.5 font-mono text-[10px] text-[#FFD618]">
            v1.0
          </span>
        </div>
      </aside>
    </>
  );
}
