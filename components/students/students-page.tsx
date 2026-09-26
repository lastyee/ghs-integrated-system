"use client";

import Link from "next/link";
import { AlertCircle, Edit3, Eye, Loader2, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type StudentItem = {
  id: string;
  nim: string;
  nik: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormValues = {
  nim: string;
  nik: string;
  name: string;
  phone: string;
  address: string;
};

const emptyForm: FormValues = {
  nim: "",
  nik: "",
  name: "",
  phone: "",
  address: "",
};

export function StudentsPage({ userRole = "SUPER_ADMIN" }: { userRole?: string; userId?: string }) {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const canCreate = ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"].includes(userRole);
  const canEdit = ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "STUDENT"].includes(userRole);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/students")
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || `Gagal memuat data peserta (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          setStudents(json.data || []);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const reloadStudents = () => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.nim, s.name, s.nik || "", s.phone || "", s.address || ""].some((val) =>
        val.toLowerCase().includes(q)
      )
    );
  }, [students, query]);

  const openCreate = () => {
    setForm(emptyForm);
    setErrors({});
    setEditingStudent(null);
    setModal("create");
  };

  const openEdit = (student: StudentItem) => {
    setForm({
      nim: student.nim,
      nik: student.nik || "",
      name: student.name,
      phone: student.phone || "",
      address: student.address || "",
    });
    setErrors({});
    setEditingStudent(student);
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditingStudent(null);
    setErrors({});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof FormValues, string>> = {};

    if (!form.name.trim()) nextErrors.name = "Nama wajib diisi.";
    if (!form.nim.trim()) nextErrors.nim = "NIM wajib diisi.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      if (modal === "create") {
        const res = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nim: form.nim.trim(),
            name: form.name.trim(),
            nik: form.nik.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
          }),
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(payload?.error || `Gagal menambahkan peserta (HTTP ${res.status})`);
        }

        setNotice("Peserta berhasil ditambahkan.");
      } else if (modal === "edit" && editingStudent) {
        const res = await fetch(`/api/students/${editingStudent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nim: form.nim.trim(),
            name: form.name.trim(),
            nik: form.nik.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
          }),
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(payload?.error || `Gagal memperbarui peserta (HTTP ${res.status})`);
        }

        setNotice("Data peserta berhasil diperbarui.");
      }

      closeModal();
      reloadStudents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan";
      setNotice(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-375 p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Peserta</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102f50]">Peserta</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola dan lihat informasi peserta pelatihan GHS</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#ad3535]"
          >
            <Plus className="size-4" />
            Tambah Peserta
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
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Peserta</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, NIM, NIK, atau telepon..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#123b63]"
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
          <h2 className="font-bold text-[#102f50]">Daftar Peserta</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Memuat data..." : `${filteredStudents.length} peserta terdaftar`}
          </p>
        </div>

        {loading ? (
          <div data-testid="loading-state" className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-[#123b63]" />
            <span className="ml-3 text-sm text-slate-500">Memuat data peserta...</span>
          </div>
        ) : error ? (
          <div data-testid="error-state" className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="size-8 text-[#c94242]" />
            <p className="mt-2 text-sm font-semibold text-slate-800">{error}</p>
            <button
              type="button"
              onClick={reloadStudents}
              className="mt-4 rounded-lg bg-[#123b63] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0e2a47]"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div data-testid="empty-state" className="px-5 py-12 text-center text-sm text-slate-500">
            Belum ada data peserta yang terdaftar.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-225 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">NIM</th>
                    <th className="px-5 py-3 font-semibold">Nama Lengkap</th>
                    <th className="px-5 py-3 font-semibold">NIK</th>
                    <th className="px-5 py-3 font-semibold">No. Telepon</th>
                    <th className="px-5 py-3 font-semibold">Alamat</th>
                    <th className="px-5 py-3 font-semibold">Terdaftar Pada</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td className="px-5 py-4 font-semibold text-[#123b63]">{student.nim}</td>
                      <td className="px-5 py-4 font-semibold text-[#102f50]">{student.name}</td>
                      <td className="px-5 py-4 text-slate-600">{student.nik || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">{student.phone || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">{student.address || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {new Date(student.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/students/${student.id}`}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                            aria-label={`Lihat ${student.name}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(student)}
                              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                              aria-label={`Edit ${student.name}`}
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
              {filteredStudents.map((student) => (
                <article key={student.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#102f50]">{student.name}</p>
                      <p className="mt-1 text-xs text-[#123b63]">{student.nim}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-1 text-xs text-slate-500">
                    <div>
                      <dt className="inline font-medium text-slate-600">Telepon: </dt>
                      <dd className="inline">{student.phone || "-"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-600">Alamat: </dt>
                      <dd className="inline">{student.address || "-"}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href={`/students/${student.id}`}
                      className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-[#123b63] hover:bg-slate-200"
                    >
                      Lihat Detail
                    </Link>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(student)}
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
                  {modal === "create" ? "Tambah Peserta" : "Edit Peserta"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Lengkapi data pokok peserta pelatihan</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Tutup form" disabled={isSubmitting}>
                <X className="size-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">NIM *</span>
                <input
                  value={form.nim}
                  onChange={(e) => setForm((curr) => ({ ...curr, nim: e.target.value }))}
                  disabled={isSubmitting}
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                    errors.nim ? "border-[#c94242]" : "border-slate-200"
                  }`}
                  placeholder="Nomor Induk Mahasiswa"
                />
                {errors.nim && <span className="mt-1 block text-xs text-[#c94242]">{errors.nim}</span>}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nama Lengkap *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((curr) => ({ ...curr, name: e.target.value }))}
                  disabled={isSubmitting}
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                    errors.name ? "border-[#c94242]" : "border-slate-200"
                  }`}
                  placeholder="Nama Lengkap"
                />
                {errors.name && <span className="mt-1 block text-xs text-[#c94242]">{errors.name}</span>}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">NIK</span>
                <input
                  value={form.nik}
                  onChange={(e) => setForm((curr) => ({ ...curr, nik: e.target.value }))}
                  disabled={isSubmitting}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none"
                  placeholder="Nomor Induk Kependudukan (opsional)"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">No. Telepon</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((curr) => ({ ...curr, phone: e.target.value }))}
                  disabled={isSubmitting}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none"
                  placeholder="+62 8..."
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Alamat</span>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm((curr) => ({ ...curr, address: e.target.value }))}
                  disabled={isSubmitting}
                  className="min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none"
                  placeholder="Alamat lengkap (opsional)"
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
                {modal === "create" ? "Tambah Peserta" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
