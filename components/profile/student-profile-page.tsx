"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  User,
  GraduationCap,
  Calendar,
  Phone,
  MapPin,
  Mail,
  ShieldAlert,
  Edit2,
  CheckCircle2,
  Lock,
  X,
  Save,
  AlertCircle,
} from "lucide-react";

type StudentProfileData = {
  id: string;
  name: string;
  nim: string;
  nik: string | null;
  phone: string | null;
  address: string | null;
  email: string;
  role: string;
  enrollment: {
    id: string;
    batchId: string;
    batchName: string;
    programId: string;
    programCode: string;
    programName: string;
    status: string;
  } | null;
};

export function StudentProfilePage() {
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState("");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/profile")
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Gagal memuat profil mahasiswa.");
        }
        return res.json();
      })
      .then((data: StudentProfileData) => {
        if (isMounted) {
          setProfile(data);
          setEditPhone(data.phone || "");
          setEditAddress(data.address || "");
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat profil.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveErrorMessage("");
    setSaveSuccessMessage("");

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: editPhone.trim() || null,
          address: editAddress.trim() || null,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setSaveErrorMessage(result.error || "Gagal memperbarui data profil.");
        return;
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone: result.data.phone,
              address: result.data.address,
            }
          : null
      );

      setSaveSuccessMessage("Informasi kontak berhasil diperbarui.");
      setIsEditing(false);
      setTimeout(() => setSaveSuccessMessage(""), 5000);
    } catch {
      setSaveErrorMessage("Gagal menyimpan perubahan profil.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-40 w-full animate-pulse rounded-lg bg-white p-6 shadow-xs border border-[#EEEEEE]" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-64 animate-pulse rounded-lg bg-white p-6 shadow-xs border border-[#EEEEEE]" />
          <div className="h-64 animate-pulse rounded-lg bg-white p-6 shadow-xs border border-[#EEEEEE]" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-white p-8 text-center shadow-xs">
        <ShieldAlert className="mx-auto size-12 text-[#BF120E]" />
        <h2 className="mt-4 text-base font-bold text-[#1B1B1B]">
          Profil Mahasiswa Tidak Tersedia
        </h2>
        <p className="mt-2 text-xs text-slate-600">
          {error || "Akun Anda belum terhubung dengan data registrasi mahasiswa resmi."}
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            setRefreshTrigger((t) => t + 1);
          }}
          className="mt-5 rounded-md bg-[#BF120E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a00f0c]"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {saveSuccessMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 shadow-2xs">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Hero Header Profile Card */}
      <div className="rounded-lg border border-[#EEEEEE] bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[#FFD618] text-xl font-bold text-[#1B1B1B] shadow-2xs">
              {initials}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[#1B1B1B]">
                  {profile.name}
                </h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  NIM: {profile.nim}
                </span>
                <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-[#BF120E]">
                  Mahasiswa
                </span>
              </div>

              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Mail className="size-3.5 text-slate-400" />
                {profile.email}
              </p>

              {profile.enrollment && (
                <div className="pt-0.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                    <GraduationCap className="size-3.5 text-[#BF120E]" />
                    {profile.enrollment.programName} ({profile.enrollment.programCode})
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                    <Calendar className="size-3 text-amber-600" />
                    Batch {profile.enrollment.batchName}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                    {profile.enrollment.status}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <button
              onClick={() => {
                setEditPhone(profile.phone || "");
                setEditAddress(profile.address || "");
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#EEEEEE] bg-white px-3 py-1.5 text-xs font-medium text-[#1B1B1B] hover:bg-slate-50 transition"
            >
              <Edit2 className="size-3.5 text-[#BF120E]" />
              Ubah Kontak
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Academic vs Personal */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Card 1: Official Academic Information (Read-Only) */}
        <div data-testid="student-profile-academic" className="rounded-lg border border-[#EEEEEE] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-4 text-[#BF120E]" />
              <h3 className="text-sm font-semibold text-[#1B1B1B]">Data Akademik Terdaftar</h3>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
              <Lock className="size-3" />
              Resmi
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <p className="font-medium text-slate-500">
                Nomor Induk Mahasiswa (NIM)
              </p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B]">{profile.nim}</p>
            </div>

            <div>
              <p className="font-medium text-slate-500">
                Program Pelatihan
              </p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B]">
                {profile.enrollment?.programName || "Belum ditentukan"}
              </p>
            </div>

            <div>
              <p className="font-medium text-slate-500">
                Batch Pelatihan
              </p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B]">
                {profile.enrollment?.batchName || "Belum ditentukan"}
              </p>
            </div>

            <div>
              <p className="font-medium text-slate-500">
                Status Keaktifan
              </p>
              <div className="mt-1">
                <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                  {profile.enrollment?.status || "REGISTERED"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[#EEEEEE] bg-[#F8F8F8] p-3 text-[11px] text-slate-500">
            Perubahan data akademik (NIM, Program, Batch) hanya dapat diproses melalui Administrasi Akademik GHS.
          </div>
        </div>

        {/* Card 2: Personal & Contact Information */}
        <div data-testid="student-profile-contact" className="rounded-lg border border-[#EEEEEE] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3">
            <div className="flex items-center gap-2">
              <User className="size-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-[#1B1B1B]">Data Pribadi & Kontak</h3>
            </div>
            <button
              onClick={() => {
                setEditPhone(profile.phone || "");
                setEditAddress(profile.address || "");
                setIsEditing(true);
              }}
              className="text-xs font-semibold text-[#BF120E] hover:underline inline-flex items-center gap-1"
            >
              <Edit2 className="size-3" />
              Edit
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <p className="font-medium text-slate-500">
                Email Akun Login
              </p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B]">{profile.email}</p>
            </div>

            <div>
              <p className="font-medium text-slate-500">
                NIK (Kependudukan)
              </p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B]">
                {profile.nik || <span className="text-slate-400 italic">Belum terisi</span>}
              </p>
            </div>

            <div>
              <p className="font-medium text-slate-500">
                No. Telepon / WhatsApp
              </p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B] flex items-center gap-1.5">
                <Phone className="size-3.5 text-slate-400" />
                {profile.phone || <span className="text-slate-400 italic">Belum dicatat</span>}
              </p>
            </div>

            <div>
              <p className="font-medium text-slate-500">
                Alamat Domisili
              </p>
              <p className="mt-0.5 font-semibold text-[#1B1B1B] flex items-start gap-1.5">
                <MapPin className="size-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{profile.address || <span className="text-slate-400 italic">Belum dicatat</span>}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal Dialog */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg border border-[#EEEEEE] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3">
              <h3 className="text-sm font-bold text-[#1B1B1B]">Perbarui Informasi Kontak</h3>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            </div>

            {saveErrorMessage && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-[#BF120E]/30 bg-red-50 p-2.5 text-xs text-[#BF120E]">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{saveErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  No. Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="mt-1 h-10 w-full rounded-md border border-[#EEEEEE] px-3 text-sm text-[#1B1B1B] outline-none focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Alamat Lengkap
                </label>
                <textarea
                  rows={3}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Alamat domisili saat ini"
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] p-3 text-sm text-[#1B1B1B] outline-none focus:border-[#BF120E] focus:ring-1 focus:ring-[#BF120E]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#EEEEEE]">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-md border border-[#EEEEEE] px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#BF120E] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a00f0c] disabled:opacity-60"
                >
                  <Save className="size-3.5" />
                  {isSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
