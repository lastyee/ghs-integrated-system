"use client";

import Link from "next/link";
import {
  BriefcaseBusiness,
  Building2,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  Edit2,
  CheckCircle2,
  XCircle,
  X,
  RotateCcw,
  Calendar,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";

export type VacancyItem = {
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
  };
};

export type EmployerOption = {
  id: string;
  name: string;
};

type VacancyFormValues = {
  employerId: string;
  title: string;
  description: string;
  requirements: string;
  status: "OPEN" | "CLOSED";
};

const initialFormValues: VacancyFormValues = {
  employerId: "",
  title: "",
  description: "",
  requirements: "",
  status: "OPEN",
};

export function VacanciesPage({ userRole = "" }: { userRole?: string }) {
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const [vacancies, setVacancies] = useState<VacancyItem[]>([]);
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployerId, setSelectedEmployerId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVacancy, setEditingVacancy] = useState<VacancyItem | null>(null);
  const [formValues, setFormValues] = useState<VacancyFormValues>(initialFormValues);
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Close vacancy action state
  const [closingId, setClosingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<VacancyItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch employers for dropdowns
  useEffect(() => {
    fetch("/api/employers")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setEmployers(data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch vacancies with filters
  useEffect(() => {
    let isMounted = true;

    const params = new URLSearchParams();
    if (selectedEmployerId !== "ALL") {
      params.append("employerId", selectedEmployerId);
    }
    if (selectedStatus !== "ALL") {
      params.append("status", selectedStatus);
    }

    const url = `/api/vacancies${params.toString() ? `?${params.toString()}` : ""}`;

    fetch(url)
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Gagal memuat data lowongan.");
        }
        const data = await res.json();
        if (isMounted) {
          setVacancies(data);
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
  }, [selectedEmployerId, selectedStatus, refreshTrigger]);

  const filteredVacancies = useMemo(() => {
    if (!searchQuery.trim()) return vacancies;
    const lower = searchQuery.toLowerCase();
    return vacancies.filter(
      (v) =>
        v.title.toLowerCase().includes(lower) ||
        v.description.toLowerCase().includes(lower) ||
        v.requirements.toLowerCase().includes(lower) ||
        v.employer.name.toLowerCase().includes(lower)
    );
  }, [vacancies, searchQuery]);

  const openCount = useMemo(
    () => vacancies.filter((v) => v.status === "OPEN").length,
    [vacancies]
  );
  const closedCount = useMemo(
    () => vacancies.filter((v) => v.status === "CLOSED").length,
    [vacancies]
  );

  const openCreateModal = () => {
    setEditingVacancy(null);
    setFormValues({
      ...initialFormValues,
      employerId: employers.length > 0 ? employers[0].id : "",
    });
    setFormErrors({});
    setSubmitError("");
    setModalOpen(true);
  };

  const openEditModal = (vac: VacancyItem) => {
    setEditingVacancy(vac);
    setFormValues({
      employerId: vac.employerId,
      title: vac.title,
      description: vac.description,
      requirements: vac.requirements,
      status: (vac.status as "OPEN" | "CLOSED") || "OPEN",
    });
    setFormErrors({});
    setSubmitError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    const errors: Partial<Record<string, string>> = {};

    if (!formValues.employerId.trim()) {
      errors.employerId = "Perusahaan mitra wajib dipilih.";
    }
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
      const isEdit = Boolean(editingVacancy);
      const url = isEdit ? `/api/vacancies/${editingVacancy!.id}` : "/api/vacancies";
      const method = isEdit ? "PATCH" : "POST";

      const payload = isEdit
        ? {
            employerId: formValues.employerId,
            title: formValues.title.trim(),
            description: formValues.description.trim(),
            requirements: formValues.requirements.trim(),
            status: formValues.status,
          }
        : {
            employerId: formValues.employerId,
            title: formValues.title.trim(),
            description: formValues.description.trim(),
            requirements: formValues.requirements.trim(),
            status: formValues.status,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal menyimpan data lowongan.");
      }

      setNotice(
        isEdit
          ? `Lowongan "${data.title}" berhasil diperbarui.`
          : `Lowongan "${data.title}" berhasil ditambahkan.`
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

  const handleCloseVacancy = async (vac: VacancyItem) => {
    if (!confirm(`Tutup lowongan "${vac.title}"? Pelamar tidak lagi dapat mendaftar.`)) {
      return;
    }

    setClosingId(vac.id);
    try {
      const res = await fetch(`/api/vacancies/${vac.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Gagal menutup lowongan.");
      }

      setNotice(`Lowongan "${vac.title}" telah ditutup.`);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menutup lowongan.");
    } finally {
      setClosingId(null);
    }
  };

  const deleteVacancy = async () => {
    if (!deleteCandidate) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/vacancies/${deleteCandidate.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Gagal menghapus lowongan (HTTP ${response.status})`);
      }
      setNotice(`Lowongan "${deleteCandidate.title}" berhasil dihapus.`);
      setDeleteCandidate(null);
      setRefreshTrigger((previous) => previous + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Gagal menghapus lowongan.");
    } finally {
      setDeletePending(false);
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
            Role akun Anda tidak memiliki hak akses untuk melihat atau mengelola lowongan kerja.
            Silakan hubungi Administrator atau Placement Staff jika Anda memerlukan akses ke halaman ini.
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
        aria-label="Ringkasan Lowongan Kerja"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <StatCard
          label="Total Lowongan"
          value={String(vacancies.length)}
          description="Seluruh lowongan kerja terdaftar"
          icon={BriefcaseBusiness}
          tone="navy"
        />
        <StatCard
          label="Lowongan Terbuka (OPEN)"
          value={String(openCount)}
          description="Sedang aktif membuka rekrutmen"
          icon={CheckCircle2}
          tone="yellow"
        />
        <StatCard
          label="Lowongan Ditutup (CLOSED)"
          value={String(closedCount)}
          description="Proses pendaftaran telah selesai"
          icon={XCircle}
          tone="blue"
        />
      </section>

      {/* Filters and Actions */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              id="vacancy-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari posisi, perusahaan, syarat..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
            />
          </div>

          {/* Employer Filter */}
          <select
            id="filter-vacancy-employer"
            value={selectedEmployerId}
            onChange={(e) => setSelectedEmployerId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
          >
            <option value="ALL">Semua Perusahaan</option>
            {employers.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            id="filter-vacancy-status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
          >
            <option value="ALL">Semua Status</option>
            <option value="OPEN">Hanya Terbuka (OPEN)</option>
            <option value="CLOSED">Hanya Ditutup (CLOSED)</option>
          </select>
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
            id="btn-create-vacancy"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1a4470] focus:outline-none focus:ring-2 focus:ring-[#102f50] focus:ring-offset-2"
          >
            <Plus className="size-4" />
            Tambah Lowongan
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="mt-6">
        {loading ? (
          <div
            data-testid="loading-state"
            className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <Loader2 className="size-8 animate-spin text-[#102f50]" />
            <p className="mt-3 text-sm font-medium text-slate-600">Memuat data lowongan kerja...</p>
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
        ) : filteredVacancies.length === 0 ? (
          <div
            data-testid="empty-state"
            className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <BriefcaseBusiness className="size-10 text-slate-300" />
            <p className="mt-3 text-base font-semibold text-slate-800">
              {searchQuery || selectedEmployerId !== "ALL" || selectedStatus !== "ALL"
                ? "Tidak ada lowongan yang sesuai filter"
                : "Belum Ada Lowongan Kerja"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {searchQuery || selectedEmployerId !== "ALL" || selectedStatus !== "ALL"
                ? "Silakan coba ubah kata kunci pencarian atau sesuaikan opsi filter Anda."
                : "Belum ada lowongan terdaftar di sistem. Klik tombol Tambah Lowongan untuk membuka kesempatan baru."}
            </p>
            {!searchQuery && selectedEmployerId === "ALL" && selectedStatus === "ALL" && (
              <button
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
              >
                <Plus className="size-3.5" />
                Tambah Lowongan Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" id="vacancies-table">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Posisi & Perusahaan</th>
                    <th className="px-5 py-3.5">Deskripsi & Syarat</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5">Tanggal Dibuat</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVacancies.map((vac) => (
                    <tr key={vac.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <Link
                          href={`/vacancies/${vac.id}`}
                          className="font-semibold text-[#102f50] hover:underline"
                        >
                          {vac.title}
                        </Link>
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Building2 className="size-3 text-slate-400" />
                          <Link
                            href={`/employers/${vac.employerId}`}
                            className="hover:text-[#102f50] hover:underline"
                          >
                            {vac.employer.name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <p className="line-clamp-2 max-w-md text-xs">{vac.description}</p>
                        <p className="mt-1 line-clamp-1 max-w-md text-[11px] text-slate-400">
                          Syarat: {vac.requirements}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            vac.status === "OPEN"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {vac.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3 text-slate-400" />
                          {new Date(vac.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {vac.status === "OPEN" && (
                            <button
                              onClick={() => handleCloseVacancy(vac)}
                              disabled={closingId === vac.id}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50/50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                              title="Tutup Lowongan Ini"
                            >
                              {closingId === vac.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <XCircle className="size-3" />
                              )}
                              Tutup
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(vac)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            title="Edit Lowongan"
                          >
                            <Edit2 className="size-3" />
                            Edit
                          </button>
                          <Link
                            href={`/vacancies/${vac.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-[#102f50] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1a4470]"
                          >
                            <ExternalLink className="size-3" />
                            Detail
                          </Link>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteCandidate(vac);
                                setDeleteError(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                              aria-label={`Hapus ${vac.title}`}
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

      {/* Modal Create / Edit Vacancy */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-[#102f50]">
                {editingVacancy ? "Edit Lowongan Kerja" : "Tambah Lowongan Kerja"}
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
                  title="Hapus Vacancy?"
                  recordName={deleteCandidate.title}
                  description="Vacancy akan dihapus permanen hanya jika tidak memiliki Application atau Placement. Record terkait tidak akan dihapus; server akan menolak penghapusan jika masih ada dependency."
                  confirmLabel="Hapus Vacancy"
                  pending={deletePending}
                  error={deleteError}
                  onCancel={() => {
                    if (!deletePending) setDeleteCandidate(null);
                  }}
                  onConfirm={deleteVacancy}
                />
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Perusahaan Mitra <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="form-vacancy-employer"
                    value={formValues.employerId}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, employerId: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 ${
                      formErrors.employerId
                        ? "border-red-400 focus:ring-red-500"
                        : "border-slate-300 focus:border-[#102f50] focus:ring-[#102f50]"
                    }`}
                  >
                    <option value="">Pilih Perusahaan Mitra...</option>
                    {employers.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.employerId && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.employerId}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Judul Posisi / Jabatan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="form-vacancy-title"
                    value={formValues.title}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Contoh: Commis Chef / Front Desk Agent"
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
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
                    rows={3}
                    id="form-vacancy-description"
                    value={formValues.description}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Tanggung jawab, lingkungan kerja, dan rincian tugas..."
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
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
                    rows={3}
                    id="form-vacancy-requirements"
                    value={formValues.requirements}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, requirements: e.target.value }))
                    }
                    placeholder="Kualifikasi kompetensi, keahlian bahasa, fisik, dll..."
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
                      formErrors.requirements
                        ? "border-red-400 focus:ring-red-500"
                        : "border-slate-300 focus:border-[#102f50] focus:ring-[#102f50]"
                    }`}
                  />
                  {formErrors.requirements && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.requirements}</p>
                  )}
                </div>

                {editingVacancy && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Status Lowongan
                    </label>
                    <select
                      id="form-vacancy-status"
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
                )}
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
                  id="form-vacancy-submit"
                  disabled={submitLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470] disabled:opacity-50"
                >
                  {submitLoading && <Loader2 className="size-3.5 animate-spin" />}
                  {editingVacancy ? "Simpan Perubahan" : "Simpan Lowongan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
