"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Loader2, AlertCircle, Users, BookOpen } from "lucide-react";

interface BatchDetailData {
  id: string;
  name: string;
  programId: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  program?: {
    id: string;
    code: string;
    name: string;
  };
}

interface EnrollmentItem {
  id: string;
  studentId: string;
  batchId: string;
  status: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED";
  notes: string | null;
  createdAt: string;
  student?: {
    id: string;
    nim: string;
    name: string;
  };
}

export function BatchDetail({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<BatchDetailData | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [batchRes, enrollmentsRes] = await Promise.all([
          fetch(`/api/batches/${batchId}`),
          fetch("/api/enrollments"),
        ]);

        if (!batchRes.ok) {
          if (batchRes.status === 404) {
            throw new Error("Batch tidak ditemukan");
          }
          const errData = await batchRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat batch (Status: ${batchRes.status})`);
        }

        const batchJson = await batchRes.json();
        const enrollmentsJson = enrollmentsRes.ok ? await enrollmentsRes.json() : { data: [] };

        if (isMounted) {
          setBatch(batchJson.data);
          const batchEnrollments: EnrollmentItem[] =
            batchJson.data?.enrollments ||
            (enrollmentsJson.data || []).filter((e: EnrollmentItem) => e.batchId === batchId);
          setEnrollments(batchEnrollments);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data");
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
  }, [batchId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" data-testid="loading-state">
        <Loader2 className="size-8 animate-spin text-[#123b63]" />
        <span className="ml-2 text-sm text-slate-600">Memuat detail batch...</span>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8" data-testid="error-state">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <h1 className="text-xl font-bold text-red-800">Gagal Memuat Data</h1>
          <p className="mt-2 text-sm text-red-600">{error || "Batch tidak ditemukan"}</p>
          <Link
            href="/batches"
            className="mt-5 inline-flex rounded-lg bg-[#123b63] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Kembali ke daftar batch
          </Link>
        </div>
      </div>
    );
  }

  const activeCount = enrollments.filter((e) => e.status === "ACTIVE").length;
  const completedCount = enrollments.filter((e) => e.status === "COMPLETED").length;
  const droppedCount = enrollments.filter((e) => e.status === "DROPPED").length;
  const transferredCount = enrollments.filter((e) => e.status === "TRANSFERRED").length;

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <Link href="/batches" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63]">
        <ArrowLeft className="size-4" />
        Kembali ke Batch
      </Link>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">Dashboard / Batch / {batch.name}</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">{batch.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {batch.program ? `${batch.program.code} - ${batch.program.name}` : "Program Pelatihan"}
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <Heading title="Informasi Batch" icon={<CalendarDays className="size-4" />} />
        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Nama Batch" value={batch.name} />
          <Detail
            label="Program"
            value={batch.program ? `${batch.program.code} - ${batch.program.name}` : "-"}
          />
          <Detail
            label="Tanggal Mulai"
            value={new Date(batch.startDate).toLocaleDateString("id-ID", { dateStyle: "long" })}
          />
          <Detail
            label="Tanggal Selesai"
            value={
              batch.endDate
                ? new Date(batch.endDate).toLocaleDateString("id-ID", { dateStyle: "long" })
                : "Belum ditentukan"
            }
          />
          <Detail
            label="Dibuat Pada"
            value={new Date(batch.createdAt).toLocaleDateString("id-ID", { dateStyle: "long" })}
          />
          <Detail
            label="Terakhir Diperbarui"
            value={new Date(batch.updatedAt).toLocaleDateString("id-ID", { dateStyle: "long" })}
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <Heading title="Ringkasan Peserta Terdaftar" icon={<Users className="size-4" />} />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="Total Peserta" value={String(enrollments.length)} />
          <Summary label="Enrollment Aktif" value={String(activeCount)} />
          <Summary label="Selesai (Completed)" value={String(completedCount)} />
          <Summary label="Dropped / Transferred" value={String(droppedCount + transferredCount)} />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <Heading title="Daftar Peserta Terdaftar" icon={<BookOpen className="size-4" />} />
        {enrollments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500" data-testid="empty-state">
            Belum ada peserta yang terdaftar pada batch ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">NIM</th>
                  <th className="px-5 py-3 font-semibold">Nama Peserta</th>
                  <th className="px-5 py-3 font-semibold">Status Pendaftaran</th>
                  <th className="px-5 py-3 font-semibold">Catatan</th>
                  <th className="px-5 py-3 font-semibold">Tanggal Daftar</th>
                  <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrollments.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 font-semibold text-[#123b63]">
                      {item.student?.nim || "-"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#102f50]">
                      {item.student?.name || "-"}
                    </td>
                    <td className="px-5 py-4">
                      <EnrollmentStatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-slate-600 max-w-xs truncate">
                      {item.notes || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs">
                      {new Date(item.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {item.studentId && (
                        <Link
                          href={`/students/${item.studentId}`}
                          className="text-xs font-semibold text-[#123b63] hover:underline"
                        >
                          Lihat Peserta
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#102f50]">{value}</p>
    </div>
  );
}

function EnrollmentStatusBadge({ status }: { status: string }) {
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
