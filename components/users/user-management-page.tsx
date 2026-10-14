"use client";

import { useEffect, useState } from "react";
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Search,
  Shield,
  GraduationCap,
  Calendar,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
} from "lucide-react";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";
import { useToast } from "@/components/common/toast-provider";

type UserItem = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  role: {
    id: string;
    name: string;
  };
  student: {
    id: string;
    nim: string;
    name: string;
  } | null;
  isInactiveStudent?: boolean;
};

type UserStats = {
  totalUsers: number;
  totalStudents: number;
  activatedStudents: number;
  unactivatedStudents: number;
};

export function UserManagementPage({
  canDelete,
  currentUserRole: initialRole,
}: {
  canDelete: boolean;
  currentUserRole?: string;
}) {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(initialRole || null);

  const effectiveRole = currentUserRole || initialRole || "ADMIN";

  // Create user modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState(effectiveRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createPassword.length < 6) {
      setCreateError("Password minimal 6 karakter.");
      return;
    }
    setCreateLoading(true);
    setCreateError("");

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          role: createRole,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat akun pengguna.");
      }

      setCreateModalOpen(false);
      showToast("success", `Akun pengguna ${createName} (${createRole}) berhasil dibuat.`);
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setRefreshTrigger((t) => t + 1);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Activation modal
  const [actModalOpen, setActModalOpen] = useState(false);
  const [actStudent, setActStudent] = useState<UserItem | null>(null);
  const [actEmail, setActEmail] = useState("");
  const [actPassword, setActPassword] = useState("");
  const [actLoading, setActLoading] = useState(false);
  const [actError, setActError] = useState("");

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actStudent || !actStudent.student) return;
    if (actPassword.length < 6) {
      setActError("Password minimal 6 karakter.");
      return;
    }
    setActLoading(true);
    setActError("");

    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nim: actStudent.student.nim,
          name: actStudent.student.name,
          email: actEmail,
          password: actPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengaktifkan akun.");
      }
      const studentName = actStudent.student.name;
      setActModalOpen(false);
      showToast("success", `Akun mahasiswa ${studentName} berhasil diaktifkan.`);
      setRefreshTrigger((t) => t + 1);
    } catch (err: unknown) {
      setActError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setActLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    fetch("/api/users")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Gagal memuat data pengguna.");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setUsers(data.users || []);
          setStats(data.stats || null);
          setCurrentUserId(data.currentUserId || null);
          if (data.currentUserRole) {
            setCurrentUserRole(data.currentUserRole);
          }
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat daftar pengguna.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.student?.nim || "").includes(searchTerm);

    const matchesRole = roleFilter === "ALL" || u.role.name === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-[#EEEEEE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Total Akun Pengguna
              </span>
              <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                <Users className="size-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#1B1B1B]">
              {stats.totalUsers}
            </p>
            <p className="mt-1 text-xs text-slate-500">Seluruh hak akses sistem</p>
          </div>

          <div className="rounded-lg border border-[#EEEEEE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Akun Mahasiswa Aktif
              </span>
              <span className="flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                <UserCheck className="size-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {stats.activatedStudents}{" "}
              <span className="text-xs font-medium text-slate-500">
                / {stats.totalStudents} Mahasiswa
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Sudah mengaktifkan akun login</p>
          </div>

          <div className="rounded-lg border border-[#EEEEEE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Mahasiswa Belum Aktivasi
              </span>
              <span className="flex size-8 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                <UserX className="size-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-700">
              {stats.unactivatedStudents}
            </p>
            <p className="mt-1 text-xs text-slate-500">Terdaftar di GHS, belum memiliki akun</p>
          </div>
        </div>
      )}

      {/* Table & Filter Card */}
      <div className="rounded-lg border border-[#EEEEEE] bg-white shadow-xs">
        <div className="flex flex-col gap-4 border-b border-[#EEEEEE] p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-[#1B1B1B]">
              Daftar Akun Pengguna Terdaftar
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Visibilitas akun pengguna dan status koneksi mahasiswa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama, email, NIM..."
                className="h-10 w-full min-w-0 rounded-md border border-[#EEEEEE] pl-9 pr-3 text-xs outline-none focus:border-[#BF120E] sm:w-60"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-[#EEEEEE] bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-[#BF120E] sm:flex-none"
            >
              <option value="ALL">Semua Peran</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="ADMIN">ADMIN</option>
              <option value="STUDENT">STUDENT</option>
              <option value="INSTRUCTOR">INSTRUCTOR</option>
              <option value="ACADEMIC_STAFF">ACADEMIC_STAFF</option>
              <option value="PLACEMENT_STAFF">PLACEMENT_STAFF</option>
              <option value="MANAGEMENT">MANAGEMENT</option>
            </select>

            <button
              onClick={() => {
                setLoading(true);
                setError(null);
                setRefreshTrigger((t) => t + 1);
              }}
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[#EEEEEE] bg-[#F8F8F8] text-slate-600 hover:bg-[#EEEEEE] sm:w-10 sm:flex-none"
              title="Segarkan data"
            >
              <RefreshCw className="size-4" />
            </button>

            <button
              onClick={() => {
                setCreateName("");
                setCreateEmail("");
                setCreatePassword("");
                setCreateRole(effectiveRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN");
                setCreateError("");
                setCreateModalOpen(true);
              }}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-[#BF120E] px-3.5 text-xs font-semibold text-white transition hover:bg-[#a00f0c] sm:w-auto sm:flex-none"
            >
              <UserPlus className="size-4" />
              Tambah Pengguna
            </button>
          </div>
        </div>

        {error && (
          <div className="m-5 flex items-start gap-2.5 rounded-md border border-[#BF120E]/30 bg-red-50 p-3.5 text-xs text-[#BF120E]">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <div className="mx-auto mb-2 size-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#BF120E]" />
            Memuat data pengguna...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Tidak ada pengguna yang cocok dengan kriteria pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F8F8] text-slate-600 border-b border-[#EEEEEE]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Nama & Email</th>
                  <th className="px-5 py-3 font-semibold">Peran (Role)</th>
                  <th className="px-5 py-3 font-semibold">Mahasiswa Terkait</th>
                  <th className="px-5 py-3 font-semibold">Status Akun</th>
                  <th className="px-5 py-3 font-semibold">Terdaftar Sejak</th>
                  <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {filteredUsers.map((u) => {
                  const isStudentRole = u.role.name === "STUDENT";
                  const hasLinkedStudent = !!u.student;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[#1B1B1B]">{u.name || "—"}</div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </td>

                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200">
                          <Shield className="size-3 text-[#BF120E]" />
                          {u.role.name}
                        </span>
                      </td>

                      <td className="px-5 py-3">
                        {isStudentRole ? (
                          hasLinkedStudent ? (
                            <div>
                              <span className="inline-flex items-center gap-1 font-medium text-[#1B1B1B]">
                                <GraduationCap className="size-3.5 text-[#BF120E]" />
                                {u.student?.name}
                              </span>
                              <span className="block text-[11px] font-mono text-slate-500">
                                NIM: {u.student?.nim}
                              </span>
                            </div>
                          ) : (
                            <span className="text-amber-700 italic text-[11px]">Belum terhubung</span>
                          )
                        ) : (
                          <span className="text-slate-400">— (Staf / Manajemen)</span>
                        )}
                      </td>

                      <td className="px-5 py-3">
                        {isStudentRole ? (
                          u.isInactiveStudent ? (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                              Belum Aktif
                            </span>
                          ) : hasLinkedStudent ? (
                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                              Aktif & Terverifikasi
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                              Belum Terhubung
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                            Staf Resmi
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3 text-slate-500 text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3 text-slate-400" />
                          {new Date(u.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>

                      <td className="px-5 py-3 text-right">
                        {u.id === currentUserId ? (
                          <span className="text-[11px] text-slate-400">
                            Akun yang sedang digunakan
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {u.isInactiveStudent && canDelete ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActStudent(u);
                                  setActEmail("");
                                  setActPassword("");
                                  setActError("");
                                  setActModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md border border-[#BF120E] bg-white px-3 py-1 text-xs font-semibold text-[#BF120E] hover:bg-red-50"
                              >
                                Aktifkan Akun
                              </button>
                            ) : null}
                            {canDelete && !u.isInactiveStudent ? (
                              <SoftDeleteAction
                                endpoint={`/api/users/${u.id}`}
                                recordName="Pengguna"
                                identifier={`${u.name || u.email} / ${u.email}`}
                                description="Akun akan dinonaktifkan. Relasi Student/Instructor dan seluruh riwayat tetap tersimpan."
                                onDeleted={() => {
                                  setLoading(true);
                                  setRefreshTrigger((trigger) => trigger + 1);
                                }}
                              />
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actModalOpen && actStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={handleActivate} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3">
              <h3 className="text-sm font-bold text-[#1B1B1B]">Aktifkan Akun Mahasiswa</h3>
              <button
                type="button"
                onClick={() => setActModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <p className="font-semibold text-[#1B1B1B]">Nama Mahasiswa</p>
                <p className="text-slate-600">{actStudent.student?.name}</p>
              </div>
              <div>
                <p className="font-semibold text-[#1B1B1B]">NIM</p>
                <p className="text-slate-600">{actStudent.student?.nim}</p>
              </div>

              {actError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700">
                  {actError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-[#1B1B1B]">Email Akun *</label>
                <input
                  type="email"
                  value={actEmail}
                  onChange={(e) => setActEmail(e.target.value)}
                  placeholder="nama.mahasiswa@ghs.local"
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 outline-none focus:border-[#BF120E]"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-[#1B1B1B]">Password *</label>
                <input
                  type="password"
                  value={actPassword}
                  onChange={(e) => setActPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 outline-none focus:border-[#BF120E]"
                  required
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActModalOpen(false)}
                className="rounded-md border border-[#EEEEEE] bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actLoading}
                className="inline-flex items-center justify-center rounded-md bg-[#BF120E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a00f0c] disabled:opacity-50"
              >
                {actLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Simpan Akun"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tambah Pengguna Baru */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={handleCreateUser} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="size-4 text-[#BF120E]" />
                <h3 className="text-sm font-bold text-[#1B1B1B]">Tambah Pengguna Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>

            {createError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {createError}
              </div>
            )}

            <div className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#1B1B1B]">Nama Lengkap *</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="misal: Muhamad Rivqi"
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 outline-none focus:border-[#BF120E]"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-[#1B1B1B]">Email Akun *</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="misal: admin@ghs.local"
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 outline-none focus:border-[#BF120E]"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-[#1B1B1B]">Password Awal *</label>
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 outline-none focus:border-[#BF120E]"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="block font-semibold text-[#1B1B1B]">Peran (Role) *</label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#BF120E]"
                  required
                >
                  {effectiveRole === "SUPER_ADMIN" && (
                    <option value="SUPER_ADMIN">SUPER_ADMIN (Hak Akses Penuh Sistem)</option>
                  )}
                  <option value="ADMIN">ADMIN (Administrator)</option>
                  <option value="ACADEMIC_STAFF">ACADEMIC_STAFF (Staf Akademik)</option>
                  <option value="INSTRUCTOR">INSTRUCTOR (Instruktur)</option>
                  <option value="PLACEMENT_STAFF">PLACEMENT_STAFF (Staf Penempatan Kerja)</option>
                  <option value="MANAGEMENT">MANAGEMENT (Pimpinan / Manajemen)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-md border border-[#EEEEEE] bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className="inline-flex items-center justify-center rounded-md bg-[#BF120E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a00f0c] disabled:opacity-50"
              >
                {createLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Buat Pengguna"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
