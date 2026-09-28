"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  BriefcaseBusiness,
  MapPin,
  Mail,
  Phone,
  User,
  Calendar,
  Edit2,
  Loader2,
  AlertCircle,
  X,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";

export type VacancySummary = {
  id: string;
  title: string;
  description: string;
  requirements: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployerDetailData = {
  id: string;
  name: string;
  companyInfo: string | null;
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
  vacancies: VacancySummary[];
};

type EditFormValues = {
  name: string;
  companyInfo: string;
  address: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
};

export function EmployerDetail({ employerId, userRole = "" }: { employerId: string; userRole?: string }) {
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const [employer, setEmployer] = useState<EmployerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [formValues, setFormValues] = useState<EditFormValues>({
    name: "",
    companyInfo: "",
    address: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletedName, setDeletedName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch(`/api/employers/${employerId}`)
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Gagal memuat detail perusahaan.");
        }
        const data = await res.json();
        if (isMounted) {
          setEmployer(data);
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
  }, [employerId, refreshTrigger]);

  const deleteEmployer = async () => {
    if (!employer) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/employers/${employerId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Gagal menghapus perusahaan (HTTP ${response.status})`);
      }
      setDeletedName(employer.name);
      setEmployer(null);
      setDeleteDialogOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus perusahaan.");
    } finally {
      setDeletePending(false);
    }
  };

  if (deletedName) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Perusahaan &quot;{deletedName}&quot; berhasil dihapus.
        </p>
        <Link href="/employers" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#102f50]">
          <ArrowLeft className="size-4" />
          Kembali ke Daftar Perusahaan
        </Link>
      </div>
    );
  }

  const openEditModal = () => {
    if (!employer) return;
    setFormValues({
      name: employer.name || "",
      companyInfo: employer.companyInfo || "",
      address: employer.address || "",
      contactName: employer.contactName || "",
      contactEmail: employer.contactEmail || "",
      contactPhone: employer.contactPhone || "",
    });
    setFormErrors({});
    setSubmitError("");
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
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
      const payload = {
        name: formValues.name.trim(),
        companyInfo: formValues.companyInfo.trim() || null,
        address: formValues.address.trim() || null,
        contactName: formValues.contactName.trim() || null,
        contactEmail: formValues.contactEmail.trim() || null,
        contactPhone: formValues.contactPhone.trim() || null,
      };

      const res = await fetch(`/api/employers/${employerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal memperbarui data perusahaan.");
      }

      setNotice(`Perusahaan "${data.name}" berhasil diperbarui.`);
      setEditModalOpen(false);
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
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div
          data-testid="unauthorized-state"
          className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/50 p-12 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-red-100 text-[#c94242]">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#102f50]">Akses Ditolak (403 Forbidden)</h2>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Role akun Anda tidak memiliki hak akses untuk melihat detail perusahaan ini.
          </p>
          <Link
            href="/employers"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            <ArrowLeft className="size-4" />
            Kembali ke Daftar Perusahaan
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div
          data-testid="loading-state"
          className="flex min-h-[350px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-sm font-medium text-slate-600">Memuat detail perusahaan...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div
          data-testid="not-found-state"
          className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <Building2 className="size-10 text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-800">Perusahaan Tidak Ditemukan</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Data perusahaan yang Anda cari tidak ditemukan atau telah dihapus dari sistem.
          </p>
          <Link
            href="/employers"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Daftar Perusahaan
          </Link>
        </div>
      </div>
    );
  }

  if (error || !employer) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div
          data-testid="error-state"
          className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm"
        >
          <AlertCircle className="size-8 text-[#c94242]" />
          <p className="mt-3 text-base font-semibold text-slate-800">Gagal Memuat Detail</p>
          <p className="mt-1 text-sm text-slate-500">{error || "Terjadi kesalahan sistem."}</p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              Coba Lagi
            </button>
            <Link
              href="/employers"
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6">
      {/* Back button & Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/employers"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            title="Kembali ke Daftar Perusahaan"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#102f50]" id="employer-detail-title">
              {employer.name}
            </h1>
            <p className="text-xs text-slate-500">
              Terdaftar sejak{" "}
              {new Date(employer.createdAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openEditModal}
            id="btn-edit-employer-detail"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Edit2 className="size-3.5" />
            Edit Profil Perusahaan
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteDialogOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50"
            >
              <Trash2 className="size-3.5" />
              Hapus Employer
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Company Information Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
          Informasi Perusahaan Mitra
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">Nama Perusahaan</p>
              <p className="mt-1 text-sm font-bold text-[#102f50]" id="detail-employer-name">
                {employer.name}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500">Profil / Deskripsi Singkat</p>
              <p className="mt-1 text-sm text-slate-700 whitespace-pre-line" id="detail-employer-info">
                {employer.companyInfo || <span className="italic text-slate-400">Belum ada keterangan profil</span>}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500">Alamat Lengkap</p>
              <div className="mt-1 flex items-start gap-1.5 text-sm text-slate-700">
                <MapPin className="size-4 shrink-0 text-slate-400 mt-0.5" />
                <span id="detail-employer-address">
                  {employer.address || <span className="italic text-slate-400">Belum ada alamat</span>}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4 md:border-l md:border-slate-100 md:pl-6">
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Kontak Person (PIC)
            </h3>

            <div>
              <p className="text-xs font-semibold text-slate-500">Nama Kontak</p>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                <User className="size-4 text-slate-400" />
                <span id="detail-employer-contact-name">
                  {employer.contactName || <span className="italic text-slate-400">-</span>}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500">Email</p>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                <Mail className="size-4 text-slate-400" />
                <span id="detail-employer-contact-email">
                  {employer.contactEmail || <span className="italic text-slate-400">-</span>}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500">Nomor Telepon / WhatsApp</p>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                <Phone className="size-4 text-slate-400" />
                <span id="detail-employer-contact-phone">
                  {employer.contactPhone || <span className="italic text-slate-400">-</span>}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vacancies Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-[#102f50]">Lowongan Terkait</h2>
            <p className="text-xs text-slate-500">
              Daftar lowongan kerja yang dibuka oleh {employer.name}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {employer.vacancies?.length || 0} Lowongan
          </span>
        </div>

        {employer.vacancies && employer.vacancies.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-100">
            {employer.vacancies.map((vac) => (
              <div
                key={vac.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 first:pt-2 last:pb-2 hover:bg-slate-50/50 rounded-lg px-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/vacancies/${vac.id}`}
                      className="font-semibold text-sm text-[#102f50] hover:underline"
                    >
                      {vac.title}
                    </Link>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        vac.status === "OPEN"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {vac.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="size-3 text-slate-400" />
                    <span>
                      Dibuat:{" "}
                      {new Date(vac.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/vacancies/${vac.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#102f50] hover:text-[#1a4470]"
                >
                  Detail Lowongan
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div
            data-testid="employer-vacancies-empty"
            className="flex min-h-[160px] flex-col items-center justify-center p-6 text-center"
          >
            <BriefcaseBusiness className="size-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">Belum Ada Lowongan</p>
            <p className="text-xs text-slate-400">
              Perusahaan ini belum memiliki lowongan kerja yang terdaftar di sistem.
            </p>
          </div>
        )}
      </div>

      {/* Modal Edit Employer */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-[#102f50]">Edit Profil Perusahaan Mitra</h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6">
              {submitError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {submitError}
                </div>
              )}
              {canDelete && deleteDialogOpen && (
                <DeleteConfirmationDialog
                  title="Hapus Employer?"
                  recordName={employer.name}
                  description="Employer akan dihapus permanen hanya jika tidak memiliki Vacancy atau Placement. Data terkait tidak akan dihapus."
                  confirmLabel="Hapus Employer"
                  pending={deletePending}
                  error={deleteError}
                  onCancel={() => {
                    if (!deletePending) setDeleteDialogOpen(false);
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
                    id="edit-employer-name"
                    value={formValues.name}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 ${
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
                    Profil / Informasi Singkat
                  </label>
                  <textarea
                    rows={3}
                    id="edit-employer-info"
                    value={formValues.companyInfo}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, companyInfo: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alamat Lengkap
                  </label>
                  <input
                    type="text"
                    id="edit-employer-address"
                    value={formValues.address}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, address: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama PIC / Kontak
                    </label>
                    <input
                      type="text"
                      id="edit-employer-contact-name"
                      value={formValues.contactName}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, contactName: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomor Telepon
                    </label>
                    <input
                      type="text"
                      id="edit-employer-contact-phone"
                      value={formValues.contactPhone}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, contactPhone: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Kontak / Rekrutmen
                  </label>
                  <input
                    type="email"
                    id="edit-employer-contact-email"
                    value={formValues.contactEmail}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, contactEmail: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 ${
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
                  onClick={() => setEditModalOpen(false)}
                  disabled={submitLoading}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  id="edit-employer-submit"
                  disabled={submitLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470] disabled:opacity-50"
                >
                  {submitLoading && <Loader2 className="size-3.5 animate-spin" />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
