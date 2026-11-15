"use client";

import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  Lock,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shirt,
  SlidersHorizontal,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";

export interface ApiSchedule {
  id: string;
  classId: string;
  subjectId: string;
  instructorId: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  dressCode: string | null;
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
      startDate?: string;
      endDate?: string | null;
      program?: {
        id: string;
        name: string;
        code: string;
      };
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
  };
  instructor: {
    id: string;
    name: string;
  };
  attendances?: Array<{
    id: string;
    status: "PRESENT" | "LATE" | "ABSENT";
    absenceType?: "SICK" | "PERMITTED" | "UNEXCUSED" | null;
    lateMinutes?: number | null;
    notes?: string | null;
  }>;
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

export interface CourseGroup {
  key: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  subjectDescription?: string | null;
  className: string;
  batchId: string;
  batchName: string;
  programName?: string;
  instructorName: string;
  schedulePattern: string;
  firstSessionId: string;
  sessions: ApiSchedule[];
  totalSessions: number;
  attendedSessions: number;
  sickCount: number;
  permittedCount: number;
  unexcusedCount: number;
}

function getUtcDayName(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.substring(0, 10).split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    return days[d.getUTCDay()] ?? "Hari";
  } catch {
    return "Hari";
  }
}

function formatUtcDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.substring(0, 10).split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];
    return `${days[d.getUTCDay()]}, ${day} ${months[month - 1]} ${year}`;
  } catch {
    return dateStr.substring(0, 10);
  }
}

function formatUtcTime(timeStr: string): string {
  if (!timeStr) return "-";
  if (timeStr.includes("T")) {
    return timeStr.split("T")[1].substring(0, 5);
  }
  return timeStr.substring(0, 5);
}

function getSchedulePattern(sessions: ApiSchedule[]): string {
  if (sessions.length === 0) return "Belum ada sesi terjadwal";

  const patterns = new Map<string, Set<string>>();
  for (const s of sessions) {
    const day = getUtcDayName(s.date);
    const time = `${formatUtcTime(s.startTime)} - ${formatUtcTime(s.endTime)}`;
    if (!patterns.has(day)) {
      patterns.set(day, new Set());
    }
    patterns.get(day)!.add(time);
  }

  const parts: string[] = [];
  for (const [day, times] of patterns.entries()) {
    parts.push(`${day}, ${Array.from(times).join(", ")}`);
  }
  return parts.slice(0, 2).join(" & ");
}

