"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Plane,
  Plus,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { PlacementFormModal } from "./placement-form";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";

export type PlacementListItem = {
  id: string;
  applicationId: string | null;
  studentId: string;
  employerId: string;
  vacancyId: string | null;
  position: string;
  startDate: string | null;
  status: "PREPARATION" | "READY" | "DEPARTED" | "PLACED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    nim: string;
    name: string;
    phone: string | null;
    address: string | null;
    userId: string | null;
  };
  employer: {
    id: string;
    name: string;
    companyInfo: string | null;
    address: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  vacancy: {
    id: string;
    title: string;
    description: string;
    requirements: string;
    status: string;
  } | null;
  application: {
    id: string;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type PlacementsPageProps = {
  userRole?: string;
  userId?: string;
};

export function PlacementStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PREPARATION":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-[#e7eef5] px-2.5 py-0.5 text-xs font-semibold text-[#123b63]">
          <Clock3 className="size-3" />
          Persiapan
        </span>
      );
    case "READY":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-[#fff6d9] px-2.5 py-0.5 text-xs font-semibold text-[#a57c00]">
          <CheckCircle2 className="size-3" />
          Siap
        </span>
      );
    case "DEPARTED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-[#e8f2f8] px-2.5 py-0.5 text-xs font-semibold text-[#357092]">
          <Plane className="size-3" />
          Berangkat
        </span>
      );
    case "PLACED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="size-3" />
          Ditempatkan
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-[#fbeaea] px-2.5 py-0.5 text-xs font-semibold text-[#c94242]">
          <XCircle className="size-3" />
          Dibatalkan
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {status}
        </span>
      );
  }
}

