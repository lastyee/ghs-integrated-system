"use client";

import { FormEvent, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogIn, AlertCircle, ShieldCheck } from "lucide-react";

function getSafeCallbackUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed === "/" ||
    trimmed === "/login" ||
    trimmed.startsWith("/login?")
  ) {
    return null;
  }

  if (trimmed.startsWith("//") || trimmed.startsWith("/\\") || trimmed.includes("\\")) {
    return null;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.origin === window.location.origin) {
        const path = parsed.pathname + parsed.search + parsed.hash;
        if (path !== "/" && path !== "/login" && !path.startsWith("/login?")) {
          return path;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

function getDashboardRouteForRole(role?: string | null): string {
  switch (role) {
    case "STUDENT":
      return "/dashboard/student";
    case "INSTRUCTOR":
      return "/dashboard/instructor";
    case "ACADEMIC_STAFF":
      return "/dashboard/academic";
    case "PLACEMENT_STAFF":
      return "/dashboard/placement";
    case "MANAGEMENT":
      return "/dashboard/management";
    case "SUPER_ADMIN":
    case "ADMIN":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

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
      const rawCallbackUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("callbackUrl")
          : null;
      const safeCallback = getSafeCallbackUrl(rawCallbackUrl);

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: safeCallback ?? undefined,
      });

      if (!result || result.error) {
        setError("Email atau password yang Anda masukkan tidak sesuai.");
        return;
      }

      let destination = safeCallback;
      if (!destination) {
        const session = await getSession();
        destination = getDashboardRouteForRole(session?.user?.role);
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan saat proses verifikasi masuk.");
    } finally {
      setIsSubmitting(false);
    }
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
              Global Hospitality Sukabumi
            </h2>
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
        </div>
      </div>
    </main>
  );
}
