"use client";

import Link from "next/link";
import { AlertCircle, Edit3, Eye, Loader2, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type ProgramItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormValues = {
  code: string;
  name: string;
  description: string;
};

const emptyForm: FormValues = {
  code: "",
  name: "",
  description: "",
};

export function ProgramsPage({ userRole = "SUPER_ADMIN" }: { userRole?: string }) {
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingProgram, setEditingProgram] = useState<ProgramItem | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const canMutate = ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"].includes(userRole);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/programs")
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || `Gagal memuat program (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          setPrograms(json.data || []);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat program";
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const reloadPrograms = () => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((p) =>
      `${p.code} ${p.name} ${p.description || ""}`.toLowerCase().includes(q)
    );
  }, [programs, query]);

  const openCreate = () => {
    setForm(emptyForm);
    setErrors({});
    setEditingProgram(null);
    setModal("create");
  };

  const openEdit = (program: ProgramItem) => {
    setForm({
      code: program.code,
      name: program.name,
      description: program.description || "",
    });
    setErrors({});
    setEditingProgram(program);
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditingProgram(null);
    setErrors({});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof FormValues, string>> = {};

    if (!form.code.trim()) nextErrors.code = "Kode program wajib diisi.";
    if (!form.name.trim()) nextErrors.name = "Nama program wajib diisi.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      if (modal === "create") {
        const res = await fetch("/api/programs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
          }),
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(payload?.error || `Gagal menambahkan program (HTTP ${res.status})`);
        }

        setNotice("Program berhasil ditambahkan.");
      } else if (modal === "edit" && editingProgram) {
        const res = await fetch(`/api/programs/${editingProgram.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
          }),
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(payload?.error || `Gagal memperbarui program (HTTP ${res.status})`);
        }

        setNotice("Program berhasil diperbarui.");
      }

      closeModal();
      reloadPrograms();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan";
      setNotice(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Program</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102f50]">Program</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola kurikulum dan program training GHS</p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#ad3535]"
          >
            <Plus className="size-4" />
            Tambah Program
          </button>
        )}
      </div>

      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-slate-200 bg-[#f7fbfd] px-4 py-3 text-sm text-[#102f50]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600">
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Program</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari kode atau nama program..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#123b63]"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="size-4" />
            Reset
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-[#102f50]">Daftar Program</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Memuat data..." : `${filtered.length} program terdaftar`}
          </p>
        </div>

        {loading ? (
          <div data-testid="loading-state" className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-[#123b63]" />
            <span className="ml-3 text-sm text-slate-500">Memuat data program...</span>
          </div>
        ) : error ? (
          <div data-testid="error-state" className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="size-8 text-[#c94242]" />
            <p className="mt-2 text-sm font-semibold text-slate-800">{error}</p>
            <button
              type="button"
              onClick={reloadPrograms}
              className="mt-4 rounded-lg bg-[#123b63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0e2a47]"
            >
              Coba Lagi
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div data-testid="empty-state" className="px-5 py-12 text-center text-sm text-slate-500">
            Belum ada data program yang terdaftar.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-225 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Kode Program</th>
                    <th className="px-5 py-3 font-semibold">Nama Program</th>
                    <th className="px-5 py-3 font-semibold">Deskripsi</th>
                    <th className="px-5 py-3 font-semibold">Dibuat Pada</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((program) => (
                    <tr key={program.id}>
                      <td className="px-5 py-4 font-semibold text-[#123b63]">{program.code}</td>
                      <td className="px-5 py-4 font-semibold text-[#102f50]">{program.name}</td>
                      <td className="px-5 py-4 text-slate-600 max-w-xs truncate">{program.description || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {new Date(program.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/programs/${program.id}`}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                            aria-label={`Lihat ${program.name}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canMutate && (
                            <button
                              type="button"
                              onClick={() => openEdit(program)}
                              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                              aria-label={`Edit ${program.name}`}
                            >
                              <Edit3 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((program) => (
                <article key={program.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#102f50]">{program.name}</p>
                      <p className="mt-1 text-xs text-[#123b63]">{program.code}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{program.description || "Tidak ada deskripsi."}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href={`/programs/${program.id}`}
                      className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-[#123b63] hover:bg-slate-200"
                    >
                      Lihat Detail
                    </Link>
                    {canMutate && (
                      <button
                        type="button"
                        onClick={() => openEdit(program)}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={submit} className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[#102f50]">
                  {modal === "create" ? "Tambah Program" : "Edit Program"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Lengkapi informasi kurikulum program</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Tutup" disabled={isSubmitting}>
                <X className="size-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Kode Program *</span>
                <input
                  value={form.code}
                  onChange={(e) => setForm((curr) => ({ ...curr, code: e.target.value }))}
                  disabled={modal === "edit" || isSubmitting}
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                    errors.code ? "border-[#c94242]" : "border-slate-200"
                  } ${modal === "edit" ? "bg-slate-100 text-slate-500" : ""}`}
                  placeholder="Contoh: HTP"
                />
                {errors.code && <span className="mt-1 block text-xs text-[#c94242]">{errors.code}</span>}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nama Program *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((curr) => ({ ...curr, name: e.target.value }))}
                  disabled={isSubmitting}
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                    errors.name ? "border-[#c94242]" : "border-slate-200"
                  }`}
                  placeholder="Nama Program Pelatihan"
                />
                {errors.name && <span className="mt-1 block text-xs text-[#c94242]">{errors.name}</span>}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Deskripsi</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((curr) => ({ ...curr, description: e.target.value }))}
                  disabled={isSubmitting}
                  className="min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none"
                  placeholder="Deskripsi program pelatihan (opsional)"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#ad3535] disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {modal === "create" ? "Tambah Program" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
