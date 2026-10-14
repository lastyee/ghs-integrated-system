"use client";

import { User, Mail, Shield, Calendar, CheckCircle2 } from "lucide-react";

type StaffProfileProps = {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    createdAt?: string | Date;
    roleDescription?: string | null;
  };
};

function formatRoleName(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Administrator";
    case "ADMIN":
      return "Administrator";
    case "ACADEMIC_STAFF":
      return "Staf Akademik";
    case "INSTRUCTOR":
      return "Instruktur Pelatihan";
    case "PLACEMENT_STAFF":
      return "Staf Penempatan Kerja";
    case "MANAGEMENT":
      return "Manajemen / Pimpinan";
    default:
      return role;
  }
}

function getRoleDescription(role: string, customDesc?: string | null): string {
  if (customDesc && customDesc.trim()) {
    return customDesc;
  }
  switch (role) {
    case "SUPER_ADMIN":
      return "Hak akses penuh ke seluruh modul, konfigurasi, data operasional, dan manajemen pengguna sistem.";
    case "ADMIN":
      return "Pengelolaan operasional harian, modul akademik, penempatan kerja, dan akun pengguna.";
    case "ACADEMIC_STAFF":
      return "Pengelolaan kurikulum, program, batch, kelas pelatihan, jadwal, dan absensi akademik.";
    case "INSTRUCTOR":
      return "Pengajaran kelas, pengisian materi jadwal, absensi kelas, dan penilaian peserta pelatihan.";
    case "PLACEMENT_STAFF":
      return "Pengelolaan mitra industri, lowongan kerja, proses lamaran, wawancara, dan penempatan kerja.";
    case "MANAGEMENT":
      return "Akses pelaporan ringkasan eksekutif, statistik kinerja pelatihan, dan metrik penempatan.";
    default:
      return "Hak akses operasional sistem GHS Integrated System.";
  }
}

export function StaffProfilePage({ user }: StaffProfileProps) {
  const initials = (user.name || user.email || "GHS")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const formattedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Hero Header Card */}
      <div className="rounded-lg border border-[#EEEEEE] bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[#FFD618] text-xl font-bold text-[#1B1B1B] shadow-2xs">
              {initials}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[#1B1B1B]">
                  {user.name || "Pengguna Sistem"}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                  <Shield className="size-3 text-[#BF120E]" />
                  {user.role}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="size-3 text-emerald-600" />
                  Aktif
                </span>
              </div>

              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Mail className="size-3.5 text-slate-400" />
                {user.email}
              </p>

              <p className="text-xs font-medium text-slate-600">
                {formatRoleName(user.role)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Account Details & Role Information Card */}
      <div className="rounded-lg border border-[#EEEEEE] bg-white p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3">
          <div className="flex items-center gap-2">
            <User className="size-4 text-[#BF120E]" />
            <h3 className="text-sm font-semibold text-[#1B1B1B]">
              Informasi Akun & Hak Akses
            </h3>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Terverifikasi Sistem
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          <div>
            <p className="font-medium text-slate-500">Nama Lengkap</p>
            <p className="mt-0.5 font-semibold text-[#1B1B1B]">
              {user.name || "Belum diisi"}
            </p>
          </div>

          <div>
            <p className="font-medium text-slate-500">Email Akun Login</p>
            <p className="mt-0.5 font-semibold text-[#1B1B1B]">{user.email}</p>
          </div>

          <div>
            <p className="font-medium text-slate-500">Peran Sistem (Role)</p>
            <p className="mt-0.5 font-semibold text-[#1B1B1B]">
              {formatRoleName(user.role)} ({user.role})
            </p>
          </div>

          {formattedDate && (
            <div>
              <p className="font-medium text-slate-500">Akun Dibuat Sejak</p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B] flex items-center gap-1.5">
                <Calendar className="size-3.5 text-slate-400" />
                {formattedDate}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-[#EEEEEE] pt-4 text-xs">
          <p className="font-medium text-slate-500">Deskripsi Wewenang Peran</p>
          <p className="mt-1 leading-relaxed text-slate-700">
            {getRoleDescription(user.role, user.roleDescription)}
          </p>
        </div>

        <div className="rounded-md border border-[#EEEEEE] bg-[#F8F8F8] p-3 text-[11px] text-slate-500">
          Perubahan informasi akun institusi, alamat email, atau wewenang peran dikelola secara terpusat oleh Administrator melalui menu Manajemen Pengguna.
        </div>
      </div>
    </div>
  );
}
