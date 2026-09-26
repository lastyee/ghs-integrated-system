"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, GraduationCap, Loader2, AlertCircle } from "lucide-react";

interface BatchSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
}

interface ProgramDetailData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  batches?: BatchSummary[];
}

export function ProgramDetail({ programId }: { programId: string }) {
  const [program, setProgram] = useState<ProgramDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchProgram() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/programs/${programId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Program tidak ditemukan");
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat program (Status: ${res.status})`);
        }
        const json = await res.json();
        if (isMounted) {
          setProgram(json.data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat program");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchProgram();
    return () => {
      isMounted = false;
    };
  }, [programId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" data-testid="loading-state">
        <Loader2 className="size-8 animate-spin text-[#123b63]" />
        <span className="ml-2 text-sm text-slate-600">Memuat detail program...</span>
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8" data-testid="error-state">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <h1 className="text-xl font-bold text-red-800">Gagal Memuat Data</h1>
          <p className="mt-2 text-sm text-red-600">{error || "Program tidak ditemukan"}</p>
          <Link
            href="/programs"
            className="mt-5 inline-flex rounded-lg bg-[#123b63] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Kembali ke daftar program
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <Link href="/programs" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63]">
        <ArrowLeft className="size-4" />
        Kembali ke Program
      </Link>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">Dashboard / Program / {program.code}</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">{program.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{program.code} · Program Resmi GHS</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Informasi Program" icon={<GraduationCap className="size-4" />} />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Detail label="Kode Program" value={program.code} />
            <Detail label="Nama Program" value={program.name} />
            <div className="sm:col-span-2">
              <Detail label="Deskripsi" value={program.description || "-"} />
            </div>
            <Detail label="Dibuat Pada" value={new Date(program.createdAt).toLocaleDateString("id-ID", { dateStyle: "long" })} />
            <Detail label="Terakhir Diperbarui" value={new Date(program.updatedAt).toLocaleDateString("id-ID", { dateStyle: "long" })} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Batch Pelatihan Terkait" icon={<BookOpen className="size-4" />} />
          <div className="p-5">
            {!program.batches || program.batches.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500" data-testid="empty-state">
                Belum ada batch pelatihan untuk program ini.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Nama Batch</th>
                      <th className="px-4 py-2 font-semibold">Tanggal Mulai</th>
                      <th className="px-4 py-2 font-semibold">Tanggal Selesai</th>
                      <th className="px-4 py-2 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {program.batches.map((batch) => (
                      <tr key={batch.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 font-semibold text-[#102f50]">
                          {batch.name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(batch.startDate).toLocaleDateString("id-ID", {
                            dateStyle: "medium",
                          })}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {batch.endDate
                            ? new Date(batch.endDate).toLocaleDateString("id-ID", {
                                dateStyle: "medium",
                              })
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/batches/${batch.id}`}
                            className="text-xs font-semibold text-[#123b63] hover:underline"
                          >
                            Detail Batch &rarr;
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
