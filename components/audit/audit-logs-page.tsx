"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  FileSearch,
  Filter,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

export type AuditLogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    email?: string | null;
  } | null;
  summary: string;
  details: Record<string, unknown>;
  changes: Record<string, unknown>;
};

export type AuditLogPageInfo = {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  page: number;
  totalPages: number;
  totalCount: number;
};

const ACTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CREATE: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  UPDATE: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  DELETE: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  GRADE: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  UPLOAD: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  VERIFY: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  ACTIVATE_ACCOUNT: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
};

const DEFAULT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "GRADE",
  "UPLOAD",
  "VERIFY",
  "ACTIVATE_ACCOUNT",
];

const DEFAULT_ENTITIES = [
  "Assignment",
  "AssignmentSubmission",
  "Assessment",
  "AssessmentScore",
  "Attendance",
  "Student",
  "Class",
  "Schedule",
  "Batch",
  "Program",
  "Subject",
  "Document",
  "Employer",
  "Vacancy",
  "Application",
  "Interview",
  "Placement",
  "User",
];

export function AuditLogsPage({ currentUserRole }: { currentUserRole?: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pageInfo, setPageInfo] = useState<AuditLogPageInfo>({
    limit: 20,
    hasMore: false,
    nextCursor: null,
    page: 1,
    totalPages: 1,
    totalCount: 0,
  });

  const [availableActions, setAvailableActions] = useState<string[]>(DEFAULT_ACTIONS);
  const [availableEntities, setAvailableEntities] = useState<string[]>(DEFAULT_ENTITIES);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Status states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail modal state
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", pageSize.toString());

      if (search.trim()) params.set("search", search.trim());
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entity", entityFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Sesi login berakhir. Silakan muat ulang halaman.");
        }
        if (res.status === 403) {
          throw new Error("Akses ditolak: Anda tidak memiliki permission 'audit:read'.");
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Gagal memuat audit log (HTTP ${res.status})`);
      }

      const json = await res.json();
      setLogs(json.data || []);
      if (json.pageInfo) {
        setPageInfo(json.pageInfo);
      }
      if (json.meta?.availableActions?.length) {
        setAvailableActions(json.meta.availableActions);
      }
      if (json.meta?.availableEntities?.length) {
        setAvailableEntities(json.meta.availableEntities);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan memuat audit logs.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, actionFilter, entityFilter, startDate, endDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setSearch("");
    setActionFilter("");
    setEntityFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    search || actionFilter || entityFilter || startDate || endDate,
  );

  const formatWibDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const formattedDate = d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const formattedTime = d.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return `${formattedDate}, ${formattedTime} WIB`;
    } catch {
      return isoString;
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Audit Log
              </p>
              <p className="mt-1 text-2xl font-bold text-[#102f50]">
                {pageInfo.totalCount.toLocaleString("id-ID")}
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <History className="size-5" />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Riwayat tersimpan permanen secara append-only
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Hasil Terfilter
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {logs.length} <span className="text-sm font-normal text-slate-500">baris</span>
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Filter className="size-5" />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Halaman {pageInfo.page} dari {pageInfo.totalPages}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Integritas Keamanan
              </p>
              <p className="mt-1 text-base font-bold text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck className="size-4" /> Terverifikasi
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Lock className="size-5" />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Sanitasi server aktif & redaksi kredensial
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Otorisasi Akses
              </p>
              <p className="mt-1 text-base font-bold text-slate-800">
                {currentUserRole ?? "ADMIN"}
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CheckCircle2 className="size-5" />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Permission: <code className="text-slate-700 font-mono">audit:read</code>
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex-1 max-w-md flex items-center gap-2"
          >
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari ID Entitas, Nama Pelaku, atau Email..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#102f50] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#102f50]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#102f50] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c243e] transition-colors shrink-0"
            >
              Cari
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchLogs()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Muat ulang data"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Segarkan</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns & Date Pickers */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4 border-t border-slate-100 pt-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Filter Aksi
            </label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#102f50] focus:outline-hidden"
            >
              <option value="">Semua Aksi</option>
              {availableActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Filter Entitas
            </label>
            <select
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#102f50] focus:outline-hidden"
            >
              <option value="">Semua Entitas</option>
              {availableEntities.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Tanggal Mulai
            </label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#102f50] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Tanggal Selesai
            </label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#102f50] focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchLogs()}
            className="rounded-md bg-rose-600 px-3 py-1 font-medium text-white hover:bg-rose-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Main Table Section */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold">
                <th className="py-3 px-4 whitespace-nowrap">Waktu (WIB)</th>
                <th className="py-3 px-4 whitespace-nowrap">Pelaku</th>
                <th className="py-3 px-4 whitespace-nowrap">Aksi</th>
                <th className="py-3 px-4 whitespace-nowrap">Entitas Target</th>
                <th className="py-3 px-4 min-w-[280px]">Ringkasan Aktivitas</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="h-3 w-32 bg-slate-200 rounded-sm"></div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3 w-28 bg-slate-200 rounded-sm"></div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-16 bg-slate-200 rounded-md"></div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3 w-24 bg-slate-200 rounded-sm"></div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3 w-56 bg-slate-200 rounded-sm"></div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="h-6 w-16 bg-slate-200 rounded-md ml-auto"></div>
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                      <FileSearch className="size-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">
                      Tidak ada catatan audit yang ditemukan
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      {hasActiveFilters
                        ? "Cobalah melonggarkan filter pencarian, aksi, atau rentang tanggal yang digunakan."
                        : "Sistem belum mencatat aktivitas pada parameter kueri ini."}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
                      >
                        <RotateCcw className="size-3.5" />
                        <span>Reset Semua Filter</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actionStyle =
                    ACTION_COLORS[log.action] || {
                      bg: "bg-slate-100",
                      text: "text-slate-700",
                      border: "border-slate-200",
                    };

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/75 transition-colors group"
                    >
                      {/* Waktu */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11px]">
                            {formatWibDate(log.createdAt)}
                          </span>
                        </div>
                      </td>

                      {/* Pelaku */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-semibold text-[10px]">
                            {log.actor?.name ? log.actor.name.charAt(0).toUpperCase() : "S"}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">
                              {log.actor?.name ?? "Sistem / Akun Dihapus"}
                            </p>
                            {log.actor?.email && (
                              <p className="text-[10px] text-slate-400">{log.actor.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${actionStyle.bg} ${actionStyle.text} ${actionStyle.border}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Entitas */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>
                          <span className="font-semibold text-slate-800">{log.entity}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]"
                              title={log.entityId}
                            >
                              {log.entityId}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(log.entityId, log.id)}
                              className="text-slate-300 hover:text-slate-600 transition-colors"
                              title="Salin Entity ID"
                            >
                              {copiedId === log.id ? (
                                <CheckCircle2 className="size-3 text-emerald-600" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Ringkasan */}
                      <td className="py-3.5 px-4 text-slate-700">
                        <p className="text-xs line-clamp-2 leading-relaxed">
                          {log.summary || `Aksi ${log.action} pada ${log.entity}`}
                        </p>
                      </td>

                      {/* Tombol Detail */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-[#102f50] hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs"
                        >
                          <Eye className="size-3.5" />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server Pagination Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span>
              Menampilkan{" "}
              <span className="font-semibold text-slate-800">
                {logs.length > 0 ? (page - 1) * pageSize + 1 : 0}
              </span>{" "}
              -{" "}
              <span className="font-semibold text-slate-800">
                {Math.min(page * pageSize, pageInfo.totalCount)}
              </span>{" "}
              dari{" "}
              <span className="font-semibold text-slate-800">
                {pageInfo.totalCount.toLocaleString("id-ID")}
              </span>{" "}
              log
            </span>

            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span>Ukuran:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-hidden"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">
              Hal. {pageInfo.page} / {pageInfo.totalPages || 1}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-2xs"
            >
              <ChevronLeft className="size-3.5" />
              <span>Sebelumnya</span>
            </button>

            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageInfo.totalPages || !pageInfo.hasMore || loading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-2xs"
            >
              <span>Berikutnya</span>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal Dialog */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
        >
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/75">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-[#102f50] text-white">
                  <History className="size-4.5" />
                </div>
                <div>
                  <h3 id="audit-detail-title" className="text-sm font-bold text-[#102f50]">
                    Detail Catatan Audit Log
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    ID: {selectedLog.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                aria-label="Tutup modal"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 gap-3.5 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Waktu Transaksi
                  </span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatWibDate(selectedLog.createdAt)}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Pelaku Aksi
                  </span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {selectedLog.actor?.name ?? "Sistem / Akun Dihapus"}
                  </p>
                  {selectedLog.actor?.email && (
                    <p className="text-[10px] text-slate-500">{selectedLog.actor.email}</p>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Aksi & Entitas
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        ACTION_COLORS[selectedLog.action]?.bg || "bg-slate-100"
                      } ${ACTION_COLORS[selectedLog.action]?.text || "text-slate-700"} ${
                        ACTION_COLORS[selectedLog.action]?.border || "border-slate-200"
                      }`}
                    >
                      {selectedLog.action}
                    </span>
                    <span className="font-bold text-slate-800">{selectedLog.entity}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    ID Entitas Terkait
                  </span>
                  <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] text-slate-700">
                    <span className="truncate">{selectedLog.entityId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedLog.entityId, "modal-id")}
                      className="text-slate-400 hover:text-slate-700 transition-colors"
                      title="Salin ID"
                    >
                      {copiedId === "modal-id" ? (
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Ringkasan Aktivitas */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                  Ringkasan Aktivitas
                </label>
                <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-slate-800 font-medium leading-relaxed">
                  {selectedLog.summary}
                </div>
              </div>

              {/* Detail Payload Perubahan */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                  Detail Perubahan (Sanitized Payload)
                </label>
                {selectedLog.details && Object.keys(selectedLog.details).length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-[#1E1E1E] p-4 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed">
                    <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-slate-500 italic">
                    Tidak ada metadata payload tambahan untuk transaksi ini.
                  </div>
                )}
              </div>

              {/* Security and Immutability Notice */}
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-900 text-[11px]">
                <ShieldCheck className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Integritas Audit Terjamin</p>
                  <p className="text-emerald-800 leading-normal">
                    Catatan ini bersifat append-only (hanya-baca). Seluruh informasi sensitif seperti password,
                    token rahasia, sesi, dan alamat penyimpanan internal telah disanitasi secara otomatis di server
                    sebelum dikirim ke browser.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-200 px-6 py-3.5 bg-slate-50/75">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg bg-[#102f50] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c243e] transition-colors shadow-2xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
