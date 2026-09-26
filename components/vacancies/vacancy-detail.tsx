"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Clock,
  Edit2,
  Loader2,
  AlertCircle,
  XCircle,
  X,
  MapPin,
  FileText,
  ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";

export type VacancyDetailData = {
  id: string;
  employerId: string;
  title: string;
  description: string;
  requirements: string;
  status: "OPEN" | "CLOSED" | string;
  createdAt: string;
  updatedAt: string;
  employer: {
    id: string;
    name: string;
    companyInfo: string | null;
    address: string | null;
  };
};

type EditVacancyFormValues = {
  title: string;
  description: string;
  requirements: string;
  status: "OPEN" | "CLOSED";
};

export function VacancyDetail({ vacancyId }: { vacancyId: string }) {
  const [vacancy, setVacancy] = useState<VacancyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [formValues, setFormValues] = useState<EditVacancyFormValues>({
    title: "",
    description: "",
    requirements: "",
    status: "OPEN",
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Close vacancy action
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetch(`/api/vacancies/${vacancyId}`)
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
          throw new Error(err.message || "Gagal memuat detail lowongan.");
        }
        const data = await res.json();
        if (isMounted) {
          setVacancy(data);
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
  }, [vacancyId, refreshTrigger]);

  const openEditModal = () => {
    if (!vacancy) return;
    setFormValues({
      title: vacancy.title,
      description: vacancy.description,
      requirements: vacancy.requirements,
      status: (vacancy.status as "OPEN" | "CLOSED") || "OPEN",
    });
    setFormErrors({});
    setSubmitError("");
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    const errors: Partial<Record<string, string>> = {};

    if (!formValues.title.trim()) {
      errors.title = "Judul posisi lowongan wajib diisi.";
    }
    if (!formValues.description.trim()) {
      errors.description = "Deskripsi pekerjaan wajib diisi.";
    }
    if (!formValues.requirements.trim()) {
      errors.requirements = "Persyaratan kualifikasi wajib diisi.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitLoading(true);

    try {
      const payload = {
        title: formValues.title.trim(),
        description: formValues.description.trim(),
        requirements: formValues.requirements.trim(),
        status: formValues.status,
      };

      const res = await fetch(`/api/vacancies/${vacancyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal memperbarui data lowongan.");
      }

      setNotice(`Lowongan "${data.title}" berhasil diperbarui.`);
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

  const handleCloseVacancy = async () => {
    if (!vacancy) return;
    if (!confirm(`Tutup lowongan "${vacancy.title}"? Pelamar tidak lagi dapat mendaftar.`)) {
      return;
    }

    setClosing(true);
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal menutup lowongan.");
      }

      setNotice(`Lowongan "${vacancy.title}" telah ditutup.`);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menutup lowongan.");
    } finally {
      setClosing(false);
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
            Role akun Anda tidak memiliki hak akses untuk melihat rincian lowongan kerja ini.
          </p>
          <Link
            href="/vacancies"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            <ArrowLeft className="size-4" />
            Kembali ke Daftar Lowongan
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
          <p className="mt-3 text-sm font-medium text-slate-600">Memuat rincian lowongan kerja...</p>
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
          <BriefcaseBusiness className="size-10 text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-800">Lowongan Tidak Ditemukan</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Lowongan yang Anda cari tidak ditemukan atau telah dihapus dari sistem.
          </p>
          <Link
            href="/vacancies"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke Daftar Lowongan
          </Link>
        </div>
      </div>
    );
  }

  if (error || !vacancy) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div
          data-testid="error-state"
          className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm"
        >
          <AlertCircle className="size-8 text-[#c94242]" />
          <p className="mt-3 text-base font-semibold text-slate-800">Gagal Memuat Lowongan</p>
          <p className="mt-1 text-sm text-slate-500">{error || "Terjadi kesalahan sistem."}</p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              Coba Lagi
            </button>
            <Link
              href="/vacancies"
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
            href="/vacancies"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            title="Kembali ke Daftar Lowongan"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#102f50]" id="vacancy-detail-title">
                {vacancy.title}
              </h1>
              <span
                id="vacancy-status-badge"
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  vacancy.status === "OPEN"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {vacancy.status}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Dipublikasikan pada{" "}
              {new Date(vacancy.createdAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {vacancy.status === "OPEN" && (
            <button
              onClick={handleCloseVacancy}
              id="btn-close-vacancy"
              disabled={closing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              {closing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <XCircle className="size-3.5" />
              )}
              Tutup Lowongan
            </button>
          )}

          <button
            onClick={openEditModal}
            id="btn-edit-vacancy-detail"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Edit2 className="size-3.5" />
            Edit Lowongan
          </button>
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

      {/* Grid: Vacancy Info and Employer Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Vacancy Details (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                <FileText className="size-4 text-slate-400" />
                Deskripsi Pekerjaan
              </div>
              <p
                className="text-sm leading-relaxed text-slate-700 whitespace-pre-line"
                id="detail-vacancy-description"
              >
                {vacancy.description}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                <ListChecks className="size-4 text-slate-400" />
                Persyaratan & Kualifikasi
              </div>
              <p
                className="text-sm leading-relaxed text-slate-700 whitespace-pre-line"
                id="detail-vacancy-requirements"
              >
                {vacancy.requirements}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-6 flex flex-wrap gap-6 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Calendar className="size-4 text-slate-400" />
                <span>
                  Dibuat:{" "}
                  {new Date(vacancy.createdAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="size-4 text-slate-400" />
                <span>
                  Diperbarui:{" "}
                  {new Date(vacancy.updatedAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Employer Info (1 col) */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Perusahaan Perekrut
            </h2>

            <div className="space-y-3">
              <div>
                <Link
                  href={`/employers/${vacancy.employer.id}`}
                  className="font-bold text-base text-[#102f50] hover:underline"
                  id="detail-vacancy-employer-name"
                >
                  {vacancy.employer.name}
                </Link>
              </div>

              {vacancy.employer.companyInfo && (
                <p className="text-xs text-slate-600 leading-relaxed" id="detail-vacancy-employer-info">
                  {vacancy.employer.companyInfo}
                </p>
              )}

              {vacancy.employer.address && (
                <div className="flex items-start gap-1.5 text-xs text-slate-500 pt-1">
                  <MapPin className="size-3.5 shrink-0 text-slate-400 mt-0.5" />
                  <span id="detail-vacancy-employer-address">{vacancy.employer.address}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100">
                <Link
                  href={`/employers/${vacancy.employer.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#102f50] hover:text-[#1a4470]"
                >
                  <Building2 className="size-3.5" />
                  Lihat Profil Perusahaan
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Edit Vacancy */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-[#102f50]">Edit Lowongan Kerja</h3>
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

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Judul Posisi / Jabatan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="edit-vacancy-title"
                    value={formValues.title}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, title: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 ${
                      formErrors.title
                        ? "border-red-400 focus:ring-red-500"
                        : "border-slate-300 focus:border-[#102f50] focus:ring-[#102f50]"
                    }`}
                  />
                  {formErrors.title && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.title}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Deskripsi Pekerjaan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    id="edit-vacancy-description"
                    value={formValues.description}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 ${
                      formErrors.description
                        ? "border-red-400 focus:ring-red-500"
                        : "border-slate-300 focus:border-[#102f50] focus:ring-[#102f50]"
                    }`}
                  />
                  {formErrors.description && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.description}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Persyaratan Kualifikasi <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    id="edit-vacancy-requirements"
                    value={formValues.requirements}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, requirements: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 ${
                      formErrors.requirements
                        ? "border-red-400 focus:ring-red-500"
                        : "border-slate-300 focus:border-[#102f50] focus:ring-[#102f50]"
                    }`}
                  />
                  {formErrors.requirements && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.requirements}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Lowongan
                  </label>
                  <select
                    id="edit-vacancy-status"
                    value={formValues.status}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        status: e.target.value as "OPEN" | "CLOSED",
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
                  >
                    <option value="OPEN">OPEN (Terbuka)</option>
                    <option value="CLOSED">CLOSED (Ditutup)</option>
                  </select>
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
                  id="edit-vacancy-submit"
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
