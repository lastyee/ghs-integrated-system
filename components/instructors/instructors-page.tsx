"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, RotateCcw, Trash2, Users } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";
import { useToast } from "@/components/common/toast-provider";

type Instructor = {
  id: string;
  name: string;
  userId: string | null;
  _count: {
    classes: number;
    schedules: number;
  };
};

export function InstructorsPage({ canDelete }: { canDelete: boolean }) {
  const { showToast } = useToast();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Instructor | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/instructors")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Gagal memuat instruktur (HTTP ${response.status})`);
        return payload.data as Instructor[];
      })
      .then((data) => {
        if (!active) return;
        setInstructors(data);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Gagal memuat instruktur.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const deleteInstructor = async () => {
    if (!candidate) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/instructors/${candidate.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Gagal menghapus instruktur (HTTP ${response.status})`);
      }
      showToast("success", `Instruktur "${candidate.name}" berhasil disembunyikan dari data aktif.`);
      setCandidate(null);
      reload();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Gagal menghapus instruktur.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-6">
        <p className="text-xs font-medium text-slate-500">Dashboard / Akademik / Instruktur</p>
        <h1 className="mt-2 text-2xl font-bold text-[#102f50]">Instruktur</h1>
        <p className="mt-1 text-sm text-slate-500">Data pengampu Class dan Schedule.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto size-8 text-red-600" />
          <p className="mt-2 font-semibold text-red-800">Gagal memuat instruktur</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <button type="button" onClick={reload} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">
            <RotateCcw className="size-4" />
            Coba lagi
          </button>
        </div>
      ) : loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <Loader2 className="size-7 animate-spin text-[#123b63]" />
          <span className="ml-2 text-sm text-slate-600">Memuat instruktur...</span>
        </div>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Nama Instruktur</th>
                <th className="px-5 py-3 font-semibold">Class</th>
                <th className="px-5 py-3 font-semibold">Schedule</th>
                <th className="px-5 py-3 font-semibold">Akun User</th>
                {canDelete && <th className="px-5 py-3 text-right font-semibold">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instructors.map((instructor) => {
                return (
                  <tr key={instructor.id}>
                    <td className="px-5 py-4 font-semibold text-[#102f50]">{instructor.name}</td>
                    <td className="px-5 py-4 text-slate-600">{instructor._count.classes}</td>
                    <td className="px-5 py-4 text-slate-600">{instructor._count.schedules}</td>
                    <td className="px-5 py-4 text-slate-600">{instructor.userId ? "Tertaut" : "Tidak tertaut"}</td>
                    {canDelete && (
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setCandidate(instructor);
                          }}
                          title="Sembunyikan instruktur dari data aktif"
                          aria-label={`Hapus ${instructor.name}`}
                          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="size-4" />
                          Hapus
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {instructors.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 5 : 4} className="px-5 py-10 text-center text-slate-500">
                    <Users className="mx-auto mb-2 size-7 text-slate-300" />
                    Belum ada data instruktur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {candidate && (
        <DeleteConfirmationDialog
          recordName={candidate.name}
          description="Akun pengguna, kelas, dan jadwal yang terkait tetap tersimpan."
          pending={deletePending}
          error={deleteError}
          onCancel={() => {
            if (!deletePending) {
              setCandidate(null);
              setDeleteError(null);
            }
          }}
          onConfirm={deleteInstructor}
        />
      )}
    </div>
  );
}
