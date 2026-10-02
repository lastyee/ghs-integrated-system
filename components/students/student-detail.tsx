"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, CalendarDays, Loader2, MapPin, Phone, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type StudentEnrollmentItem = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED";
  notes: string | null;
  createdAt: string;
  batch?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string | null;
    program?: {
      id: string;
      code: string;
      name: string;
    };
  };
};

type StudentData = {
  id: string;
  nim: string;
  nik: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  status: "ACTIVE" | "GRADUATED" | "DROPPED";
  createdAt: string;
  updatedAt: string;
  enrollments?: StudentEnrollmentItem[];
};

export function StudentDetail({
  studentId,
}: {
  studentId: string;
  userRole?: string;
}) {
  const [student, setStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/students/${studentId}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || `Peserta tidak ditemukan (HTTP ${res.status})`);
        }
        const json = await res.json();
        if (isMounted) {
          setStudent(json.data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data peserta");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8">
        <Link href="/students" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]">
          <ArrowLeft className="size-4" />
          Kembali ke Peserta
        </Link>
        <div data-testid="loading-state" className="mt-12 flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-[#123b63]" />
          <span className="ml-3 text-sm text-slate-500">Memuat detail peserta...</span>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8">
        <Link href="/students" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]">
          <ArrowLeft className="size-4" />
          Kembali ke Peserta
        </Link>
        <div data-testid="error-state" className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-8 text-[#c94242]" />
          <h1 className="mt-2 text-xl font-bold text-[#102f50]">Data tidak ditemukan</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "Data peserta yang diminta tidak tersedia."}</p>
          <Link href="/students" className="mt-5 inline-flex rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#ad3535]">
            Kembali ke daftar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-6">
        <Link href="/students" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63] hover:text-[#c94242]">
          <ArrowLeft className="size-4" />
          Kembali ke Peserta
        </Link>
        <p className="mt-5 text-xs font-medium text-slate-500">Dashboard / Peserta / {student.nim}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[#102f50]">{student.name}</h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  student.status === "ACTIVE"
                    ? "bg-emerald-50 text-emerald-700"
                    : student.status === "GRADUATED"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {student.status === "ACTIVE" ? "Aktif" : student.status === "GRADUATED" ? "Lulus" : "Tidak Lanjut"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">NIM: {student.nim}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <span className="text-[#c94242]"><UserRound className="size-4" /></span>
            <h2 className="font-bold text-[#102f50]">Informasi Pokok</h2>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Nama Lengkap</p>
              <p className="mt-1 text-sm font-semibold text-[#102f50]">{student.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">NIM</p>
              <p className="mt-1 text-sm font-semibold text-[#123b63]">{student.nim}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">NIK</p>
              <p className="mt-1 text-sm font-semibold text-[#102f50]">{student.nik || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="size-3" /> No. Telepon</p>
              <p className="mt-1 text-sm font-semibold text-[#102f50]">{student.phone || "-"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="size-3" /> Alamat</p>
              <p className="mt-1 text-sm font-semibold text-[#102f50]">{student.address || "-"}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <span className="text-[#c94242]"><CalendarDays className="size-4" /></span>
            <h2 className="font-bold text-[#102f50]">Informasi Sistem</h2>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Tanggal Terdaftar</p>
              <p className="mt-1 text-sm font-semibold text-[#102f50]">
                {new Date(student.createdAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Terakhir Diperbarui</p>
              <p className="mt-1 text-sm font-semibold text-[#102f50]">
                {new Date(student.updatedAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">System ID</p>
              <p className="mt-1 text-xs font-mono text-slate-600">{student.id}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-[#c94242]"><CalendarDays className="size-4" /></span>
          <h2 className="font-bold text-[#102f50]">Riwayat Pendaftaran Batch (Enrollment)</h2>
        </div>
        {!student.enrollments || student.enrollments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500" data-testid="empty-state">
            Siswa ini belum terdaftar pada batch pelatihan manapun.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Batch</th>
                  <th className="px-5 py-3 font-semibold">Program</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Catatan</th>
                  <th className="px-5 py-3 font-semibold">Tanggal Daftar</th>
                  <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {student.enrollments.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 font-semibold text-[#102f50]">
                      {entry.batch?.name || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {entry.batch?.program ? `[${entry.batch.program.code}] ${entry.batch.program.name}` : "-"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        entry.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700"
                          : entry.status === "COMPLETED"
                          ? "bg-[#e8f2f8] text-[#357092]"
                          : entry.status === "TRANSFERRED"
                          ? "bg-[#fff6d9] text-[#a57c00]"
                          : "bg-red-50 text-red-700"
                      }`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600 max-w-xs truncate">{entry.notes || "-"}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs">
                      {new Date(entry.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {entry.batch?.id && (
                        <Link
                          href={`/batches/${entry.batch.id}`}
                          className="text-xs font-semibold text-[#123b63] hover:underline"
                        >
                          Lihat Batch &rarr;
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
