"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LogIn, UserCheck, AlertCircle, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const callbackUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("callbackUrl") || "/"
          : "/";

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error) {
        setError("Email atau password yang Anda masukkan tidak sesuai.");
        return;
      }

      router.replace(result.url ?? callbackUrl);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan saat proses verifikasi masuk.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillDemo(demoEmail: string, demoPass: string) {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError("");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F3F3] p-4 sm:p-6 lg:p-8">
      <div className="flex w-full max-w-5xl overflow-hidden rounded-xl border border-[#EEEEEE] bg-white shadow-lg">
        {/* Left Side: Hospitality Training Visual Showcase (Option B: Generic Hospitality Visual) */}
        <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#1B1B1B] p-8 text-white lg:flex">
          <div className="absolute inset-0 z-0">
            <Image
              src="/images/ghs-campus-login.jpeg"
              alt="Ilustrasi Fasilitas Pelatihan Perhotelan & Kapal Pesiar"
              fill
              className="object-cover opacity-80"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1B1B1B]/90 via-[#1B1B1B]/40 to-[#1B1B1B]/15" />
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-md border border-[#FFD618]/30 bg-[#FFD618]/10 px-3 py-1 text-xs font-medium text-[#FFD618]">
              <ShieldCheck className="size-4" />
              Sistem Terpadu Pelatihan & Karir
            </div>
          </div>

          <div className="relative z-10 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#FFD618] drop-shadow-xs">
              Selamat Datang
            </p>
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl text-white drop-shadow-sm">
              Global Hospitality School
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed drop-shadow-xs">
              Mewujudkan tenaga profesional berstandar internasional di industri perhotelan dan kapal pesiar melalui kurikulum terstruktur dan penempatan kerja nyata.
            </p>
            <div className="pt-2 flex items-center gap-4 text-xs text-slate-300 drop-shadow-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#FFD618]"></span>
                60% Praktek / 40% Teori
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#BF120E]"></span>
                Sertifikasi Resmi
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form with GHS Brand Identity */}
        <div className="flex w-full flex-col justify-center p-6 sm:p-10 lg:w-1/2">
          {/* GHS Official Full Logo */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="relative mb-3 h-20 w-32 sm:h-22 sm:w-36">
              <Image
                src="/images/ghs-logo.png"
                alt="Global Hospitality Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-lg font-bold text-[#1B1B1B] sm:text-xl">
              Masuk dan Verifikasi
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Gunakan akun terdaftar Anda untuk mengakses portal akademik dan karir GHS.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-[#BF120E]/30 bg-red-50 p-3 text-xs text-[#BF120E]"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-700"
              >
                Email Akun Pengguna
              </label>
              <input
                id="email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="nama@ghs.local"
                className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#BF120E] px-4 text-xs font-semibold text-white transition hover:bg-[#a00f0c] focus:outline-none focus:ring-2 focus:ring-[#BF120E]/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="size-3.5" />
              {isSubmitting ? "Memverifikasi..." : "Masuk"}
            </button>
          </form>

          {/* Student Account Activation Action */}
          <div className="mt-5 border-t border-[#EEEEEE] pt-4 text-center">
            <p className="text-xs text-slate-600">
              Belum mengaktifkan akun mahasiswa?
            </p>
            <Link
              href="/activate"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#BF120E] bg-white px-3.5 py-1.5 text-xs font-medium text-[#BF120E] transition hover:bg-red-50"
            >
              <UserCheck className="size-3.5" />
              Aktifkan Akun Mahasiswa
            </Link>
          </div>

          {/* Quick Demo Shortcuts (Development & Testing only; excluded from production bundles) */}
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-5 rounded-lg border border-[#EEEEEE] bg-[#F8F8F8] p-3 text-left">
              <p className="mb-2 text-[11px] font-semibold text-slate-500">
                Akses Cepat Pengujian (Mode Pengembangan)
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => fillDemo("admin.demo@ghs.local", "superadmin123")}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                >
                  <span>👤 <strong>Super Admin</strong> (admin.demo@ghs.local)</span>
                  <span className="font-semibold text-[#BF120E]">Pilih</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo("student.demo@ghs.local", "murid123")}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                >
                  <span>🎓 <strong>Student Demo</strong> (student.demo@ghs.local)</span>
                  <span className="font-semibold text-[#BF120E]">Pilih</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