export function PlacementsPage({ userRole }: PlacementsPageProps) {
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const [placements, setPlacements] = useState<PlacementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const isStaff = useMemo(
    () =>
      userRole === "SUPER_ADMIN" ||
      userRole === "ADMIN" ||
      userRole === "PLACEMENT_STAFF",
    [userRole]
  );
  const isStudent = userRole === "STUDENT";
  const isForbiddenRole =
    userRole === "ACADEMIC_STAFF" || userRole === "INSTRUCTOR";

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== debouncedSearchQuery) {
        setDebouncedSearchQuery(searchQuery);
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery, debouncedSearchQuery]);

  useEffect(() => {
    if (isForbiddenRole) return;

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      ...(debouncedSearchQuery.trim() ? { search: debouncedSearchQuery.trim() } : {}),
      ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
    });

    fetch(`/api/placements?${params.toString()}`)
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          return;
        }

        if (!res.ok) {
          setError("Gagal memuat daftar penempatan dari server.");
          return;
        }

        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        setPlacements(list);
        if (json.pagination) {
          setTotal(json.pagination.total);
          setTotalPages(json.pagination.totalPages);
        } else {
          setTotal(list.length);
          setTotalPages(1);
        }
      })
      .catch(() => {
        if (isMounted) setError("Terjadi kesalahan jaringan.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isForbiddenRole, page, debouncedSearchQuery, statusFilter, refreshTrigger]);

  // Unauthorized State
  if (unauthorized || isForbiddenRole) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div
          data-testid="unauthorized-state"
          className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm"
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertCircle className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-800">
            Akses Tidak Diizinkan
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Anda tidak memiliki wewenang untuk mengakses modul Penempatan Kerja.
          </p>
        </div>
      </div>
    );
  }

  // Error State
  if (error && !loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div
          data-testid="error-state"
          className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm"
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertCircle className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-800">
            Terjadi Kesalahan
          </h3>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
          <button
            type="button"
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
          >
            <RotateCcw className="size-3.5" />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8 space-y-6">
      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-0 w-full">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            type="text"
            placeholder={
              isStudent
                ? "Cari perusahaan, posisi..."
                : "Cari peserta, NIM, perusahaan, posisi..."
            }
            data-testid="placement-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full min-w-0 rounded-lg border border-slate-200 py-2 pr-3 pl-9 text-xs text-slate-800 placeholder-slate-400 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            data-testid="placement-status-filter"
            aria-label="Filter status penempatan"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#102f50] focus:ring-1 focus:ring-[#102f50] focus:outline-hidden"
          >
            <option value="ALL">Semua Status</option>
            <option value="PREPARATION">Persiapan</option>
            <option value="READY">Siap</option>
            <option value="DEPARTED">Berangkat</option>
            <option value="PLACED">Ditempatkan</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
          {(searchQuery || statusFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setDebouncedSearchQuery("");
                setStatusFilter("ALL");
                setPage(1);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>
          )}
          {isStaff && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              data-testid="create-placement-trigger"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#102f50] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#1a4470] focus:ring-2 focus:ring-[#102f50] focus:ring-offset-2 focus:outline-hidden"
            >
              <Plus className="size-4" />
              Catat Penempatan
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div
          data-testid="loading-state"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 shadow-xs"
        >
          <Loader2 className="size-8 animate-spin text-[#102f50]" />
          <p className="mt-3 text-xs text-slate-500">
            Memuat data penempatan...
          </p>
        </div>
      ) : placements.length === 0 ? (
        /* Empty State */
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center shadow-xs"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Building2 className="size-6" />
          </div>
          <h3 className="mt-4 text-sm font-bold text-slate-800">
            Belum Ada Data Penempatan
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            {isStudent
              ? "Anda belum memiliki catatan penempatan kerja yang terdaftar di sistem."
              : "Belum ada record penempatan yang sesuai dengan filter atau kata kunci pencarian."}
          </p>
          {isStaff && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="size-3.5" />
              Tambah Penempatan Baru
            </button>
          )}
        </div>
      ) : (
        /* Data Presentation */
        <>
          {/* Desktop Table View */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Kandidat / Siswa
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Perusahaan Mitra
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Posisi Kerja
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Tgl Mulai
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y border-slate-100 divide-slate-100 font-medium text-slate-700">
                {placements.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-slate-50/50"
                  >
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-900">
                        {item.student?.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        NIM: {item.student?.nim}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <Building2 className="size-3.5 text-slate-400" />
                        {item.employer?.name}
                      </div>
                      {item.vacancy && (
                        <div className="text-[11px] text-slate-400">
                          Lowongan: {item.vacancy.title}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <Briefcase className="size-3.5 text-slate-400" />
                        {item.position}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {item.startDate ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3.5 text-slate-400" />
                          {new Date(item.startDate).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <PlacementStatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/placements/${item.id}`}
                        data-testid="view-placement-btn"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#102f50] hover:bg-slate-50"
                      >
                        Detail
                        <ExternalLink className="size-3" />
                      </Link>
                      {canDelete && (
                        <SoftDeleteAction
                          endpoint={`/api/placements/${item.id}`}
                          recordName="Penempatan"
                          identifier={`${item.student?.name} / ${item.position}`}
                          description="Penempatan akan disembunyikan dari data aktif. Riwayat lamaran dan relasi perusahaan tetap tersimpan."
                          onDeleted={() => setRefreshTrigger((prev) => prev + 1)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="grid gap-3 md:hidden">
            {placements.map((item) => (
              <div
                key={item.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {item.student?.name}
                    </h3>
                    <p className="text-xs text-slate-400">NIM: {item.student?.nim}</p>
                  </div>
                  <PlacementStatusBadge status={item.status} />
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-3.5 shrink-0 text-slate-400" />
                    <span className="font-semibold text-slate-800">
                      {item.employer?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="size-3.5 shrink-0 text-slate-400" />
                    <span>{item.position}</span>
                  </div>
                  {item.startDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="size-3.5 shrink-0 text-slate-400" />
                      <span>
                        Mulai:{" "}
                        {new Date(item.startDate).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <Link
                    href={`/placements/${item.id}`}
                    data-testid="view-placement-btn"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-[#102f50] hover:bg-slate-100"
                  >
                    Buka Rincian Penempatan
                    <ExternalLink className="size-3.5" />
                  </Link>
                  {canDelete && (
                    <SoftDeleteAction
                      endpoint={`/api/placements/${item.id}`}
                      recordName="Penempatan"
                      identifier={`${item.student?.name} / ${item.position}`}
                      description="Penempatan akan disembunyikan dari data aktif. Riwayat lamaran dan relasi perusahaan tetap tersimpan."
                      onDeleted={() => setRefreshTrigger((prev) => prev + 1)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {total > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-xs">
              <span className="text-xs text-slate-500">
                Halaman {page} dari {totalPages} ({total} penempatan)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {isStaff && (
        <PlacementFormModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}
    </div>
  );
}
