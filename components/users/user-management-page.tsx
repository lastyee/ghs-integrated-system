"use client";

import { useEffect, useState } from "react";
import {
  Users,
  UserCheck,
  UserX,
  Search,
  Shield,
  GraduationCap,
  Calendar,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { SoftDeleteAction } from "@/components/common/soft-delete-action";

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
};

type UserStats = {
  totalUsers: number;
  totalStudents: number;
  activatedStudents: number;
  unactivatedStudents: number;
};

export function UserManagementPage({ canDelete }: { canDelete: boolean }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
        <div className="flex flex-col gap-4 border-b border-[#EEEEEE] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1B1B1B]">
              Daftar Akun Pengguna Terdaftar
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Visibilitas akun pengguna dan status koneksi mahasiswa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama, email, NIM..."
                className="h-9 w-48 rounded-md border border-[#EEEEEE] pl-9 pr-3 text-xs outline-none focus:border-[#BF120E] sm:w-60"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-md border border-[#EEEEEE] bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-[#BF120E]"
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
              className="inline-flex size-9 items-center justify-center rounded-md border border-[#EEEEEE] bg-[#F8F8F8] text-slate-600 hover:bg-[#EEEEEE]"
              title="Segarkan data"
            >
              <RefreshCw className="size-3.5" />
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
                          hasLinkedStudent ? (
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
                          canDelete ? (
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
                          ) : null
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
    </div>
  );
}
