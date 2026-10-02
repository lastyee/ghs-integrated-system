"use client";

import Link from "next/link";
import {
  Building2,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  BriefcaseBusiness,
  Mail,
  Phone,
  MapPin,
  Edit2,
  ExternalLink,
  X,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";
import { useToast } from "@/components/common/toast-provider";

export type EmployerRecord = {
  id: string;
  name: string;
  companyInfo: string | null;
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    vacancies: number;
  };
};

type EmployerFormValues = {
  name: string;
  companyInfo: string;
  address: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
};

const initialFormValues: EmployerFormValues = {
  name: "",
  companyInfo: "",
  address: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
};

export function EmployersPage({ userRole = "" }: { userRole?: string }) {
  const { showToast } = useToast();
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const [employers, setEmployers] = useState<EmployerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Search filter
  const [query, setQuery] = useState("");

  // Modal create/edit state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployer, setEditingEmployer] = useState<EmployerRecord | null>(null);
  const [formValues, setFormValues] = useState<EmployerFormValues>(initialFormValues);
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<EmployerRecord | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/employers")
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Gagal memuat data perusahaan.");
        }
        const data = await res.json();
        if (isMounted) {
          setEmployers(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const filteredEmployers = useMemo(() => {
    if (!query.trim()) return employers;
    const lower = query.toLowerCase();
    return employers.filter(
      (emp) =>
        emp.name.toLowerCase().includes(lower) ||
        (emp.address && emp.address.toLowerCase().includes(lower)) ||
        (emp.contactName && emp.contactName.toLowerCase().includes(lower)) ||
        (emp.companyInfo && emp.companyInfo.toLowerCase().includes(lower))
    );
  }, [employers, query]);

  const totalVacancies = useMemo(() => {
    return employers.reduce((sum, emp) => sum + (emp._count?.vacancies || 0), 0);
  }, [employers]);

  const deleteEmployer = async () => {
    if (!deleteCandidate) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/employers/${deleteCandidate.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Gagal menghapus perusahaan (HTTP ${response.status})`);
      }
      showToast("success", `Perusahaan "${deleteCandidate.name}" berhasil disembunyikan dari data aktif.`);
      setDeleteCandidate(null);
      setRefreshTrigger((previous) => previous + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus perusahaan.");
    } finally {
      setDeletePending(false);
    }
  };

  const openCreateModal = () => {
    setEditingEmployer(null);
    setFormValues(initialFormValues);
    setFormErrors({});
    setSubmitError("");
    setModalOpen(true);
  };

  const openEditModal = (emp: EmployerRecord) => {
    setEditingEmployer(emp);
    setFormValues({
      name: emp.name || "",
      companyInfo: emp.companyInfo || "",
      address: emp.address || "",
      contactName: emp.contactName || "",
      contactEmail: emp.contactEmail || "",
      contactPhone: emp.contactPhone || "",
    });
    setFormErrors({});
    setSubmitError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    const errors: Partial<Record<string, string>> = {};

    if (!formValues.name.trim()) {
      errors.name = "Nama perusahaan wajib diisi.";
    }

    if (
      formValues.contactEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.contactEmail.trim())
    ) {
      errors.contactEmail = "Format email tidak valid.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitLoading(true);

    try {
      const isEdit = Boolean(editingEmployer);
      const url = isEdit ? `/api/employers/${editingEmployer!.id}` : "/api/employers";
      const method = isEdit ? "PATCH" : "POST";

      const payload = {
        name: formValues.name.trim(),
        companyInfo: formValues.companyInfo.trim() || null,
        address: formValues.address.trim() || null,
        contactName: formValues.contactName.trim() || null,
        contactEmail: formValues.contactEmail.trim() || null,
        contactPhone: formValues.contactPhone.trim() || null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal menyimpan data perusahaan.");
      }

      setNotice(
        isEdit
          ? `Perusahaan "${data.name}" berhasil diperbarui.`
          : `Perusahaan "${data.name}" berhasil ditambahkan.`
      );
      setModalOpen(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat memproses data."
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div
          data-testid="unauthorized-state"
          className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/50 p-12 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-red-100 text-[#c94242]">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#102f50]">Akses Ditolak (403 Forbidden)</h2>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Role akun Anda tidak memiliki hak akses untuk melihat atau mengelola data perusahaan mitra.
            Silakan hubungi tim Administrator atau Placement Staff jika Anda memerlukan izin ini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      {/* Notice Banner */}
      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <section
        aria-label="Ringkasan Perusahaan Mitra"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <StatCard
          label="Total Perusahaan Mitra"
          value={String(employers.length)}
          description="Perusahaan terdaftar di sistem"
          icon={Building2}
          tone="navy"
        />
        <StatCard
          label="Total Lowongan Kerja"
          value={String(totalVacancies)}
          description="Akumulasi lowongan dari seluruh mitra"
          icon={BriefcaseBusiness}
          tone="yellow"
        />
        <StatCard
          label="Mitra Aktif Berelasi"
          value={String(employers.filter((e) => (e._count?.vacancies || 0) > 0).length)}
          description="Perusahaan yang membuka lowongan"
          icon={Building2}
          tone="blue"
        />
      </section>

      {/* Action Header & Search Bar */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            id="employer-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari perusahaan, alamat, kontak..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            title="Muat Ulang"
          >
            <RotateCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            id="btn-create-employer"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1a4470] focus:outline-none focus:ring-2 focus:ring-[#102f50] focus:ring-offset-2"
          >
            <Plus className="size-4" />
            Tambah Perusahaan
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-6">
        {loading ? (
          <div
            data-testid="loading-state"
            className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <Loader2 className="size-8 animate-spin text-[#102f50]" />
            <p className="mt-3 text-sm font-medium text-slate-600">Memuat data perusahaan mitra...</p>
          </div>
        ) : error ? (
          <div
            data-testid="error-state"
            className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm"
          >
            <AlertCircle className="size-8 text-[#c94242]" />
            <p className="mt-3 text-base font-semibold text-slate-800">Gagal Memuat Data</p>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
            <button
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="mt-4 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredEmployers.length === 0 ? (
          <div
            data-testid="empty-state"
            className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <Building2 className="size-10 text-slate-300" />
            <p className="mt-3 text-base font-semibold text-slate-800">
              {query ? "Tidak ada perusahaan yang cocok" : "Belum Ada Perusahaan Mitra"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {query
                ? `Tidak ditemukan hasil untuk "${query}". Coba kata kunci lain.`
                : "Belum ada data perusahaan mitra di sistem. Klik tombol Tambah Perusahaan untuk mendaftarkan mitra baru."}
            </p>
            {!query && (
              <button
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
              >
                <Plus className="size-3.5" />
                Tambah Perusahaan Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" id="employers-table">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Perusahaan</th>
                    <th className="px-5 py-3.5">Alamat / Lokasi</th>
                    <th className="px-5 py-3.5">Kontak Person</th>
                    <th className="px-5 py-3.5 text-center">Lowongan</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployers.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <Link
                          href={`/employers/${emp.id}`}
                          className="font-semibold text-[#102f50] hover:underline"
                        >
                          {emp.name}
                        </Link>
                        {emp.companyInfo && (
                          <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-slate-500">
                            {emp.companyInfo}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {emp.address ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <MapPin className="size-3 shrink-0 text-slate-400" />
                            <span className="line-clamp-1 max-w-xs">{emp.address}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>
                          <p className="text-xs font-medium text-slate-700">
                            {emp.contactName || "-"}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                            {emp.contactEmail && (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="size-2.5 text-slate-400" />
                                {emp.contactEmail}
                              </span>
                            )}
                            {emp.contactPhone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="size-2.5 text-slate-400" />
                                {emp.contactPhone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          {emp._count?.vacancies || 0}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="Edit Perusahaan"
                          >
                            <Edit2 className="size-3" />
                            Edit
                          </button>
                          <Link
                            href={`/employers/${emp.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-[#102f50] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1a4470]"
                          >
                            <ExternalLink className="size-3" />
                            Detail
                          </Link>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteCandidate(emp);
                                setDeleteError(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                              aria-label={`Hapus ${emp.name}`}
                            >
                              <Trash2 className="size-3" />
                              Hapus
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Create / Edit Employer */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-[#102f50]">
                {editingEmployer ? "Edit Perusahaan Mitra" : "Tambah Perusahaan Mitra"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {submitError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {submitError}
                </div>
              )}
              {deleteCandidate && (
                <DeleteConfirmationDialog
                  recordName={deleteCandidate.name}
                  description="Lowongan dan penempatan yang terkait tetap tersimpan."
                  pending={deletePending}
                  error={deleteError}
                  onCancel={() => {
                    if (!deletePending) setDeleteCandidate(null);
                  }}
                  onConfirm={deleteEmployer}
                />
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Perusahaan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="form-employer-name"
                    value={formValues.name}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Contoh: Grand Sukabumi Resort & Spa"
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
                      formErrors.name
                        ? "border-red-400 focus:ring-red-500"
                        : "border-slate-300 focus:border-[#102f50] focus:ring-[#102f50]"
                    }`}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Informasi / Profil Singkat Perusahaan
                  </label>
                  <textarea
                    rows={3}
                    id="form-employer-info"
                    value={formValues.companyInfo}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, companyInfo: e.target.value }))
                    }
                    placeholder="Deskripsi singkat profil mitra industri atau operasional..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alamat Lengkap
                  </label>
                  <input
                    type="text"
                    id="form-employer-address"
                    value={formValues.address}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, address: e.target.value }))
                    }
                    placeholder="Jl. Pelabuhan Ratu No. 45, Sukabumi"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama PIC / Kontak
                    </label>
                    <input
                      type="text"
                      id="form-employer-contact-name"
                      value={formValues.contactName}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, contactName: e.target.value }))
                      }
                      placeholder="Bambang Hartono"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomor Telepon
                    </label>
                    <input
                      type="text"
                      id="form-employer-contact-phone"
                      value={formValues.contactPhone}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, contactPhone: e.target.value }))
                      }
                      placeholder="+62 812-3456-7890"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Kontak / Rekrutmen
                  </label>
                  <input
                    type="email"
                    id="form-employer-contact-email"
                    value={formValues.contactEmail}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, contactEmail: e.target.value }))
                    }
                    placeholder="hrd@grandsukabumi.test"
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
                      formErrors.contactEmail
                        ? "border-red-400 focus:ring-red-500"
                        : "border-slate-300 focus:border-[#102f50] focus:ring-[#102f50]"
                    }`}
                  />
                  {formErrors.contactEmail && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.contactEmail}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={submitLoading}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  id="form-employer-submit"
                  disabled={submitLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470] disabled:opacity-50"
                >
                  {submitLoading && <Loader2 className="size-3.5 animate-spin" />}
                  {editingEmployer ? "Simpan Perubahan" : "Simpan Perusahaan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
