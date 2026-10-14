"use client";

import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Lock,
  MapPin,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Shirt,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";

export interface ApiSchedule {
  id: string;
  classId: string;
  subjectId: string;
  instructorId: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  dressCode: string;
  topic: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  class: {
    id: string;
    name: string;
    batch: {
      id: string;
      name: string;
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
  };
  instructor: {
    id: string;
    name: string;
  };
}

export interface ApiClass {
  id: string;
  name: string;
  batch?: { name: string };
}

export interface ApiSubject {
  id: string;
  name: string;
}

export interface ApiInstructor {
  id: string;
  name: string;
}

function getUtcDayName(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.substring(0, 10).split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const days = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    return days[d.getUTCDay()] ?? "HARI";
  } catch {
    return "HARI";
  }
}

function formatUtcTime(timeStr: string): string {
  if (!timeStr) return "-";
  if (timeStr.includes("T")) {
    return timeStr.split("T")[1].substring(0, 5);
  }
  return timeStr.substring(0, 5);
}

export function SchedulesPage({ userRole = "" }: { userRole?: string }) {
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const [schedules, setSchedules] = useState<ApiSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authErrorStatus, setAuthErrorStatus] = useState<401 | 403 | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [date, setDate] = useState("ALL");
  const [batch, setBatch] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [instructor, setInstructor] = useState("ALL");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    totalSchedules: 0,
    ghi07Count: 0,
    ghi08Count: 0,
    scheduledCount: 0,
  });
  const [filterDates, setFilterDates] = useState<string[]>([]);
  const [filterBatches, setFilterBatches] = useState<string[]>([]);
  const [filterSubjects, setFilterSubjects] = useState<string[]>([]);
  const [filterInstructors, setFilterInstructors] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [hasInitializedExpand, setHasInitializedExpand] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [instructorsList, setInstructorsList] = useState<ApiInstructor[]>([]);

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    classId: "",
    subjectId: "",
    instructorId: "",
    date: "",
    startTime: "",
    endTime: "",
    room: "",
    dressCode: "",
    topic: "",
    status: "SCHEDULED",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canMutate = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "ACADEMIC_STAFF";

  const handleReload = () => {
    setLoading(true);
    setError(null);
    setAuthErrorStatus(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      if (query !== debouncedQuery) {
        setDebouncedQuery(query);
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [query, debouncedQuery]);

  useEffect(() => {
    let ignore = false;

    async function loadSchedules() {
      setLoading(true);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        ...(status !== "ALL" ? { status } : {}),
        ...(date !== "ALL" ? { date } : {}),
        ...(batch !== "ALL" ? { batch } : {}),
        ...(subject !== "ALL" ? { subject } : {}),
        ...(instructor !== "ALL" ? { instructor } : {}),
      });

      try {
        const [res, clsRes, subRes, insRes] = await Promise.all([
          fetch(`/api/schedules?${params.toString()}`, { headers: { Accept: "application/json" } }),
          fetch("/api/classes"),
          fetch("/api/subjects"),
          fetch("/api/instructors"),
        ]);

        if (ignore) return;

        if (res.status === 401 || res.status === 403) {
          setAuthErrorStatus(res.status);
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Akses tidak diizinkan untuk melihat jadwal.");
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Gagal memuat jadwal (HTTP ${res.status})`);
          return;
        }

        const json = await res.json();
        const clsJson = clsRes.ok ? await clsRes.json() : { data: [] };
        const subJson = subRes.ok ? await subRes.json() : { data: [] };
        const insJson = insRes.ok ? await insRes.json() : { data: [] };

        if (ignore) return;
        setSchedules(Array.isArray(json.data) ? json.data : []);
        setTotal(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 1);
        setStats(
          json.stats || {
            totalSchedules: 0,
            ghi07Count: 0,
            ghi08Count: 0,
            scheduledCount: 0,
          }
        );
        setFilterDates(["ALL", ...(json.filterOptions?.dates || [])]);
        setFilterBatches(["ALL", ...(json.filterOptions?.batches || [])]);
        setFilterSubjects(["ALL", ...(json.filterOptions?.subjects || [])]);
        setFilterInstructors(["ALL", ...(json.filterOptions?.instructors || [])]);
        setClasses(clsJson.data || []);
        setSubjects(subJson.data || []);
        setInstructorsList(insJson.data || []);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadSchedules();

    return () => {
      ignore = true;
    };
  }, [reloadKey, page, debouncedQuery, status, date, batch, subject, instructor]);

  const options = useMemo(() => {
    return { dates: filterDates, batches: filterBatches, subjects: filterSubjects, instructors: filterInstructors };
  }, [filterDates, filterBatches, filterSubjects, filterInstructors]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, ApiSchedule[]> = {
      "SENIN": [],
      "SELASA": [],
      "RABU": [],
      "KAMIS": [],
      "JUMAT": [],
      "SABTU": [],
      "MINGGU": []
    };

    const sortedFiltered = [...schedules].sort((a, b) => {
      const dateA = a.date.substring(0, 10);
      const dateB = b.date.substring(0, 10);
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return 0;
    });

    for (const item of sortedFiltered) {
      const dayName = getUtcDayName(item.date);
      if (groups[dayName]) {
        groups[dayName].push(item);
      } else {
        groups[dayName] = [item];
      }
    }

    for (const key of Object.keys(groups)) {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    }

    return groups;
  }, [schedules]);

  useEffect(() => {
    if (!loading && schedules.length > 0 && !hasInitializedExpand) {
      const firstDay = Object.keys(groupedByDay)[0];
      if (firstDay) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExpandedDays({ [firstDay]: true });
      }
      setHasInitializedExpand(true);
    }
  }, [loading, schedules.length, groupedByDay, hasInitializedExpand]);

  const resetFilters = () => {
    setQuery("");
    setStatus("ALL");
    setDate("ALL");
    setBatch("ALL");
    setSubject("ALL");
    setInstructor("ALL");
    setPage(1);
  };

  const openCreate = () => {
    setForm({
      classId: classes.length > 0 ? classes[0].id : "",
      subjectId: subjects.length > 0 ? subjects[0].id : "",
      instructorId: instructorsList.length > 0 ? instructorsList[0].id : "",
      date: "",
      startTime: "",
      endTime: "",
      room: "",
      dressCode: "",
      topic: "",
      status: "SCHEDULED",
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(null);
    setModal("create");
  };

  const openEdit = (s: ApiSchedule) => {
    const toLocalTime = (utcIso: string) => {
      if (!utcIso) return "";
      const d = new Date(utcIso);
      return d.toTimeString().substring(0, 5);
    };

    setForm({
      classId: s.classId,
      subjectId: s.subjectId,
      instructorId: s.instructorId,
      date: s.date.substring(0, 10),
      startTime: toLocalTime(s.startTime),
      endTime: toLocalTime(s.endTime),
      room: s.room || "",
      dressCode: s.dressCode || "",
      topic: s.topic || "",
      status: s.status,
    });
    setFormErrors({});
    setSubmitError(null);
    setEditingId(s.id);
    setModal("edit");
  };

  const closeModal = () => {
    if (submitLoading) return;
    setModal(null);
    setEditingId(null);
    setSubmitError(null);
    setFormErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (!form.classId) errs.classId = "Kelas wajib dipilih";
    if (!form.subjectId) errs.subjectId = "Subject wajib dipilih";
    if (!form.instructorId) errs.instructorId = "Instruktur wajib dipilih";
    if (!form.date) errs.date = "Tanggal wajib diisi";
    if (!form.startTime) errs.startTime = "Jam mulai wajib diisi";
    if (!form.endTime) errs.endTime = "Jam selesai wajib diisi";

    if (form.startTime && form.endTime && form.endTime < form.startTime) {
      errs.endTime = "Jam selesai harus setelah jam mulai";
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    try {
      setSubmitLoading(true);
      setSubmitError(null);
      setFormErrors({});

      const url = modal === "create" ? "/api/schedules" : `/api/schedules/${editingId}`;
      const method = modal === "create" ? "POST" : "PATCH";

      // Reconstruct to full ISO with current timezone or dummy date
      const isoStart = new Date(`${form.date}T${form.startTime}:00`).toISOString();
      const isoEnd = new Date(`${form.date}T${form.endTime}:00`).toISOString();

      const payload = {
        classId: form.classId,
        subjectId: form.subjectId,
        instructorId: form.instructorId,
        date: new Date(form.date).toISOString(),
        startTime: isoStart,
        endTime: isoEnd,
        room: form.room.trim() || null,
        dressCode: form.dressCode.trim() || null,
        topic: form.topic.trim() || null,
        ...(modal === "edit" ? { status: form.status } : {}),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resJson.error || `Gagal menyimpan jadwal (Status: ${res.status})`);
      }

      setNotice(modal === "create" ? "Jadwal berhasil ditambahkan." : "Jadwal berhasil diperbarui.");
      closeModal();
      handleReload();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Dashboard / Jadwal</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102f50]">Jadwal Pelatihan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Jadwal sesi training resmi Global Hospitality School (Database Aktif)
          </p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition"
          >
            <Plus className="size-4" />
            Tambah Jadwal
          </button>
        )}
      </div>

      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-bold text-emerald-700 underline ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Statistik jadwal">
        <StatCard
          label="Total Jadwal"
          value={String(stats.totalSchedules)}
          description="Sesi resmi terdaftar"
          icon={CalendarDays}
          tone="navy"
        />
        <StatCard
          label="Batch GHI-07"
          value={String(stats.ghi07Count)}
          description="Sesi training GHI-07"
          icon={Users}
          tone="red"
        />
        <StatCard
          label="Batch GHI-08"
          value={String(stats.ghi08Count)}
          description="Sesi training GHI-08"
          icon={Users}
          tone="yellow"
        />
        <StatCard
          label="Status Scheduled"
          value={String(stats.scheduledCount)}
          description="Jadwal aktif mendatang"
          icon={Clock}
          tone="blue"
        />
      </section>

      {/* Filter Bar */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] xl:items-end">
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Cari Jadwal</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Subject / instructor / room / batch..."
                className="h-10 w-full min-w-0 rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#102f50] focus:outline-none"
              />
            </span>
          </label>
          <FilterSelect label="Tanggal" value={date} onChange={(v) => { setDate(v); setPage(1); }} options={options.dates} />
          <FilterSelect label="Batch" value={batch} onChange={(v) => { setBatch(v); setPage(1); }} options={options.batches} />
          <FilterSelect label="Subject" value={subject} onChange={(v) => { setSubject(v); setPage(1); }} options={options.subjects} />
          <FilterSelect label="Instructor" value={instructor} onChange={(v) => { setInstructor(v); setPage(1); }} options={options.instructors} />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={["ALL", "SCHEDULED", "COMPLETED", "CANCELLED"]}
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="size-4" />
            Reset
          </button>
        </div>
      </section>

      {/* Main Content Area: States */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-[#102f50]">Daftar Jadwal</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading
              ? "Memuat data dari database..."
              : `Menampilkan ${schedules.length} dari ${total} jadwal terdaftar`}
          </p>
        </div>

        {/* 1. Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <Loader2 className="size-8 animate-spin text-[#102f50]" />
            <p className="mt-3 text-sm font-medium text-slate-700">Memuat jadwal resmi...</p>
            <p className="mt-1 text-xs text-slate-500">Mengambil data dari server</p>
          </div>
        )}

        {/* 2. Unauthorized State */}
        {!loading && authErrorStatus !== null && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-amber-100 p-3 text-amber-700">
              <Lock className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">
              {authErrorStatus === 401 ? "Login Diperlukan" : "Akses Ditolak"}
            </h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {error ||
                (authErrorStatus === 401
                  ? "Sesi Anda berakhir. Silakan login kembali."
                  : "Anda tidak memiliki izin untuk melihat jadwal pelatihan ini.")}
            </p>
            {authErrorStatus === 401 && (
              <Link
                href="/login"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
              >
                Login Ulang
              </Link>
            )}
          </div>
        )}

        {/* 3. API Error State */}
        {!loading && authErrorStatus === null && error && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-red-100 p-3 text-red-600">
              <AlertCircle className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Gagal Memuat Jadwal</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={handleReload}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-xs font-semibold text-white hover:bg-[#b03636]"
            >
              <RotateCcw className="size-3.5" />
              Coba Lagi
            </button>
          </div>
        )}

        {/* 4. Empty State */}
        {!loading && !error && schedules.length === 0 && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-slate-100 p-3 text-slate-400">
              <Filter className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Tidak Ada Jadwal</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Tidak ada jadwal yang sesuai dengan filter pencarian saat ini.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Filter
            </button>
          </div>
        )}

        {/* 5. Successful Data */}
        {!loading && !error && schedules.length > 0 && (
          <div className="flex flex-col gap-4">
            {Object.entries(groupedByDay).map(([dayName, items]) => {
              const isExpanded = !!expandedDays[dayName];

              return (
                <div key={dayName} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div
                    className="flex cursor-pointer items-center justify-between bg-slate-50/80 px-5 py-4 transition-colors hover:bg-slate-100"
                    onClick={() => setExpandedDays(prev => ({ ...prev, [dayName]: !prev[dayName] }))}
                  >
                    <div>
                      <p className="font-bold uppercase tracking-wide text-[#123b63]">{dayName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        {items.length} sesi
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="size-5 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      {Object.entries(
                        items.reduce((acc, curr) => {
                          const d = curr.date.substring(0, 10);
                          if (!acc[d]) acc[d] = [];
                          acc[d].push(curr);
                          return acc;
                        }, {} as Record<string, typeof items>)
                      ).map(([dateStr, schedulesOnDate]) => {
                        const dateFormatted = new Date(dateStr).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric"
                        });
                        return (
                          <div key={dateStr} className="border-b border-slate-100 last:border-b-0">
                            <div className="px-5 pb-2 pt-4">
                              <p className="text-sm font-semibold text-[#102f50]">{dateFormatted}</p>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {schedulesOnDate.map((item) => (
                                <ScheduleCard
                                  key={item.id}
                                  item={item}
                                  openMenu={openMenu}
                                  setOpenMenu={setOpenMenu}
                                  canMutate={canMutate}
                                  canDelete={canDelete}
                                  onEdit={() => openEdit(item)}
                                  onDeleted={handleReload}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
            <span className="text-sm text-slate-500">
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-[#102f50]">
                {modal === "create" ? "Tambah Jadwal" : "Edit Jadwal"}
              </h2>
              <button type="button" onClick={closeModal} disabled={submitLoading} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            {submitError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {submitError}
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Kelas *</label>
                <select
                  value={form.classId}
                  onChange={(e) => setForm({ ...form, classId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${formErrors.classId ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                >
                  <option value="">Pilih Kelas</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {formErrors.classId && <p className="mt-1 text-xs text-red-600">{formErrors.classId}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Mata Pelajaran *</label>
                <select
                  value={form.subjectId}
                  onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${formErrors.subjectId ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                >
                  <option value="">Pilih Mata Pelajaran</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {formErrors.subjectId && <p className="mt-1 text-xs text-red-600">{formErrors.subjectId}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Instruktur *</label>
                <select
                  value={form.instructorId}
                  onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${formErrors.instructorId ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                >
                  <option value="">Pilih Instruktur</option>
                  {instructorsList.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                {formErrors.instructorId && <p className="mt-1 text-xs text-red-600">{formErrors.instructorId}</p>}
              </div>

              <div className="sm:col-span-2 grid gap-4 grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Tanggal *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    disabled={submitLoading}
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${formErrors.date ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                  />
                  {formErrors.date && <p className="mt-1 text-xs text-red-600">{formErrors.date}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Jam Mulai *</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    disabled={submitLoading}
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${formErrors.startTime ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                  />
                  {formErrors.startTime && <p className="mt-1 text-xs text-red-600">{formErrors.startTime}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Jam Selesai *</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    disabled={submitLoading}
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${formErrors.endTime ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"}`}
                  />
                  {formErrors.endTime && <p className="mt-1 text-xs text-red-600">{formErrors.endTime}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Ruangan</label>
                <select
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  disabled={submitLoading}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
                >
                  <option value="" disabled>Pilih Ruangan</option>
                  <option value="RUANG KELAS">RUANG KELAS</option>
                  <option value="OUTDOOR">OUTDOOR</option>
                  {form.room && !["RUANG KELAS", "OUTDOOR"].includes(form.room) && (
                    <option value={form.room}>{form.room} (Existing)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Seragam / Dress Code</label>
                <select
                  value={form.dressCode}
                  onChange={(e) => setForm({ ...form, dressCode: e.target.value })}
                  disabled={submitLoading}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
                >
                  <option value="" disabled>Pilih Seragam</option>
                  <option value="FORMAL PAKAI JAS">FORMAL PAKAI JAS</option>
                  <option value="FORMAL TANPA JAS">FORMAL TANPA JAS</option>
                  <option value="POLO">POLO</option>
                  {form.dressCode && !["FORMAL PAKAI JAS", "FORMAL TANPA JAS", "POLO"].includes(form.dressCode) && (
                    <option value={form.dressCode}>{form.dressCode} (Existing)</option>
                  )}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Topik / Catatan</label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Topik pembelajaran atau catatan khusus"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
                />
              </div>

              {modal === "edit" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    disabled={submitLoading}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
                  >
                    <option value="SCHEDULED">SCHEDULED</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={closeModal} disabled={submitLoading} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Batal
              </button>
              <button type="submit" disabled={submitLoading} className="inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition disabled:opacity-50">
                {submitLoading && <Loader2 className="size-4 animate-spin" />}
                {modal === "create" ? "Simpan Jadwal" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
      >
        <option value="ALL">Semua {label}</option>
        {options
          .filter((opt) => opt !== "ALL")
          .map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
      </select>
    </label>
  );
}

function ScheduleCard({
  item,
  openMenu,
  setOpenMenu,
  canMutate,
  canDelete,
  onEdit,
  onDeleted,
}: {
  item: ApiSchedule;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  canMutate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const startTime = formatUtcTime(item.startTime);
  const endTime = formatUtcTime(item.endTime);
  const batchName = item.class?.batch?.name || "-";
  const subjectName = item.subject?.name || "-";
  const instructorName = item.instructor?.name || "-";

  return (
    <div className="grid gap-3 px-5 py-4 transition hover:bg-slate-50/50 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center">
      {/* Time column */}
      <div className="flex items-center gap-1.5 text-sm font-bold text-[#102f50]">
        <Clock className="size-4 text-slate-400" />
        <span>
          {startTime} - {endTime}
        </span>
      </div>

      {/* Main Details column */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-[#102f50]">{subjectName}</p>
          {item.topic && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-800">
              <Tag className="size-3" />
              {item.topic}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 font-semibold text-[#123b63]">
            <Users className="size-3.5 text-slate-400" />
            {batchName}
          </span>
          <span className="inline-flex items-center gap-1">
            <User className="size-3.5 text-slate-400" />
            {instructorName}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5 text-slate-400" />
            {item.room}
          </span>
          <span className="inline-flex items-center gap-1">
            <Shirt className="size-3.5 text-slate-400" />
            {item.dressCode}
          </span>
        </div>
      </div>

      {/* Actions and Status */}
      <div className="flex items-center gap-3">
        <StatusBadge status={item.status} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === item.id ? null : item.id)}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label={`Opsi untuk jadwal ${item.id}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {openMenu === item.id && (
            <div className="absolute right-0 top-10 z-10 w-36 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg">
              <Link
                href={`/schedules/${item.id}`}
                className="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
              >
                Lihat Detail
              </Link>
              {canMutate && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onEdit();
                  }}
                  className="block w-full text-left rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  Edit Jadwal
                </button>
              )}
              {canDelete && (
                <SoftDeleteAction
                  endpoint={`/api/schedules/${item.id}`}
                  recordName="Jadwal"
                  identifier={`${subjectName} / ${batchName} / ${item.date}`}
                  description="Jadwal akan disembunyikan dari data aktif. Catatan kehadiran dan riwayat pembelajaran tetap tersimpan."
                  onDeleted={onDeleted}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ApiSchedule["status"] }) {
  const classes =
    status === "SCHEDULED"
      ? "bg-[#e8f2f8] text-[#357092] border border-[#bed8e8]"
      : status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : "bg-[#fbeaea] text-[#c94242] border border-red-200";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classes}`}>
      {status}
    </span>
  );
}
