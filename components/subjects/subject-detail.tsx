"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2, AlertCircle, Calendar } from "lucide-react";

interface SubjectDetailData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export function SubjectDetail({ subjectId }: { subjectId: string }) {
  const [subject, setSubject] = useState<SubjectDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchSubject() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/subjects/${subjectId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Mata pelajaran tidak ditemukan");
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat mata pelajaran (Status: ${res.status})`);
        }
        const json = await res.json();
        if (isMounted) {
          setSubject(json.data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat mata pelajaran");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchSubject();
    return () => {
      isMounted = false;
    };
  }, [subjectId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" data-testid="loading-state">
        <Loader2 className="size-8 animate-spin text-[#123b63]" />
        <span className="ml-2 text-sm text-slate-600">Memuat detail mata pelajaran...</span>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8" data-testid="error-state">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <h1 className="text-xl font-bold text-red-800">Gagal Memuat Data</h1>
          <p className="mt-2 text-sm text-red-600">{error || "Mata pelajaran tidak ditemukan"}</p>
          <Link
            href="/subjects"
            className="mt-5 inline-flex rounded-lg bg-[#123b63] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Kembali ke daftar mata pelajaran
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <Link href="/subjects" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63]">
        <ArrowLeft className="size-4" />
        Kembali ke Mata Pelajaran
      </Link>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">Dashboard / Mata Pelajaran / {subject.code}</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">{subject.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{subject.code} · Materi Pelatihan Resmi GHS</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Informasi Mata Pelajaran" icon={<BookOpen className="size-4" />} />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Detail label="Kode Mata Pelajaran" value={subject.code} />
            <Detail label="Nama Mata Pelajaran" value={subject.name} />
            <div className="sm:col-span-2">
              <Detail label="Deskripsi" value={subject.description || "-"} />
            </div>
            <Detail label="Dibuat Pada" value={new Date(subject.createdAt).toLocaleDateString("id-ID", { dateStyle: "long" })} />
            <Detail label="Terakhir Diperbarui" value={new Date(subject.updatedAt).toLocaleDateString("id-ID", { dateStyle: "long" })} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Integrasi Kurikulum & Jadwal" icon={<Calendar className="size-4" />} />
          <div className="p-5 text-sm text-slate-600 space-y-3">
            <p>
              Mata pelajaran ini dapat dijadwalkan ke dalam kelas melalui modul Jadwal (Schedule).
              Relasi mata pelajaran diatur melalui:
            </p>
            <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-[#123b63]">
              Class &rarr; Schedule &rarr; Subject
            </div>
            <div className="pt-2">
              <Link
                href="/classes"
                className="inline-flex items-center text-sm font-semibold text-[#123b63] hover:underline"
              >
                Lihat Daftar Kelas &rarr;
              </Link>
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
