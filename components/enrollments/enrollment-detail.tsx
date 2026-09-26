"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle, User, Calendar, BookOpen } from "lucide-react";

interface EnrollmentDetailData {
  id: string;
  studentId: string;
  batchId: string;
  status: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    nim: string;
    name: string;
  };
  batch?: {
    id: string;
    name: string;
    programId: string;
    program?: {
      id: string;
      code: string;
      name: string;
    };
  };
}

export function EnrollmentDetail({ enrollmentId }: { enrollmentId: string }) {
  const [enrollment, setEnrollment] = useState<EnrollmentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/enrollments/${enrollmentId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Data pendaftaran tidak ditemukan");
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat enrollment (Status: ${res.status})`);
        }

        const json = await res.json();
        if (isMounted) {
          setEnrollment(json.data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat enrollment");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [enrollmentId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" data-testid="loading-state">
        <Loader2 className="size-8 animate-spin text-[#123b63]" />
        <span className="ml-2 text-sm text-slate-600">Memuat detail pendaftaran...</span>
      </div>
    );
  }

  if (error || !enrollment) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8" data-testid="error-state">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <h1 className="text-xl font-bold text-red-800">Gagal Memuat Data</h1>
          <p className="mt-2 text-sm text-red-600">{error || "Data pendaftaran tidak ditemukan"}</p>
          <Link
            href="/enrollments"
            className="mt-5 inline-flex rounded-lg bg-[#123b63] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Kembali ke daftar enrollment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <Link href="/enrollments" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63]">
        <ArrowLeft className="size-4" />
        Kembali ke Enrollment
      </Link>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">Dashboard / Enrollment / {enrollment.id}</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">
            {enrollment.student?.name || "Peserta"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            NIM: {enrollment.student?.nim || "-"} · Batch: {enrollment.batch?.name || "-"}
          </p>
        </div>
        <EnrollmentStatusBadge status={enrollment.status} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Informasi Pendaftaran" icon={<CheckCircle2 className="size-4" />} />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Detail label="Nama Siswa" value={enrollment.student?.name || "-"} />
            <Detail label="NIM Siswa" value={enrollment.student?.nim || "-"} />
            <Detail label="Program Pelatihan" value={enrollment.batch?.program?.name || "-"} />
            <Detail label="Batch" value={enrollment.batch?.name || "-"} />
            <Detail label="Status Enrollment" value={enrollment.status} />
            <Detail
              label="Tanggal Pendaftaran"
              value={new Date(enrollment.createdAt).toLocaleDateString("id-ID", { dateStyle: "long" })}
            />
            <div className="sm:col-span-2">
              <Detail label="Catatan Pendaftaran" value={enrollment.notes || "Tidak ada catatan"} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Tautan Entitas Terkait" icon={<BookOpen className="size-4" />} />
          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#102f50]">
                <User className="size-4 text-[#123b63]" />
                Profil Siswa
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Lihat data pribadi, dokumen, dan riwayat akademik siswa ini.
              </p>
              <div className="mt-3">
                <Link
                  href={`/students/${enrollment.studentId}`}
                  className="inline-flex text-xs font-semibold text-[#123b63] hover:underline"
                >
                  Buka Profil Siswa &rarr;
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#102f50]">
                <Calendar className="size-4 text-[#123b63]" />
                Detail Batch Pelatihan
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Lihat informasi periode pelatihan, jadwal, dan kelas dalam batch ini.
              </p>
              <div className="mt-3">
                <Link
                  href={`/batches/${enrollment.batchId}`}
                  className="inline-flex text-xs font-semibold text-[#123b63] hover:underline"
                >
                  Buka Detail Batch &rarr;
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Heading({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
      <span className="text-[#c94242]">{icon}</span>
      <h2 className="font-bold text-[#102f50]">{title}</h2>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#102f50]">{value}</p>
    </div>
  );
}

function EnrollmentStatusBadge({ status }: { status: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED" }) {
  const classes =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700"
      : status === "COMPLETED"
      ? "bg-[#e8f2f8] text-[#357092]"
      : status === "TRANSFERRED"
      ? "bg-[#fff6d9] text-[#a57c00]"
      : "bg-red-50 text-red-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      {status}
    </span>
  );
}
