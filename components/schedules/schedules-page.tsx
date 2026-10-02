"use client";

import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
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
  const [unauthorized, setUnauthorized] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [date, setDate] = useState("ALL");
  const [batch, setBatch] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [instructor, setInstructor] = useState("ALL");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let ignore = false;

    async function loadSchedules() {
      try {
        const [res, clsRes, subRes, insRes] = await Promise.all([
          fetch("/api/schedules", { headers: { Accept: "application/json" } }),
          fetch("/api/classes"),
          fetch("/api/subjects"),
          fetch("/api/instructors"),
        ]);

        if (ignore) return;

        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
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
  }, [reloadKey]);

  const options = useMemo(() => {
    const dates = ["ALL", ...new Set(schedules.map((s) => s.date.substring(0, 10)).sort())];
    const batches = ["ALL", ...new Set(schedules.map((s) => s.class?.batch?.name).filter(Boolean).sort())];
    const subjects = ["ALL", ...new Set(schedules.map((s) => s.subject?.name).filter(Boolean).sort())];
    const instructors = ["ALL", ...new Set(schedules.map((s) => s.instructor?.name).filter(Boolean).sort())];
    return { dates, batches, subjects, instructors };
  }, [schedules]);

  const filtered = useMemo(() => {
    return schedules.filter((item) => {
      const q = query.trim().toLowerCase();
      const itemDate = item.date.substring(0, 10);
      const batchName = item.class?.batch?.name || "";
      const subjectName = item.subject?.name || "";
      const instructorName = item.instructor?.name || "";
      const roomName = item.room || "";
      const dressCode = item.dressCode || "";
      const topic = item.topic || "";

      const matchQuery =
        !q ||
        `${subjectName} ${instructorName} ${batchName} ${roomName} ${dressCode} ${topic}`
          .toLowerCase()
          .includes(q);

      const matchStatus = status === "ALL" || item.status === status;
      const matchDate = date === "ALL" || itemDate === date;
      const matchBatch = batch === "ALL" || batchName === batch;
      const matchSubject = subject === "ALL" || subjectName === subject;
      const matchInstructor = instructor === "ALL" || instructorName === instructor;

      return matchQuery && matchStatus && matchDate && matchBatch && matchSubject && matchInstructor;
    });
  }, [batch, date, instructor, query, schedules, status, subject]);

  const grouped = useMemo(() => {
    const groups: Record<string, ApiSchedule[]> = {};
    for (const item of filtered) {
      const itemDate = item.date.substring(0, 10);
      if (!groups[itemDate]) groups[itemDate] = [];
      groups[itemDate].push(item);
    }
    return groups;
  }, [filtered]);

  const totalSchedules = schedules.length;
  const ghi07Count = schedules.filter((s) => s.class?.batch?.name === "GHI-07").length;
  const ghi08Count = schedules.filter((s) => s.class?.batch?.name === "GHI-08").length;
  const scheduledCount = schedules.filter((s) => s.status === "SCHEDULED").length;

  const resetFilters = () => {
    setQuery("");
    setStatus("ALL");
    setDate("ALL");
    setBatch("ALL");
    setSubject("ALL");
    setInstructor("ALL");
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
          value={String(totalSchedules)}
          description="Sesi resmi terdaftar"
          icon={CalendarDays}
          tone="navy"
        />
        <StatCard
          label="Batch GHI-07"
          value={String(ghi07Count)}
          description="Sesi training GHI-07"
          icon={Users}
          tone="red"
        />
        <StatCard
          label="Batch GHI-08"
          value={String(ghi08Count)}
          description="Sesi training GHI-08"
          icon={Users}
          tone="yellow"
        />
        <StatCard
          label="Status Scheduled"
          value={String(scheduledCount)}
          description="Jadwal aktif mendatang"
          icon={Clock}
          tone="blue"
        />
      </section>

      {/* Filter Bar */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_repeat(5,minmax(130px,0.8fr))_auto] xl:items-end">
          <label>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Cari Jadwal</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Subject / instructor / room / batch..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-[#102f50] focus:outline-none"
              />
            </span>
          </label>
          <FilterSelect label="Tanggal" value={date} onChange={setDate} options={options.dates} />
          <FilterSelect label="Batch" value={batch} onChange={setBatch} options={options.batches} />
          <FilterSelect label="Subject" value={subject} onChange={setSubject} options={options.subjects} />
          <FilterSelect label="Instructor" value={instructor} onChange={setInstructor} options={options.instructors} />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={["ALL", "SCHEDULED", "COMPLETED", "CANCELLED"]}
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
              : `${filtered.length} dari ${schedules.length} jadwal terdaftar`}
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
        {!loading && unauthorized && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-amber-100 p-3 text-amber-700">
              <Lock className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Akses Ditolak (Unauthorized)</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {error || "Anda tidak memiliki izin (schedule:read) untuk melihat jadwal pelatihan ini."}
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#102f50] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a4470]"
            >
              Login Ulang
            </Link>
          </div>
        )}

        {/* 3. API Error State */}
        {!loading && !unauthorized && error && (
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
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="rounded-full bg-slate-100 p-3 text-slate-400">
              <Filter className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#102f50]">Tidak Ada Jadwal</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {schedules.length === 0
                ? "Belum ada jadwal yang terdaftar di sistem."
                : "Tidak ada jadwal yang sesuai dengan filter pencarian saat ini."}
            </p>
            {schedules.length > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset Filter
              </button>
            )}
          </div>
        )}

        {/* 5. Successful Data */}
        {!loading && !error && filtered.length > 0 && (
          <div className="divide-y divide-slate-100">
            {Object.entries(grouped).map(([groupDate, items]) => {
              const dayName = getUtcDayName(groupDate);
              return (
                <div key={groupDate}>
                  <div className="flex items-center justify-between bg-slate-50/80 px-5 py-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#123b63]">{dayName}</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#102f50]">{groupDate}</p>
                    </div>
                    <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {items.length} sesi
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((item) => (
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
                <input
                  type="text"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Contoh: Room A"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Seragam / Dress Code</label>
                <input
                  type="text"
                  value={form.dressCode}
                  onChange={(e) => setForm({ ...form, dressCode: e.target.value })}
                  disabled={submitLoading}
                  placeholder="Contoh: Formal / Batik"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[#102f50] focus:outline-none"
                />
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
      <span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#102f50] focus:outline-none"
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
