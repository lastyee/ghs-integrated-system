"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2, AlertCircle, UserCheck, Users } from "lucide-react";

interface ScheduleItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  topic: string | null;
  status: string;
  subject?: {
    id: string;
    code: string;
    name: string;
  };
}

interface ClassDetailData {
  id: string;
  name: string;
  batchId: string;
  instructorId: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  batch?: {
    id: string;
    name: string;
    programId: string;
    startDate: string;
    endDate: string | null;
  };
  instructor?: {
    id: string;
    name: string;
  };
  schedules?: ScheduleItem[];
}

interface EnrollmentItem {
  id: string;
  studentId: string;
  batchId: string;
  status: "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED";
  student?: {
    id: string;
    nim: string;
    name: string;
  };
}

export function ClassDetail({ classId }: { classId: string }) {
  const [classRecord, setClassRecord] = useState<ClassDetailData | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const classRes = await fetch(`/api/classes/${classId}`);
        if (!classRes.ok) {
          if (classRes.status === 404) {
            throw new Error("Kelas tidak ditemukan");
          }
          const errData = await classRes.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal memuat kelas (Status: ${classRes.status})`);
        }

        const classJson = await classRes.json();
        const loadedClass: ClassDetailData = classJson.data;

        let batchEnrollments: EnrollmentItem[] = [];
        if (loadedClass.batchId) {
          const enrollmentsRes = await fetch("/api/enrollments");
          if (enrollmentsRes.ok) {
            const enrollJson = await enrollmentsRes.json();
            const allEnrollments: EnrollmentItem[] = enrollJson.data || [];
            batchEnrollments = allEnrollments.filter((e) => e.batchId === loadedClass.batchId);
          }
        }

        if (isMounted) {
          setClassRecord(loadedClass);
          setEnrollments(batchEnrollments);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data kelas");
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
  }, [classId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" data-testid="loading-state">
        <Loader2 className="size-8 animate-spin text-[#123b63]" />
        <span className="ml-2 text-sm text-slate-600">Memuat detail kelas...</span>
      </div>
    );
  }

  if (error || !classRecord) {
    return (
      <div className="mx-auto max-w-375 p-4 sm:p-8" data-testid="error-state">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto size-8 text-red-600 mb-2" />
          <h1 className="text-xl font-bold text-red-800">Gagal Memuat Data</h1>
          <p className="mt-2 text-sm text-red-600">{error || "Kelas tidak ditemukan"}</p>
          <Link
            href="/classes"
            className="mt-5 inline-flex rounded-lg bg-[#123b63] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Kembali ke daftar kelas
          </Link>
        </div>
      </div>
    );
  }

  const activeCount = enrollments.filter((e) => e.status === "ACTIVE").length;

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <Link href="/classes" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b63]">
        <ArrowLeft className="size-4" />
        Kembali ke Kelas
      </Link>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">Dashboard / Kelas / {classRecord.name}</p>
          <h1 className="mt-2 text-2xl font-bold text-[#102f50]">{classRecord.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {classRecord.batch?.name || "Batch"} · Pelatihan Terjadwal GHS
          </p>
        </div>
        <ClassStatusBadge status={classRecord.status} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Informasi Kelas" icon={<BookOpen className="size-4" />} />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Detail label="Nama Kelas" value={classRecord.name} />
            <Detail label="Status Pelaksanaan" value={classRecord.status} />
            <Detail label="Batch" value={classRecord.batch?.name || "-"} />
            <Detail label="Instruktur Pengampu" value={classRecord.instructor?.name || "-"} />
            <Detail
              label="Dibuat Pada"
              value={new Date(classRecord.createdAt).toLocaleDateString("id-ID", { dateStyle: "long" })}
            />
            <Detail
              label="Terakhir Diperbarui"
              value={new Date(classRecord.updatedAt).toLocaleDateString("id-ID", { dateStyle: "long" })}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Heading title="Peserta & Kehadiran" icon={<Users className="size-4" />} />
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-100 p-4">
                <p className="text-xs text-slate-500">Peserta Batch Terdaftar</p>
                <p className="mt-2 text-2xl font-bold text-[#102f50]">{enrollments.length}</p>
              </div>
              <div className="rounded-lg border border-slate-100 p-4">
                <p className="text-xs text-slate-500">Siswa Aktif</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{activeCount}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Jadwal sesi dan kehadiran siswa untuk kelas ini dikelola melalui modul Jadwal & Kehadiran:
            </p>
            <div className="flex gap-3">
              <Link
                href="/schedule"
                className="inline-flex items-center text-xs font-semibold text-[#123b63] hover:underline"
              >
                Lihat Jadwal Kelas &rarr;
              </Link>
              <Link
                href="/attendance"
                className="inline-flex items-center text-xs font-semibold text-[#123b63] hover:underline"
              >
                Lihat Presensi Kelas &rarr;
              </Link>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <Heading title="Jadwal Sesi & Mata Pelajaran" icon={<BookOpen className="size-4" />} />
        {!classRecord.schedules || classRecord.schedules.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500" data-testid="empty-state">
            Belum ada jadwal sesi yang dikaitkan dengan kelas ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Tanggal</th>
                  <th className="px-5 py-3 font-semibold">Waktu</th>
                  <th className="px-5 py-3 font-semibold">Mata Pelajaran</th>
                  <th className="px-5 py-3 font-semibold">Ruangan</th>
                  <th className="px-5 py-3 font-semibold">Topik</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classRecord.schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 font-semibold text-[#102f50]">
                      {new Date(s.date).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {s.startTime} - {s.endTime}
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#123b63]">
                      {s.subject ? `[${s.subject.code}] ${s.subject.name}` : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{s.room || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">{s.topic || "-"}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <Heading title="Daftar Siswa dalam Batch Kelas Ini" icon={<UserCheck className="size-4" />} />
        {enrollments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500" data-testid="empty-state">
            Belum ada siswa yang terdaftar pada batch kelas ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">NIM</th>
                  <th className="px-5 py-3 font-semibold">Nama Siswa</th>
                  <th className="px-5 py-3 font-semibold">Status Pendaftaran</th>
                  <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrollments.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 font-semibold text-[#123b63]">
                      {entry.student?.nim || "-"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#102f50]">
                      {entry.student?.name || "-"}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                      {entry.status}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {entry.studentId && (
                        <Link
                          href={`/students/${entry.studentId}`}
                          className="text-xs font-semibold text-[#123b63] hover:underline"
                        >
                          Lihat Siswa
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

function ClassStatusBadge({ status }: { status: "SCHEDULED" | "COMPLETED" | "CANCELLED" }) {
  const classes =
    status === "SCHEDULED"
      ? "bg-[#e8f2f8] text-[#357092]"
      : status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-[#fbeaea] text-[#c94242]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      {status}
    </span>
  );
}
