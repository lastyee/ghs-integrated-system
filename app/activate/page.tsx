import Image from "next/image";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Users } from "lucide-react";
import { auth } from "@/lib/auth";

export default async function ActivateStudentPage() {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F3F3] p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-lg rounded-xl border border-[#EEEEEE] bg-white p-6 shadow-lg sm:p-8">
        {/* Header & Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 h-16 w-28 sm:h-20 sm:w-36">
            <Image
              src="/images/ghs-logo.png"
              alt="Global Hospitality Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-lg font-bold text-[#1B1B1B] sm:text-xl">
            Aktivasi Akun Mahasiswa
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Sistem Informasi Terpadu Global Hospitality Sukabumi
          </p>
        </div>

        {/* Security Notice Card */}
        <div className="mt-5 rounded-md border border-[#EEEEEE] bg-slate-50 p-4 text-xs text-slate-700">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <ShieldAlert className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-[#1B1B1B]">
                Aktivasi Mandiri Dinonaktifkan
              </p>
              <p className="leading-relaxed text-slate-600">
                Sesuai kebijakan keamanan otentikasi sistem, aktivasi akun mahasiswa tidak lagi dilakukan secara mandiri oleh publik/mahasiswa. Alur aktivasi akun kini dikelola secara terpusat oleh <strong>Administrator</strong> melalui menu <strong>Manajemen Pengguna</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {isAdmin ? (
            <Link
              href="/users"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#BF120E] px-4 text-xs font-semibold text-white transition hover:bg-[#a00f0c]"
            >
              <Users className="size-4" />
              Buka Manajemen Pengguna
            </Link>
          ) : (
            <div className="rounded-md border border-[#EEEEEE] bg-white p-3 text-center text-xs text-slate-500">
              Mahasiswa yang belum memiliki akun silakan menghubungi Administrator Akademik GHS.
            </div>
          )}

          <Link
            href="/login"
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[#EEEEEE] bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-[#BF120E]"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Halaman Masuk
          </Link>
        </div>
      </div>
    </main>
  );
}
