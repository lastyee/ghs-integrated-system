"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, UserCheck } from "lucide-react";

export default function ActivateStudentPage() {
  const [nim, setNim] = useState("");
  const [name, setName] = useState("");
  const [nik, setNik] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successData, setSuccessData] = useState<{ name: string; email: string } | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");

    if (password.length < 6) {
      setErrorMessage("Password minimal 6 karakter.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Konfirmasi password tidak cocok dengan password yang dimasukkan.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nim: nim.trim(),
          name: name.trim(),
          nik: nik.trim() || undefined,
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || "Gagal mengaktifkan akun mahasiswa.");
        return;
      }

      setSuccessData({
        name: data.user?.name || name,
        email: data.user?.email || email,
      });
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan atau server saat aktivasi akun.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
            Khusus mahasiswa yang sudah terdaftar resmi di sistem Global Hospitality School.
          </p>
        </div>

        {/* Notice Card */}
        <div className="mt-4 rounded-md border border-[#FFD618]/50 bg-[#FFD618]/10 p-3 text-xs text-[#333333]">
          <p className="font-semibold text-[#1B1B1B]">Perhatian Pendaftaran Akun:</p>
          <p className="mt-0.5 text-slate-600">
            Sistem tidak menerima pendaftaran mandiri mahasiswa baru. Akun hanya dapat diaktifkan jika data NIM dan Nama Anda sudah terdaftar di administrasi Akademik GHS.
          </p>
        </div>

        {successData ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="text-base font-bold text-emerald-900">
              Aktivasi Akun Berhasil!
            </h2>
            <p className="mt-1 text-xs text-emerald-700">
              Akun untuk mahasiswa <strong>{successData.name}</strong> dengan email <strong>{successData.email}</strong> telah berhasil dibuat dan terhubung.
            </p>
            <div className="mt-5">
              <Link
                href="/login"
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#BF120E] px-4 text-xs font-semibold text-white transition hover:bg-[#a00f0c]"
              >
                Lanjut Masuk ke Sistem
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-[#BF120E]/30 bg-red-50 p-3 text-xs text-[#BF120E]"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="nim"
                className="block text-xs font-semibold text-slate-700"
              >
                Nomor Induk Mahasiswa (NIM) <span className="text-[#BF120E]">*</span>
              </label>
              <input
                id="nim"
                type="text"
                value={nim}
                onChange={(e) => setNim(e.target.value)}
                required
                placeholder="Contoh: 260405064"
                className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
              />
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-xs font-semibold text-slate-700"
              >
                Nama Lengkap Terdaftar <span className="text-[#BF120E]">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nama sesuai data registrasi akademik"
                className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
              />
            </div>

            <div>
              <label
                htmlFor="nik"
                className="block text-xs font-semibold text-slate-700"
              >
                NIK (Nomor Induk Kependudukan) <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              <input
                id="nik"
                type="text"
                value={nik}
                onChange={(e) => setNik(e.target.value)}
                placeholder="16 digit NIK jika tercatat"
                className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-700"
              >
                Email untuk Akun Login <span className="text-[#BF120E]">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="email.aktif@domain.com"
                className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-slate-700"
                >
                  Password <span className="text-[#BF120E]">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Min. 6 karakter"
                  className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-medium text-slate-700"
                >
                  Ulangi Password <span className="text-[#BF120E]">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Ketik ulang password"
                  className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] bg-white px-3 text-sm text-[#1B1B1B] outline-none transition focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#BF120E] px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-[#a00f0c] focus:outline-none focus:ring-2 focus:ring-[#BF120E]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserCheck className="size-4" />
              {isSubmitting ? "Memverifikasi & Mengaktifkan..." : "Aktifkan Akun Saya"}
            </button>
          </form>
        )}

        {/* Back Link */}
        <div className="mt-6 border-t border-[#EEEEEE] pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-[#BF120E]"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Halaman Masuk
          </Link>
        </div>
      </div>
    </main>
  );
}