export function SchedulesPage({ userRole = "" }: { userRole?: string }) {
  const isStudent = userRole === "STUDENT";
  const canMutate = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "ACADEMIC_STAFF";
  const canDelete = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [schedules, setSchedules] = useState<ApiSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authErrorStatus, setAuthErrorStatus] = useState<401 | 403 | null>(null);

  // View mode for staff/admin: "course" (EdLink Course Cards) or "timeline" (Linimasa Hari)
  const [viewMode, setViewMode] = useState<"course" | "timeline">(isStudent ? "course" : "course");

  // Filters
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
  const [filterBatchDetails, setFilterBatchDetails] = useState<
    Array<{ id: string; name: string; programName?: string }>
  >([]);
  const [filterSubjects, setFilterSubjects] = useState<string[]>([]);
  const [filterInstructors, setFilterInstructors] = useState<string[]>([]);

  // Filter UI states
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (date !== "ALL") count++;
    if (subject !== "ALL") count++;
    if (instructor !== "ALL") count++;
    if (status !== "ALL") count++;
    return count;
  }, [date, subject, instructor, status]);

  const hasActiveFilter = useMemo(() => {
    return (
      query.trim() !== "" ||
      batch !== "ALL" ||
      date !== "ALL" ||
      subject !== "ALL" ||
      instructor !== "ALL" ||
      status !== "ALL"
    );
  }, [query, batch, date, subject, instructor, status]);

  // Accordion / Expanded state
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Form states for Super Admin
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

  const handleReload = (isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
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
    }, 400);
    return () => clearTimeout(handler);
  }, [query, debouncedQuery]);

  useEffect(() => {
    let ignore = false;

    async function loadSchedules() {
      // If student or viewing course cards, fetch up to 100 to display all courses & sessions in period
      const effectiveLimit = isStudent || viewMode === "course" ? "100" : "20";

      const params = new URLSearchParams({
        page: page.toString(),
        limit: effectiveLimit,
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        ...(status !== "ALL" ? { status } : {}),
        ...(date !== "ALL" ? { date } : {}),
        ...(batch !== "ALL" ? { batch } : {}),
        ...(subject !== "ALL" ? { subject } : {}),
        ...(instructor !== "ALL" ? { instructor } : {}),
      });

      try {
        const fetchPromises: Promise<Response>[] = [
          fetch(`/api/schedules?${params.toString()}`, { headers: { Accept: "application/json" } }),
        ];

        // Fetch auxiliary options only when mutating is permitted
        if (canMutate) {
          fetchPromises.push(fetch("/api/classes"));
          fetchPromises.push(fetch("/api/subjects"));
          fetchPromises.push(fetch("/api/instructors"));
        }

        const [res, clsRes, subRes, insRes] = await Promise.all(fetchPromises);

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
        const clsJson = clsRes && clsRes.ok ? await clsRes.json() : { data: [] };
        const subJson = subRes && subRes.ok ? await subRes.json() : { data: [] };
        const insJson = insRes && insRes.ok ? await insRes.json() : { data: [] };

        if (ignore) return;
        const loadedSchedules: ApiSchedule[] = Array.isArray(json.data) ? json.data : [];
        setSchedules(loadedSchedules);
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

        const availableBatches: string[] = json.filterOptions?.batches || [];
        setFilterDates(["ALL", ...(json.filterOptions?.dates || [])]);
        setFilterBatches(["ALL", ...availableBatches]);
        setFilterBatchDetails(json.filterOptions?.batchDetails || []);
        setFilterSubjects(["ALL", ...(json.filterOptions?.subjects || [])]);
        setFilterInstructors(["ALL", ...(json.filterOptions?.instructors || [])]);

        if (canMutate) {
          setClasses(clsJson.data || []);
          setSubjects(subJson.data || []);
          setInstructorsList(insJson.data || []);
        }

        // Auto-select student's active batch if currently "ALL" and batches exist
        if (isStudent && batch === "ALL" && availableBatches.length > 0) {
          setBatch(availableBatches[0]);
        }
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
      } finally {
        if (!ignore) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadSchedules();

    return () => {
      ignore = true;
    };
  }, [reloadKey, page, debouncedQuery, status, date, batch, subject, instructor, isStudent, viewMode, canMutate]);

  // Group schedules into Courses
  const courseGroups = useMemo(() => {
    const groupsMap = new Map<string, CourseGroup>();

    for (const item of schedules) {
      const key = `${item.classId}_${item.subjectId}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          classId: item.classId,
          subjectId: item.subjectId,
          subjectName: item.subject?.name || "Mata Kuliah",
          subjectCode: item.subject?.code || "",
          subjectDescription: item.subject?.description,
          className: item.class?.name || "Kelas",
          batchId: item.class?.batch?.id || "",
          batchName: item.class?.batch?.name || "Periode",
          programName: item.class?.batch?.program?.name,
          instructorName: item.instructor?.name || "-",
          schedulePattern: "",
          firstSessionId: item.id,
          sessions: [],
          totalSessions: 0,
          attendedSessions: 0,
          sickCount: 0,
          permittedCount: 0,
          unexcusedCount: 0,
        });
      }

      const group = groupsMap.get(key)!;
      group.sessions.push(item);
    }

    // Process each course group
    const list = Array.from(groupsMap.values());
    for (const group of list) {
      // Sort sessions: newest created schedule first
      group.sessions.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });

      if (group.sessions.length > 0) {
        group.firstSessionId = group.sessions[0].id;
      }

      group.schedulePattern = getSchedulePattern(group.sessions);
      group.totalSessions = group.sessions.length;

      let attended = 0;
      let sick = 0;
      let permitted = 0;
      let unexcused = 0;

      for (const s of group.sessions) {
        if (s.attendances && s.attendances.length > 0) {
          const att = s.attendances[0];
          if (att.status === "PRESENT" || att.status === "LATE") {
            attended++;
          } else if (att.status === "ABSENT") {
            if (att.absenceType === "SICK") sick++;
            else if (att.absenceType === "PERMITTED") permitted++;
            else unexcused++;
          }
        }
      }

      group.attendedSessions = attended;
      group.sickCount = sick;
      group.permittedCount = permitted;
      group.unexcusedCount = unexcused;
    }

    // Sort courses by newest schedule creation time (createdAt descending)
    list.sort((a, b) => {
      const timeA = Math.max(...a.sessions.map((s) => new Date(s.createdAt).getTime()));
      const timeB = Math.max(...b.sessions.map((s) => new Date(s.createdAt).getTime()));
      if (timeB !== timeA) return timeB - timeA;
      return b.key.localeCompare(a.key);
    });
    return list;
  }, [schedules]);

  // Group schedules by day for "timeline" mode
  const groupedByDay = useMemo(() => {
    const sortedFiltered = [...schedules].sort((a, b) => {
      const dateA = a.date.substring(0, 10);
      const dateB = b.date.substring(0, 10);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return a.startTime.localeCompare(b.startTime);
    });

    const groups: Record<string, ApiSchedule[]> = {};
    for (const item of sortedFiltered) {
      const dayName = getUtcDayName(item.date).toUpperCase();
      if (!groups[dayName]) {
        groups[dayName] = [];
      }
      groups[dayName].push(item);
    }

    return groups;
  }, [schedules]);

  const toggleCourseExpand = (key: string) => {
    setExpandedCourses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetFilters = () => {
    setQuery("");
    setStatus("ALL");
    setDate("ALL");
    setBatch("ALL");
    setSubject("ALL");
    setInstructor("ALL");
    setPage(1);
  };

  // Super Admin CRUD Handlers
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
    setForm({
      classId: s.classId,
      subjectId: s.subjectId,
      instructorId: s.instructorId,
      date: s.date.substring(0, 10),
      startTime: formatUtcTime(s.startTime),
      endTime: formatUtcTime(s.endTime),
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

      const cleanDate = form.date.substring(0, 10);
      const formatIsoTime = (timeStr: string) => {
        const parts = timeStr.trim().split(":");
        const hh = (parts[0] || "00").padStart(2, "0");
        const mm = (parts[1] || "00").padStart(2, "0");
        return `${hh}:${mm}:00.000Z`;
      };

      const payload = {
        classId: form.classId,
        subjectId: form.subjectId,
        instructorId: form.instructorId,
        date: `${cleanDate}T00:00:00.000Z`,
        startTime: `${cleanDate}T${formatIsoTime(form.startTime)}`,
        endTime: `${cleanDate}T${formatIsoTime(form.endTime)}`,
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
      {/* ============================================================== */}
      {/* 1. STUDENT VIEW HEADER (EdLink Style)                           */}
      {/* ============================================================== */}
      {isStudent ? (
        <div className="mb-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#102f50]">Kelas</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Mahasiswa Aktif</span>
            </div>
          </div>

          {/* Academic & General Tabs */}
          <div className="mt-3 flex items-center justify-between border-b border-slate-200">
            <div className="flex gap-8">
              <button
                type="button"
                className="border-b-2 border-emerald-600 pb-2 text-sm font-bold text-emerald-700"
              >
                Akademik
              </button>
              <button
                type="button"
                onClick={() => setBatch("ALL")}
                className="border-b-2 border-transparent pb-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                Semua Periode
              </button>
            </div>
          </div>

          {/* Period Selector & Refresh Presence */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Periode :</span>
              <div className="relative">
                <select
                  value={batch}
                  onChange={(e) => {
                    setBatch(e.target.value);
                    setPage(1);
                  }}
                  className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-sm font-bold text-slate-800 shadow-sm focus:border-emerald-600 focus:outline-none"
                >
                  {filterBatches.map((b) => {
                    const detail = filterBatchDetails.find((d) => d.name === b);
                    const label =
                      b === "ALL"
                        ? "Semua Periode"
                        : detail?.programName
                        ? `${b} · ${detail.programName}`
                        : `Batch ${b}`;
                    return (
                      <option key={b} value={b}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleReload(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Perbarui data kehadiran
            </button>
          </div>
        </div>
      ) : (
        /* ============================================================== */
        /* 2. ADMIN / STAFF VIEW HEADER                                   */
        /* ============================================================== */
        <div className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Dashboard / Jadwal</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#102f50]">Jadwal Pelatihan</h1>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                Kelola dan pantau seluruh jadwal sesi pembelajaran kelas pelatihan GHS · {total} sesi terdaftar
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* View Mode Switcher */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("course")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === "course"
                      ? "bg-white text-[#102f50] font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <BookOpen className="size-3.5" />
                  <span>Mata Kuliah</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === "timeline"
                      ? "bg-white text-[#102f50] font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <CalendarDays className="size-3.5" />
                  <span>Linimasa</span>
                </button>
              </div>

              {canMutate && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#c94242] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#a83232] transition"
                >
                  <Plus className="size-4" />
                  <span>Tambah Jadwal</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Admin Compact Statistics */}
      {!isStudent && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-xs">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[#102f50]">
              <CalendarDays className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">Total Sesi</p>
              <p className="text-sm sm:text-base font-bold text-[#102f50]">{stats.totalSchedules}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-xs">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[#102f50]">
              <Users className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">Batch GHI-07</p>
              <p className="text-sm sm:text-base font-bold text-[#102f50]">{stats.ghi07Count}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-xs">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[#102f50]">
              <Users className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">Batch GHI-08</p>
              <p className="text-sm sm:text-base font-bold text-[#102f50]">{stats.ghi08Count}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-xs">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <Clock className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">Terjadwal</p>
              <p className="text-sm sm:text-base font-bold text-[#102f50]">{stats.scheduledCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Admin Filters & Search Toolbar */}
      {!isStudent && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          {/* Main Controls Row: Searchable Batch Dropdown + Main Search Input + Advanced Filter Toggle */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            {/* 1. Searchable Batch Dropdown */}
            <SearchableBatchDropdown
              batches={filterBatches}
              batchDetails={filterBatchDetails}
              selectedBatch={batch}
              onSelect={(b) => {
                setBatch(b);
                setPage(1);
              }}
            />

            {/* 2. Main Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari mata kuliah, instruktur, topik, ruangan..."
                className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-xs sm:text-sm placeholder:text-slate-400 focus:border-[#102f50] focus:outline-none focus:ring-1 focus:ring-[#102f50]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="Hapus pencarian"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* 3. Advanced Filters Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition shrink-0 ${
                showAdvancedFilters || activeAdvancedCount > 0
                  ? "border-[#102f50] bg-slate-50 text-[#102f50] font-bold"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Filter Lanjutan</span>
              {activeAdvancedCount > 0 && (
                <span className="flex size-4 items-center justify-center rounded-full bg-[#102f50] text-[10px] font-bold text-white">
                  {activeAdvancedCount}
                </span>
              )}
              <ChevronDown
                className={`size-3.5 text-slate-400 transition-transform duration-200 ${
                  showAdvancedFilters ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Quick Reset button directly accessible if filters active */}
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 text-xs font-semibold text-[#c94242] hover:bg-red-100/70 transition shrink-0"
                title="Reset semua filter"
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>

          {/* Collapsible Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 transition-all">
              <div className="mb-2.5 flex items-center justify-between border-b border-slate-200/60 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Parameter Filter Tambahan
                </span>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(false)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  Tutup
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <FilterSelect
                  label="Tanggal"
                  value={date}
                  onChange={(v) => {
                    setDate(v);
                    setPage(1);
                  }}
                  options={filterDates}
                />
                <FilterSelect
                  label="Mata Kuliah"
                  value={subject}
                  onChange={(v) => {
                    setSubject(v);
                    setPage(1);
                  }}
                  options={filterSubjects}
                />
                <FilterSelect
                  label="Instruktur"
                  value={instructor}
                  onChange={(v) => {
                    setInstructor(v);
                    setPage(1);
                  }}
                  options={filterInstructors}
                />
                <FilterSelect
                  label="Status Sesi"
                  value={status}
                  onChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                  options={["ALL", "SCHEDULED", "COMPLETED", "CANCELLED"]}
                />
              </div>
            </div>
          )}

          {/* Active Filters Summary Chips */}
          {hasActiveFilter && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="text-[11px] font-medium text-slate-400 mr-1">Filter Aktif:</span>
              {batch !== "ALL" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-0.5 text-slate-700 font-medium">
                  <span>Batch: <strong>{batch}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setBatch("ALL");
                      setPage(1);
                    }}
                    className="rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {date !== "ALL" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-0.5 text-slate-700 font-medium">
                  <span>Tanggal: <strong>{date}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setDate("ALL");
                      setPage(1);
                    }}
                    className="rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {subject !== "ALL" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-0.5 text-slate-700 font-medium">
                  <span>Mata Kuliah: <strong>{subject}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setSubject("ALL");
                      setPage(1);
                    }}
                    className="rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {instructor !== "ALL" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-0.5 text-slate-700 font-medium">
                  <span>Instruktur: <strong>{instructor}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setInstructor("ALL");
                      setPage(1);
                    }}
                    className="rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {status !== "ALL" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-0.5 text-slate-700 font-medium">
                  <span>Status: <strong>{status}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setStatus("ALL");
                      setPage(1);
                    }}
                    className="rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.trim() !== "" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-0.5 text-slate-700 font-medium">
                  <span>Pencarian: <strong>&quot;{query}&quot;</strong></span>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto text-[11px] font-semibold text-[#c94242] hover:underline"
              >
                Reset Semua
              </button>
            </div>
          )}
        </section>
      )}

      {/* Main Content Area */}
      <div>
        {/* 1. Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-16 text-center shadow-sm">
            <Loader2 className="size-8 animate-spin text-[#102f50]" />
            <p className="mt-3 text-sm font-medium text-slate-700">Memuat jadwal mata kuliah...</p>
            <p className="mt-1 text-xs text-slate-500">Mengambil data dari server</p>
          </div>
        )}

        {/* 2. Unauthorized State */}
        {!loading && authErrorStatus !== null && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-16 text-center shadow-sm">
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
                  : "Anda tidak memiliki izin untuk melihat jadwal ini.")}
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-16 text-center shadow-sm">
            <div className="rounded-full bg-red-100 p-3 text-red-600">
              <AlertCircle className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Gagal Memuat Jadwal</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => handleReload()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-xs font-semibold text-white hover:bg-[#b03636]"
            >
              <RotateCcw className="size-3.5" />
              Coba Lagi
            </button>
          </div>
        )}

        {/* 4. Empty State */}
        {!loading && !error && schedules.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-16 text-center shadow-sm">
            <div className="rounded-full bg-slate-100 p-3 text-slate-400">
              <Filter className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Tidak Ada Jadwal Ditemukan</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {batch !== "ALL"
                ? `Tidak ada mata kuliah atau sesi pelatihan terdaftar untuk periode ${batch}.`
                : "Tidak ada jadwal yang sesuai dengan filter pencarian saat ini."}
            </p>
            {batch !== "ALL" && (
              <button
                type="button"
                onClick={() => setBatch("ALL")}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Lihat Semua Periode
              </button>
            )}
          </div>
        )}

        {/* 5. SUCCESS: Render Course Cards (EdLink Pattern) */}
        {!loading && !error && schedules.length > 0 && (viewMode === "course" || isStudent) && (
          <div className="space-y-3.5">
            {courseGroups.map((course) => {
              const isExpanded = !!expandedCourses[course.key];

              return (
                <div
                  key={course.key}
                  className="rounded-xl border border-slate-200/90 bg-white shadow-xs transition hover:border-slate-300"
                >
                  {/* Subject Card Header */}
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Title & Code */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/schedules/${course.firstSessionId}`}
                            className="text-base sm:text-lg font-bold text-[#102f50] hover:text-[#c94242] transition-colors"
                          >
                            {course.subjectName}
                          </Link>
                          {course.subjectCode && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                              {course.subjectCode}
                            </span>
                          )}
                        </div>

                        {/* Structured Metadata Hierarchy */}
                        <div className="mt-2 space-y-1 text-xs text-slate-600">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-semibold text-slate-800">{course.className}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-600">Batch {course.batchName}</span>
                            {course.programName && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-500">{course.programName}</span>
                              </>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-600">
                              Instruktur: <strong className="text-slate-800">{course.instructorName}</strong>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-500">
                            <span>{course.schedulePattern}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-medium text-slate-700">
                              {course.attendedSessions > 0
                                ? `${course.attendedSessions} dari ${course.totalSessions} sesi hadir`
                                : `${course.totalSessions} sesi pelatihan`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action Buttons */}
                      <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleCourseExpand(course.key)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            isExpanded
                              ? "border-[#102f50] bg-slate-100 text-[#102f50] font-bold"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span>{isExpanded ? "Tutup Sesi" : `Lihat Sesi (${course.totalSessions})`}</span>
                          <ChevronDown
                            className={`size-3.5 transition-transform duration-200 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        <Link
                          href={`/schedules/${course.firstSessionId}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#102f50] hover:text-[#102f50] transition"
                          title="Lihat detail lengkap mata kuliah dan sesi"
                        >
                          <span>Detail</span>
                          <ExternalLink className="size-3 text-slate-400" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Session Feed */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Daftar Sesi ({course.sessions.length} Sesi Terjadwal)
                        </h4>
                        <span className="text-[11px] text-slate-400">
                          Urutan: Jadwal terbaru terlebih dahulu
                        </span>
                      </div>

                      {course.sessions.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-500">
                          Belum ada sesi pelatihan terdaftar untuk mata kuliah ini.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {course.sessions.map((session, sIdx) => {
                            const sessionNum = course.sessions.length - sIdx;
                            const formattedDate = formatUtcDate(session.date);
                            const startTime = formatUtcTime(session.startTime);
                            const endTime = formatUtcTime(session.endTime);
                            const att =
                              session.attendances && session.attendances.length > 0
                                ? session.attendances[0]
                                : null;

                            return (
                              <div
                                key={session.id}
                                className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                        Sesi #{sessionNum}
                                      </span>
                                      <h5 className="text-sm font-bold text-[#102f50]">
                                        {session.topic || `Sesi Pembelajaran ke-${sessionNum}`}
                                      </h5>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                      <span className="font-semibold text-slate-700">
                                        {formattedDate}
                                      </span>
                                      <span>·</span>
                                      <span className="font-bold text-slate-800">
                                        {startTime} - {endTime} WIB
                                      </span>
                                      <span>·</span>
                                      <span>Ruang: {session.room || "RUANG KELAS"}</span>
                                      {session.dressCode && (
                                        <>
                                          <span>·</span>
                                          <span>Dress: {session.dressCode}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Badges & Actions */}
                                  <div className="flex items-center gap-2">
                                    {att ? (
                                      <StudentAttendanceBadge
                                        status={att.status}
                                        absenceType={att.absenceType}
                                        lateMinutes={att.lateMinutes}
                                      />
                                    ) : (
                                      <StatusBadge status={session.status} />
                                    )}

                                    {/* Super Admin Quick Actions */}
                                    {canMutate && (
                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenu(openMenu === session.id ? null : session.id);
                                          }}
                                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                        >
                                          <MoreHorizontal className="size-4" />
                                        </button>
                                        {openMenu === session.id && (
                                          <>
                                            <div
                                              className="fixed inset-0 z-20 cursor-default"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenu(null);
                                              }}
                                            />
                                            <div className="absolute right-0 z-30 w-36 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg">
                                              <Link
                                                href={`/schedules/${session.id}`}
                                                className="block rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-50 font-medium"
                                              >
                                                Lihat Detail
                                              </Link>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenMenu(null);
                                                  openEdit(session);
                                                }}
                                                className="block w-full text-left rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-50 font-medium"
                                              >
                                                Edit Jadwal
                                              </button>
                                              {canDelete && (
                                                <SoftDeleteAction
                                                  endpoint={`/api/schedules/${session.id}`}
                                                  recordName="Jadwal"
                                                  identifier={`${session.subject?.name} - Sesi ${sessionNum}`}
                                                  description="Jadwal akan disembunyikan dari data aktif."
                                                  onDeleted={() => {
                                                    setOpenMenu(null);
                                                    handleReload();
                                                  }}
                                                />
                                              )}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 6. ADMIN VIEW: Day Timeline mode */}
        {!loading && !error && schedules.length > 0 && viewMode === "timeline" && !isStudent && (
          <div className="flex flex-col gap-4">
            {Object.entries(groupedByDay).map(([dayName, items]) => {
              const isExpanded = !!expandedDays[dayName];

              return (
                <div key={dayName} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div
                    className={`flex cursor-pointer items-center justify-between bg-slate-50/80 px-5 py-4 transition-colors hover:bg-slate-100 ${
                      isExpanded ? "rounded-t-xl" : "rounded-xl"
                    }`}
                    onClick={() =>
                      setExpandedDays((prev) => ({ ...prev, [dayName]: !prev[dayName] }))
                    }
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
                      )
                        .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                        .map(([dateStr, schedulesOnDate]) => {
                          const dateFormatted = new Date(
                            `${dateStr}T00:00:00.000Z`
                          ).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          });
                          return (
                            <div key={dateStr} className="border-b border-slate-100 last:border-b-0">
                              <div className="px-5 pb-2 pt-4">
                                <p className="text-sm font-semibold text-[#102f50]">
                                  {dateFormatted}
                                </p>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {schedulesOnDate
                                  .slice()
                                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                  .map((item) => (
                                    <ScheduleTimelineCard
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

        {/* Pagination (for admin timeline or paged lists) */}
        {!loading && !error && totalPages > 1 && !isStudent && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
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
      </div>

      {/* Admin Create / Edit Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-[#102f50]">
                {modal === "create" ? "Tambah Jadwal" : "Edit Jadwal"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitLoading}
                className="text-slate-400 hover:text-slate-600"
              >
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
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.classId ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"
                  }`}
                >
                  <option value="">Pilih Kelas</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.batch?.name ? `(${c.batch.name})` : ""}
                    </option>
                  ))}
                </select>
                {formErrors.classId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.classId}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Mata Kuliah *</label>
                <select
                  value={form.subjectId}
                  onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.subjectId ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"
                  }`}
                >
                  <option value="">Pilih Mata Kuliah</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {formErrors.subjectId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.subjectId}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Instruktur *</label>
                <select
                  value={form.instructorId}
                  onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
                  disabled={submitLoading}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                    formErrors.instructorId
                      ? "border-red-500"
                      : "border-slate-200 focus:border-[#102f50]"
                  }`}
                >
                  <option value="">Pilih Instruktur</option>
                  {instructorsList.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                {formErrors.instructorId && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.instructorId}</p>
                )}
              </div>

              <div className="sm:col-span-2 grid gap-4 grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Tanggal *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    disabled={submitLoading}
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                      formErrors.date ? "border-red-500" : "border-slate-200 focus:border-[#102f50]"
                    }`}
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
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                      formErrors.startTime
                        ? "border-red-500"
                        : "border-slate-200 focus:border-[#102f50]"
                    }`}
                  />
                  {formErrors.startTime && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.startTime}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Jam Selesai *</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    disabled={submitLoading}
                    className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm focus:outline-none ${
                      formErrors.endTime
                        ? "border-red-500"
                        : "border-slate-200 focus:border-[#102f50]"
                    }`}
                  />
                  {formErrors.endTime && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.endTime}</p>
                  )}
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
                  <option value="" disabled>
                    Pilih Ruangan
                  </option>
                  <option value="RUANG KELAS">RUANG KELAS</option>
                  <option value="OUTDOOR">OUTDOOR</option>
                  {form.room && !["RUANG KELAS", "OUTDOOR"].includes(form.room) && (
                    <option value={form.room}>{form.room} (Existing)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Seragam / Dress Code
                </label>
                <select
                  value={form.dressCode}
                  onChange={(e) => setForm({ ...form, dressCode: e.target.value })}
                  disabled={submitLoading}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
                >
                  <option value="" disabled>
                    Pilih Seragam
                  </option>
                  <option value="FORMAL PAKAI JAS">FORMAL PAKAI JAS</option>
                  <option value="FORMAL TANPA JAS">FORMAL TANPA JAS</option>
                  <option value="POLO">POLO</option>
                  {form.dressCode &&
                    !["FORMAL PAKAI JAS", "FORMAL TANPA JAS", "POLO"].includes(form.dressCode) && (
                      <option value={form.dressCode}>{form.dressCode} (Existing)</option>
                    )}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Topik / Materi Sesi</label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Topik pembelajaran atau materi sesi"
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
              <button
                type="button"
                onClick={closeModal}
                disabled={submitLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-[#c94242] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a83232] transition disabled:opacity-50"
              >
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

function SearchableBatchDropdown({
  batches,
  batchDetails,
  selectedBatch,
  onSelect,
}: {
  batches: string[];
  batchDetails: Array<{ id: string; name: string; programName?: string }>;
  selectedBatch: string;
  onSelect: (b: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const actualBatches = useMemo(() => {
    return batches.filter((b) => b !== "ALL");
  }, [batches]);

  const filteredBatches = useMemo(() => {
    if (!search.trim()) return actualBatches;
    const term = search.toLowerCase();
    return actualBatches.filter((b) => {
      const detail = batchDetails.find((d) => d.name === b);
      return (
        b.toLowerCase().includes(term) ||
        (detail?.programName && detail.programName.toLowerCase().includes(term))
      );
    });
  }, [actualBatches, batchDetails, search]);

  const selectedDetail = batchDetails.find((d) => d.name === selectedBatch);
  const selectedLabel =
    selectedBatch === "ALL"
      ? "Semua Batch"
      : selectedDetail?.programName
      ? `Batch ${selectedBatch} · ${selectedDetail.programName}`
      : `Batch ${selectedBatch}`;

  return (
    <div ref={dropdownRef} className="relative w-full sm:w-64 shrink-0">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setSearch("");
        }}
        className={`flex h-10 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-xs font-medium transition ${
          isOpen
            ? "border-[#102f50] ring-1 ring-[#102f50]"
            : selectedBatch !== "ALL"
            ? "border-[#102f50] bg-slate-50/50 text-[#102f50] font-semibold"
            : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Users className="size-4 shrink-0 text-slate-400" />
          <span className="truncate">{selectedLabel}</span>
        </div>
        <ChevronDown
          className={`size-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-full sm:w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {/* Search box inside dropdown */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama batch atau program..."
              autoFocus
              className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs placeholder:text-slate-400 focus:border-[#102f50] focus:bg-white focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 text-xs">
            {/* Option: Semua Batch */}
            <button
              type="button"
              onClick={() => {
                onSelect("ALL");
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition ${
                selectedBatch === "ALL"
                  ? "bg-slate-100 font-bold text-[#102f50]"
                  : "text-slate-700 hover:bg-slate-50 font-medium"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>Semua Batch</span>
                <span className="text-[10px] text-slate-400">({actualBatches.length} batch)</span>
              </div>
              {selectedBatch === "ALL" && <Check className="size-3.5 text-[#102f50]" />}
            </button>

            {/* Filtered Batches */}
            {filteredBatches.map((b) => {
              const isSelected = selectedBatch === b;
              const detail = batchDetails.find((d) => d.name === b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    onSelect(b);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition ${
                    isSelected
                      ? "bg-slate-100 font-bold text-[#102f50]"
                      : "text-slate-700 hover:bg-slate-50 font-medium"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-semibold text-slate-800">Batch {b}</p>
                    {detail?.programName && (
                      <p className="truncate text-[11px] text-slate-500">{detail.programName}</p>
                    )}
                  </div>
                  {isSelected && <Check className="size-3.5 shrink-0 text-[#102f50]" />}
                </button>
              );
            })}

            {filteredBatches.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">
                Tidak ada batch yang cocok dengan &quot;{search}&quot;
              </p>
            )}
          </div>
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

function ScheduleTimelineCard({
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [openUpward, setOpenUpward] = useState(false);

  const startTime = formatUtcTime(item.startTime);
  const endTime = formatUtcTime(item.endTime);
  const batchName = item.class?.batch?.name || "-";
  const subjectName = item.subject?.name || "-";
  const instructorName = item.instructor?.name || "-";

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (openMenu === item.id) {
      setOpenMenu(null);
    } else {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUpward(spaceBelow < 170);
      }
      setOpenMenu(item.id);
    }
  };

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
            {item.room || "RUANG KELAS"}
          </span>
          {item.dressCode && (
            <span className="inline-flex items-center gap-1">
              <Shirt className="size-3.5 text-slate-400" />
              {item.dressCode}
            </span>
          )}
        </div>
      </div>

      {/* Actions and Status */}
      <div className="flex items-center gap-3">
        <StatusBadge status={item.status} />
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            onClick={handleToggle}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label={`Opsi untuk jadwal ${item.id}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {openMenu === item.id && (
            <>
              <div
                className="fixed inset-0 z-20 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(null);
                }}
              />
              <div
                className={`absolute right-0 z-30 w-36 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg ${
                  openUpward ? "bottom-full mb-1" : "top-full mt-1"
                }`}
              >
                <Link
                  href={`/schedules/${item.id}`}
                  onClick={() => setOpenMenu(null)}
                  className="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50 font-medium"
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
                    className="block w-full text-left rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50 font-medium"
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
                    onDeleted={() => {
                      setOpenMenu(null);
                      onDeleted();
                    }}
                  />
                )}
              </div>
            </>
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

function StudentAttendanceBadge({
  status,
  absenceType,
  lateMinutes,
}: {
  status: "PRESENT" | "LATE" | "ABSENT";
  absenceType?: "SICK" | "PERMITTED" | "UNEXCUSED" | null;
  lateMinutes?: number | null;
}) {
  if (status === "PRESENT") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
        <CheckCircle2 className="size-3" />
        HADIR
      </span>
    );
  }

  if (status === "LATE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
        <Clock className="size-3" />
        TERLAMBAT {lateMinutes ? `(${lateMinutes}m)` : ""}
      </span>
    );
  }

  if (status === "ABSENT") {
    if (absenceType === "SICK") {
      return (
        <span className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
          SAKIT
        </span>
      );
    }
    if (absenceType === "PERMITTED") {
      return (
        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
          IZIN
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
        ALPA
      </span>
    );
  }

  return null;
}
