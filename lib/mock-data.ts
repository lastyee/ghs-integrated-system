import type { LucideIcon } from "lucide-react";
import {
  Award,
  BellRing,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  Users,
  UserRoundPlus,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
};

export type NavigationGroup = {
  label?: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    items: [{ label: "Dashboard", icon: LayoutDashboard, active: true }],
  },
  {
    label: "Akademik",
    items: [
      { label: "Peserta", icon: Users },
      { label: "Program", icon: GraduationCap },
      { label: "Mata Pelajaran", icon: BookOpen },
      { label: "Batch", icon: ClipboardCheck },
      { label: "Enrollment", icon: UserRoundPlus },
      { label: "Kelas", icon: Building2 },
      { label: "Jadwal", icon: CalendarDays },
      { label: "Kehadiran", icon: CheckCircle2 },
      { label: "Penilaian", icon: FileCheck2 },
    ],
  },
  {
    label: "Dokumen & Sertifikat",
    items: [
      { label: "Dokumen", icon: FileText },
      { label: "Sertifikat", icon: Award },
    ],
  },
  {
    label: "Karier & Penempatan",
    items: [
      { label: "Perusahaan", icon: Building2 },
      { label: "Lowongan", icon: BriefcaseBusiness },
      { label: "Lamaran", icon: FileText },
      { label: "Wawancara", icon: CalendarDays },
      { label: "Penempatan", icon: GraduationCap },
    ],
  },
];

export const statCards = [
  {
    label: "Total Pengguna",
    value: "24",
    description: "Pengguna terdaftar",
    icon: Users,
    tone: "navy",
  },
  {
    label: "Peserta Aktif",
    value: "186",
    description: "Peserta dalam program",
    icon: GraduationCap,
    tone: "red",
  },
  {
    label: "Batch Aktif",
    value: "8",
    description: "Batch sedang berjalan",
    icon: BriefcaseBusiness,
    tone: "yellow",
  },
  {
    label: "Aktivitas Sistem",
    value: "32",
    description: "Aktivitas minggu ini",
    icon: BellRing,
    tone: "blue",
  },
] as const;

export const recentActivities = [
  {
    activity: "Admin menambahkan peserta baru",
    user: "Super Admin",
    time: "10 menit lalu",
    status: "Selesai",
    icon: UserRoundPlus,
  },
  {
    activity: "Dokumen peserta diverifikasi",
    user: "Siti Rahma",
    time: "32 menit lalu",
    status: "Terverifikasi",
    icon: FileCheck2,
  },
  {
    activity: "Data kehadiran diperbarui",
    user: "Andi Pratama",
    time: "1 jam lalu",
    status: "Diperbarui",
    icon: CheckCircle2,
  },
  {
    activity: "Batch baru dibuat",
    user: "Super Admin",
    time: "3 jam lalu",
    status: "Selesai",
    icon: ClipboardCheck,
  },
  {
    activity: "Data pengguna diperbarui",
    user: "Super Admin",
    time: "Kemarin",
    status: "Diperbarui",
    icon: Settings2,
  },
] as const;

export const systemOverview = [
  { label: "Peserta Aktif", value: "186", progress: 78, color: "bg-[#123b63]" },
  { label: "Batch Aktif", value: "8", progress: 64, color: "bg-[#c94242]" },
  { label: "Program Aktif", value: "12", progress: 82, color: "bg-[#d6a72b]" },
  {
    label: "Dokumen Menunggu Verifikasi",
    value: "14",
    progress: 36,
    color: "bg-[#6b7d8f]",
  },
] as const;

export const academicSummaryCards = [
  { label: "Program Aktif", value: "4", description: "Data mock program berjalan", icon: GraduationCap, tone: "navy" },
  { label: "Batch Aktif", value: "8", description: "Data mock batch berjalan", icon: ClipboardCheck, tone: "red" },
  { label: "Kelas Aktif", value: "16", description: "Data mock kelas berjalan", icon: Building2, tone: "yellow" },
  { label: "Jadwal Hari Ini", value: "7", description: "Data mock jadwal hari ini", icon: CalendarDays, tone: "blue" },
] as const;

export const academicSchedule = [
  { time: "08:00 - 10:00", subject: "English for Hospitality", batch: "Batch A", instructor: "Instructor A", room: "Room 01", status: "Terjadwal" },
  { time: "10:30 - 12:30", subject: "Food Production", batch: "Batch B", instructor: "Instructor B", room: "Kitchen 01", status: "Terjadwal" },
  { time: "13:30 - 15:30", subject: "Front Office Operations", batch: "Batch C", instructor: "Instructor C", room: "Room 02", status: "Terjadwal" },
] as const;

export const academicBatches = [
  { name: "Batch A", program: "Hospitality Training", participants: "32 Peserta", status: "Aktif", period: "Jan - Mar 2026" },
  { name: "Batch B", program: "Hospitality Training", participants: "28 Peserta", status: "Aktif", period: "Feb - Apr 2026" },
  { name: "Batch C", program: "Front Office Training", participants: "24 Peserta", status: "Aktif", period: "Mar - Mei 2026" },
] as const;

export const academicProgress = [
  { batch: "Batch A", progress: 72, color: "bg-[#123b63]" },
  { batch: "Batch B", progress: 58, color: "bg-[#c94242]" },
  { batch: "Batch C", progress: 84, color: "bg-[#d6a72b]" },
] as const;

export const academicActivities = [
  "Batch baru dibuat",
  "Jadwal diperbarui",
  "Mata pelajaran ditambahkan",
  "Kelas diperbarui",
  "Penilaian diperbarui",
] as const;

export const instructorSummaryCards = [
  { label: "Kelas Hari Ini", value: "3", description: "Data mock jadwal mengajar", icon: CalendarDays, tone: "navy" },
  { label: "Total Peserta", value: "42", description: "Data mock peserta kelas", icon: Users, tone: "red" },
  { label: "Kehadiran Belum Diisi", value: "1", description: "Perlu ditindaklanjuti hari ini", icon: CheckCircle2, tone: "yellow" },
  { label: "Penilaian Belum Selesai", value: "4", description: "Data mock penilaian aktif", icon: ClipboardCheck, tone: "blue" },
] as const;

export const instructorTodayClasses = [
  {
    time: "08:00 - 10:00",
    subject: "English for Hospitality",
    batch: "Batch A",
    className: "Kelas 01",
    room: "Room 01",
    participants: "18 Peserta",
    status: "Selesai",
  },
  {
    time: "10:30 - 12:30",
    subject: "Food Production",
    batch: "Batch B",
    className: "Kelas 02",
    room: "Kitchen 01",
    participants: "14 Peserta",
    status: "Sedang Berlangsung",
  },
  {
    time: "13:30 - 15:30",
    subject: "Housekeeping",
    batch: "Batch A",
    className: "Kelas 01",
    room: "Practice Room",
    participants: "18 Peserta",
    status: "Terjadwal",
  },
] as const;

export const instructorAttendance = {
  subject: "Food Production",
  batch: "Batch B",
  participants: "14 Peserta",
  status: "Belum Diisi",
} as const;

export const instructorStudents = [
  { name: "Andi Pratama", id: "GHS-24001", batch: "Batch A", attendance: "100%", status: "Aktif" },
  { name: "Siti Rahma", id: "GHS-24002", batch: "Batch B", attendance: "92%", status: "Aktif" },
  { name: "Rizky Maulana", id: "GHS-24003", batch: "Batch A", attendance: "78%", status: "Perlu Perhatian" },
  { name: "Dewi Lestari", id: "GHS-24004", batch: "Batch B", attendance: "96%", status: "Aktif" },
] as const;

export const instructorAssessments = [
  { assessment: "Practical Assessment", subject: "Food Production", batch: "Batch B", participants: "14 Peserta", status: "Belum Selesai" },
  { assessment: "English Interview", subject: "English for Hospitality", batch: "Batch A", participants: "18 Peserta", status: "Selesai" },
] as const;

export const instructorActivities = [
  "Kehadiran Food Production diperbarui",
  "Penilaian Practical Assessment selesai",
  "Kelas English for Hospitality selesai",
  "Jadwal kelas diperbarui",
] as const;

export const placementSummaryCards = [
  { label: "Peserta Siap Penempatan", value: "24", description: "Data mock peserta", icon: GraduationCap, tone: "navy" },
  { label: "Lowongan Aktif", value: "12", description: "Data mock lowongan", icon: BriefcaseBusiness, tone: "red" },
  { label: "Lamaran Aktif", value: "38", description: "Data mock lamaran", icon: FileText, tone: "yellow" },
  { label: "Wawancara Mendatang", value: "8", description: "Data mock agenda wawancara", icon: CalendarDays, tone: "blue" },
  { label: "Peserta Ditempatkan", value: "16", description: "Data mock penempatan", icon: CheckCircle2, tone: "navy" },
] as const;

export const placementPipeline = [
  { stage: "APPLIED", count: "18", color: "bg-[#e7eef5] text-[#123b63]" },
  { stage: "SCREENING", count: "12", color: "bg-[#fbeaea] text-[#c94242]" },
  { stage: "INTERVIEW", count: "8", color: "bg-[#fff6d9] text-[#a57c00]" },
  { stage: "SELECTED", count: "5", color: "bg-[#e8f2f8] text-[#357092]" },
  { stage: "PLACEMENT", count: "16", color: "bg-emerald-50 text-emerald-700" },
] as const;

export const upcomingInterviews = [
  { name: "Andi Pratama", position: "Commis Chef", company: "Hotel Example", date: "22 September 2026", time: "09:00", method: "Online", status: "PENDING" },
  { name: "Siti Rahma", position: "Front Office Staff", company: "Nusantara Hospitality", date: "23 September 2026", time: "13:30", method: "On-site", status: "RESCHEDULED" },
  { name: "Dewi Lestari", position: "Housekeeping Attendant", company: "Grand Sukabumi", date: "25 September 2026", time: "10:00", method: "Online", status: "PASSED" },
] as const;

export const studentsAttention = [
  { name: "Rizky Maulana", issue: "Dokumen belum lengkap", status: "Perlu Perhatian" },
  { name: "Siti Rahma", issue: "Wawancara perlu dijadwalkan", status: "Menunggu" },
  { name: "Dewi Lestari", issue: "Persiapan placement belum selesai", status: "Perlu Perhatian" },
  { name: "Andi Pratama", issue: "Dokumen perlu diverifikasi", status: "Selesai" },
] as const;

export const placementStatusOverview = [
  { status: "PREPARATION", count: "9", color: "bg-[#e7eef5] text-[#123b63]" },
  { status: "READY", count: "7", color: "bg-[#fff6d9] text-[#a57c00]" },
  { status: "DEPARTED", count: "4", color: "bg-[#e8f2f8] text-[#357092]" },
  { status: "PLACED", count: "16", color: "bg-emerald-50 text-emerald-700" },
  { status: "CANCELLED", count: "1", color: "bg-[#fbeaea] text-[#c94242]" },
] as const;

export const managementSummaryCards = [
  { label: "Total Peserta", value: "186", description: "Data mock seluruh peserta", icon: Users, tone: "navy" },
  { label: "Peserta Aktif", value: "164", description: "Data mock peserta aktif", icon: GraduationCap, tone: "red" },
  { label: "Completion", value: "78%", description: "Progress penyelesaian mock", icon: CheckCircle2, tone: "yellow" },
  { label: "Peserta Siap Penempatan", value: "24", description: "Data mock status placement", icon: BriefcaseBusiness, tone: "blue" },
  { label: "Peserta Ditempatkan", value: "16", description: "Data mock peserta placed", icon: CheckCircle2, tone: "navy" },
] as const;

export const managementTrainingOverview = [
  { program: "Food Production / Culinary", participants: "48 peserta", batches: "2 batch", progress: 72, color: "bg-[#123b63]" },
  { program: "Food and Beverage Service", participants: "46 peserta", batches: "2 batch", progress: 68, color: "bg-[#c94242]" },
  { program: "Housekeeping", participants: "44 peserta", batches: "2 batch", progress: 75, color: "bg-[#d6a72b]" },
  { program: "Barista", participants: "48 peserta", batches: "2 batch", progress: 81, color: "bg-[#357092]" },
] as const;

export const managementAttendanceOverview = [
  { label: "Hadir", value: 82, color: "bg-emerald-500" },
  { label: "Terlambat", value: 7, color: "bg-[#d6a72b]" },
  { label: "Izin", value: 6, color: "bg-[#357092]" },
  { label: "Tidak Hadir", value: 5, color: "bg-[#c94242]" },
] as const;

export const managementAcademicProgress = [
  { label: "Batch A", progress: 72, color: "bg-[#123b63]" },
  { label: "Batch B", progress: 64, color: "bg-[#c94242]" },
  { label: "Batch C", progress: 81, color: "bg-[#d6a72b]" },
  { label: "Batch D", progress: 58, color: "bg-[#357092]" },
] as const;

export const managementCompletionOverview = [
  { status: "ACTIVE", count: "164", color: "bg-[#e7eef5] text-[#123b63]" },
  { status: "COMPLETED", count: "78", color: "bg-[#e8f2f8] text-[#357092]" },
  { status: "DROPPED", count: "8", color: "bg-[#fbeaea] text-[#c94242]" },
  { status: "GRADUATED", count: "42", color: "bg-emerald-50 text-emerald-700" },
  { status: "ALUMNI", count: "31", color: "bg-[#fff6d9] text-[#a57c00]" },
] as const;

export const managementPlacementOverview = [
  { status: "PREPARATION", count: "9", color: "bg-[#e7eef5] text-[#123b63]" },
  { status: "READY", count: "7", color: "bg-[#fff6d9] text-[#a57c00]" },
  { status: "DEPARTED", count: "4", color: "bg-[#e8f2f8] text-[#357092]" },
  { status: "PLACED", count: "16", color: "bg-emerald-50 text-emerald-700" },
  { status: "CANCELLED", count: "1", color: "bg-[#fbeaea] text-[#c94242]" },
] as const;

export const managementPlacementDestinations = [
  { region: "Indonesia", count: 12, color: "bg-[#123b63]" },
  { region: "Asia", count: 8, color: "bg-[#c94242]" },
  { region: "Middle East", count: 5, color: "bg-[#d6a72b]" },
  { region: "Europe", count: 3, color: "bg-[#357092]" },
  { region: "USA", count: 2, color: "bg-[#6b7d8f]" },
  { region: "Canada", count: 1, color: "bg-[#123b63]" },
  { region: "Australia", count: 4, color: "bg-[#c94242]" },
  { region: "Maldives", count: 6, color: "bg-[#d6a72b]" },
] as const;

export const managementInsights = [
  "Batch C memiliki progress akademik tertinggi pada periode mock ini.",
  "Sebanyak 8 peserta memiliki wawancara yang dijadwalkan pada data placement mock.",
  "Program Barista memiliki progress training tertinggi dalam ringkasan program mock.",
] as const;

export const studentNavigationGroups: NavigationGroup[] = [
  { items: [{ label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Training",
    items: [
      { label: "Profil Saya", icon: UserRoundPlus },
      { label: "Jadwal", icon: CalendarDays },
      { label: "Kehadiran", icon: CheckCircle2 },
      { label: "Penilaian", icon: FileCheck2 },
    ],
  },
  {
    label: "Dokumen",
    items: [
      { label: "Dokumen Saya", icon: FileText },
    ],
  },
  {
    label: "Career",
    items: [
      { label: "Lamaran Saya", icon: FileText },
      { label: "Interview", icon: CalendarDays },
      { label: "Placement", icon: Building2 },
    ],
  },
];

export const studentSummaryCards = [
  { label: "Progress Training", value: "68%", description: "Data mock progress training", icon: GraduationCap, tone: "navy" },
  { label: "Kehadiran", value: "92%", description: "Ringkasan kehadiran mock", icon: CheckCircle2, tone: "red" },
  { label: "Penilaian", value: "84", description: "Rata-rata Nilai mock", icon: FileCheck2, tone: "yellow" },
  { label: "Lamaran Aktif", value: "2", description: "Data mock lamaran aktif", icon: BriefcaseBusiness, tone: "blue" },
  { label: "Status Placement", value: "Persiapan", description: "Status mock placement", icon: Building2, tone: "navy" },
] as const;

export const studentProfile = {
  name: "Andi Pratama",
  studentId: "GHS-2026-001",
  program: "Hospitality Training Program",
  specialization: "Food Production / Culinary",
  batch: "Batch Hospitality 2026-A",
  status: "ACTIVE",
  progress: 68,
} as const;

export const studentSchedule = [
  { subject: "English for Hospitality", schedule: "Senin, 08:00 - 10:00", location: "Classroom A", status: "Terjadwal" },
  { subject: "Food Production Practice", schedule: "Selasa, 10:00 - 13:00", location: "Practical Kitchen", status: "Terjadwal" },
  { subject: "Sanitation & K3L", schedule: "Rabu, 09:00 - 11:00", location: "Classroom B", status: "Selesai" },
  { subject: "Food & Beverage Service", schedule: "Kamis, 13:00 - 15:00", location: "Training Restaurant", status: "Dibatalkan" },
] as const;

export const studentAttendance = [
  { label: "Hadir", value: 46, color: "bg-emerald-500" },
  { label: "Terlambat", value: 3, color: "bg-[#d6a72b]" },
  { label: "Izin", value: 1, color: "bg-[#357092]" },
  { label: "Tidak Hadir", value: 2, color: "bg-[#c94242]" },
] as const;

export const studentAssessments = [
  { subject: "English for Hospitality", score: "86", percentage: "86%", status: "Selesai" },
  { subject: "Food Production Practice", score: "88", percentage: "88%", status: "Selesai" },
  { subject: "Sanitation & K3L", score: "82", percentage: "82%", status: "Selesai" },
  { subject: "Food & Beverage Service", score: "-", percentage: "-", status: "Belum Dinilai" },
] as const;

export const studentApplications = [
  { company: "Hotel Example A", position: "Commis Chef", status: "Interview" },
  { company: "Hotel Example B", position: "Kitchen Trainee", status: "Screening" },
] as const;

export const studentInterview = {
  company: "Hotel Example A",
  position: "Commis Chef",
  date: "25 September 2026",
  time: "10:00",
  method: "Online",
  status: "Scheduled",
} as const;

export const studentDocuments = [
  { name: "CV", status: "Verified" },
  { name: "KTP", status: "Verified" },
  { name: "Passport", status: "Pending" },
  { name: "Certificate", status: "Not Available" },
] as const;

export const studentActivities = [
  "Attendance diperbarui",
  "Nilai Food Production diperbarui",
  "Dokumen CV diverifikasi",
  "Lamaran baru dibuat",
  "Interview dijadwalkan",
] as const;

export type StudentStatus = "ACTIVE" | "COMPLETED" | "DROPPED" | "GRADUATED" | "ALUMNI";

export type ManagedStudent = {
  id: string;
  name: string;
  email: string;
  program: string;
  specialization: string;
  batch: string;
  status: StudentStatus;
  enrolledAt: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  trainingProgress: string;
  attendance: string;
  averageScore: string;
  documents: { name: string; status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" }[];
  career: { activeApplications: string; upcomingInterview: string; placementStatus: string };
  timeline: { label: string; detail: string; date: string }[];
};

const studentTimeline = [
  { label: "Enrollment", detail: "Peserta terdaftar pada program training", date: "15 Januari 2026" },
  { label: "Training", detail: "Training sedang berjalan", date: "20 Januari 2026" },
  { label: "Assessment", detail: "Assessment Food Production diperbarui", date: "10 September 2026" },
  { label: "Document", detail: "CV berhasil diverifikasi", date: "12 September 2026" },
  { label: "Career", detail: "Lamaran Commis Chef dibuat", date: "18 September 2026" },
] as const;

export const managedStudents: ManagedStudent[] = [
  {
    id: "GHS-2026-001",
    name: "Andi Pratama",
    email: "andi.pratama@example.com",
    program: "Hospitality Training Program",
    specialization: "Food Production / Culinary",
    batch: "Batch Hospitality 2026-A",
    status: "ACTIVE",
    enrolledAt: "15 Januari 2026",
    phone: "+62 812-3456-7801",
    dateOfBirth: "12 Mei 2004",
    address: "Sukabumi, Jawa Barat",
    trainingProgress: "68%",
    attendance: "92%",
    averageScore: "84",
    documents: [
      { name: "CV", status: "VERIFIED" },
      { name: "KTP", status: "VERIFIED" },
      { name: "Passport", status: "PENDING" },
      { name: "Certificate", status: "PENDING" },
    ],
    career: { activeApplications: "2", upcomingInterview: "1", placementStatus: "PREPARATION" },
    timeline: [...studentTimeline],
  },
  {
    id: "GHS-2026-002",
    name: "Siti Rahma",
    email: "siti.rahma@example.com",
    program: "Hospitality Training Program",
    specialization: "Housekeeping",
    batch: "Batch Hospitality 2026-A",
    status: "ACTIVE",
    enrolledAt: "15 Januari 2026",
    phone: "+62 813-4567-7802",
    dateOfBirth: "8 Agustus 2003",
    address: "Bogor, Jawa Barat",
    trainingProgress: "72%",
    attendance: "95%",
    averageScore: "86",
    documents: [
      { name: "CV", status: "VERIFIED" },
      { name: "KTP", status: "VERIFIED" },
      { name: "Passport", status: "VERIFIED" },
      { name: "Certificate", status: "PENDING" },
    ],
    career: { activeApplications: "1", upcomingInterview: "1", placementStatus: "READY" },
    timeline: [...studentTimeline],
  },
  {
    id: "GHS-2026-003",
    name: "Budi Santoso",
    email: "budi.santoso@example.com",
    program: "Hospitality Training Program",
    specialization: "Food & Beverage Service",
    batch: "Batch Hospitality 2026-A",
    status: "COMPLETED",
    enrolledAt: "10 Januari 2026",
    phone: "+62 814-5678-7803",
    dateOfBirth: "21 Februari 2002",
    address: "Bandung, Jawa Barat",
    trainingProgress: "100%",
    attendance: "94%",
    averageScore: "88",
    documents: [
      { name: "CV", status: "VERIFIED" },
      { name: "KTP", status: "VERIFIED" },
      { name: "Passport", status: "VERIFIED" },
      { name: "Certificate", status: "VERIFIED" },
    ],
    career: { activeApplications: "2", upcomingInterview: "0", placementStatus: "PLACED" },
    timeline: [...studentTimeline],
  },
  {
    id: "GHS-2026-004",
    name: "Dewi Lestari",
    email: "dewi.lestari@example.com",
    program: "Hospitality Training Program",
    specialization: "Barista",
    batch: "Batch Hospitality 2026-B",
    status: "ACTIVE",
    enrolledAt: "5 Februari 2026",
    phone: "+62 815-6789-7804",
    dateOfBirth: "14 November 2004",
    address: "Cianjur, Jawa Barat",
    trainingProgress: "55%",
    attendance: "89%",
    averageScore: "81",
    documents: [
      { name: "CV", status: "PENDING" },
      { name: "KTP", status: "VERIFIED" },
      { name: "Passport", status: "REJECTED" },
      { name: "Certificate", status: "PENDING" },
    ],
    career: { activeApplications: "0", upcomingInterview: "0", placementStatus: "PREPARATION" },
    timeline: [...studentTimeline],
  },
  {
    id: "GHS-2026-005",
    name: "Rizky Maulana",
    email: "rizky.maulana@example.com",
    program: "Hospitality Training Program",
    specialization: "Food Production / Culinary",
    batch: "Batch Hospitality 2026-B",
    status: "DROPPED",
    enrolledAt: "5 Februari 2026",
    phone: "+62 816-7890-7805",
    dateOfBirth: "2 Maret 2003",
    address: "Depok, Jawa Barat",
    trainingProgress: "32%",
    attendance: "71%",
    averageScore: "76",
    documents: [
      { name: "CV", status: "VERIFIED" },
      { name: "KTP", status: "PENDING" },
      { name: "Passport", status: "PENDING" },
      { name: "Certificate", status: "EXPIRED" },
    ],
    career: { activeApplications: "0", upcomingInterview: "0", placementStatus: "CANCELLED" },
    timeline: [...studentTimeline],
  },
  {
    id: "GHS-2025-014",
    name: "Maya Putri",
    email: "maya.putri@example.com",
    program: "Hospitality Training Program",
    specialization: "Housekeeping",
    batch: "Batch Hospitality 2025-B",
    status: "ALUMNI",
    enrolledAt: "12 Agustus 2025",
    phone: "+62 817-8901-7806",
    dateOfBirth: "30 Juni 2001",
    address: "Jakarta Selatan",
    trainingProgress: "100%",
    attendance: "97%",
    averageScore: "91",
    documents: [
      { name: "CV", status: "VERIFIED" },
      { name: "KTP", status: "VERIFIED" },
      { name: "Passport", status: "VERIFIED" },
      { name: "Certificate", status: "VERIFIED" },
    ],
    career: { activeApplications: "0", upcomingInterview: "0", placementStatus: "PLACED" },
    timeline: [...studentTimeline],
  },
];

export type DocumentStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
export type DocumentType = "CV" | "KTP" | "Passport" | "Certificate" | "Other";
export type ManagedDocument = {
  id: string;
  studentId: string;
  studentName: string;
  name: string;
  type: DocumentType;
  fileName: string;
  fileType: string;
  fileSize: string;
  storagePath: string;
  status: DocumentStatus;
  uploadedAt: string;
  updatedAt: string;
  verifiedBy: string;
  verifiedAt: string;
  rejectionReason: string;
};

export const managedDocuments: ManagedDocument[] = [
  { id: "DOC-2026-001", studentId: "GHS-2026-001", studentName: "Andi Pratama", name: "CV - Andi Pratama", type: "CV", fileName: "andi-pratama-cv.pdf", fileType: "application/pdf", fileSize: "820 KB", storagePath: "students/GHS-2026-001/documents/cv.pdf", status: "VERIFIED", uploadedAt: "20 September 2026", updatedAt: "20 September 2026", verifiedBy: "Admin GHS", verifiedAt: "20 September 2026", rejectionReason: "" },
  { id: "DOC-2026-002", studentId: "GHS-2026-001", studentName: "Andi Pratama", name: "KTP - Andi Pratama", type: "KTP", fileName: "andi-pratama-ktp.jpg", fileType: "image/jpeg", fileSize: "1.2 MB", storagePath: "students/GHS-2026-001/documents/ktp.jpg", status: "VERIFIED", uploadedAt: "20 September 2026", updatedAt: "20 September 2026", verifiedBy: "Admin GHS", verifiedAt: "20 September 2026", rejectionReason: "" },
  { id: "DOC-2026-003", studentId: "GHS-2026-001", studentName: "Andi Pratama", name: "Passport - Andi Pratama", type: "Passport", fileName: "andi-pratama-passport.pdf", fileType: "application/pdf", fileSize: "640 KB", storagePath: "students/GHS-2026-001/documents/passport.pdf", status: "PENDING", uploadedAt: "20 September 2026", updatedAt: "20 September 2026", verifiedBy: "-", verifiedAt: "-", rejectionReason: "" },
  { id: "DOC-2026-004", studentId: "GHS-2026-002", studentName: "Siti Rahma", name: "KTP - Siti Rahma", type: "KTP", fileName: "siti-rahma-ktp.jpg", fileType: "image/jpeg", fileSize: "980 KB", storagePath: "students/GHS-2026-002/documents/ktp.jpg", status: "REJECTED", uploadedAt: "18 September 2026", updatedAt: "19 September 2026", verifiedBy: "Admin GHS", verifiedAt: "19 September 2026", rejectionReason: "File tidak terbaca" },
  { id: "DOC-2026-005", studentId: "GHS-2026-003", studentName: "Budi Santoso", name: "Certificate - Budi Santoso", type: "Certificate", fileName: "budi-santoso-certificate.pdf", fileType: "application/pdf", fileSize: "1.5 MB", storagePath: "students/GHS-2026-003/documents/certificate.pdf", status: "EXPIRED", uploadedAt: "15 January 2025", updatedAt: "15 January 2026", verifiedBy: "Admin GHS", verifiedAt: "15 January 2025", rejectionReason: "" },
  { id: "DOC-2026-006", studentId: "GHS-2026-004", studentName: "Dewi Lestari", name: "CV - Dewi Lestari", type: "CV", fileName: "dewi-lestari-cv.pdf", fileType: "application/pdf", fileSize: "760 KB", storagePath: "students/GHS-2026-004/documents/cv.pdf", status: "PENDING", uploadedAt: "21 September 2026", updatedAt: "21 September 2026", verifiedBy: "-", verifiedAt: "-", rejectionReason: "" },
];

export type ProgramStatus = "ACTIVE" | "COMPLETED";
export type SubjectType = "THEORY" | "PRACTICAL";
export type SubjectStatus = "ACTIVE" | "COMPLETED";

export type ManagedProgram = {
  id: string;
  name: string;
  description: string;
  duration: string;
  specialization: string;
  participants: string;
  activeBatches: string;
  status: ProgramStatus;
  subjects: string[];
};

export const managedPrograms: ManagedProgram[] = [
  { id: "HTP", name: "Hospitality Training Program", description: "Program training hospitality dengan konteks mock untuk pengembangan kompetensi peserta.", duration: "1 Tahun", specialization: "Hospitality", participants: "186", activeBatches: "8", status: "ACTIVE", subjects: ["English for Hospitality", "Sanitation & K3L", "Food Production Practice", "Food & Beverage Service", "International Culture"] },
  { id: "FPC", name: "Food Production / Culinary", description: "Program specialization mock untuk praktik food production dan culinary.", duration: "6 Bulan", specialization: "Food Production / Culinary", participants: "48", activeBatches: "2", status: "ACTIVE", subjects: ["Food Production Practice", "Sanitation & K3L", "English for Hospitality"] },
  { id: "HKS", name: "Housekeeping Training", description: "Program specialization mock untuk operasional housekeeping.", duration: "6 Bulan", specialization: "Housekeeping", participants: "44", activeBatches: "2", status: "ACTIVE", subjects: ["Housekeeping Operations", "English for Hospitality", "International Culture"] },
  { id: "BRT", name: "Barista Training", description: "Program specialization mock untuk keterampilan barista.", duration: "4 Bulan", specialization: "Barista", participants: "48", activeBatches: "2", status: "COMPLETED", subjects: ["Barista Fundamentals", "Food & Beverage Service", "Sanitation & K3L"] },
];

export type ManagedSubject = {
  id: string;
  name: string;
  type: SubjectType;
  programId: string;
  instructorId: string;
  program: string;
  instructor: string;
  description: string;
  status: SubjectStatus;
  schedule: string;
  location: string;
};

export const managedSubjects: ManagedSubject[] = [
  { id: "ENG-01", name: "English for Hospitality", type: "THEORY", programId: "HTP", instructorId: "INS-001", program: "Hospitality Training Program", instructor: "Budi Santoso", description: "Materi mock komunikasi bahasa Inggris dalam konteks hospitality.", status: "ACTIVE", schedule: "Senin, 08:00 - 10:00", location: "Classroom A" },
  { id: "FP-01", name: "Food Production Practice", type: "PRACTICAL", programId: "HTP", instructorId: "INS-001", program: "Hospitality Training Program", instructor: "Budi Santoso", description: "Materi mock praktik dasar food production.", status: "ACTIVE", schedule: "Selasa, 10:00 - 13:00", location: "Practical Kitchen" },
  { id: "SAN-01", name: "Sanitation & K3L", type: "THEORY", programId: "HTP", instructorId: "INS-002", program: "Hospitality Training Program", instructor: "Andi Pratama", description: "Materi mock sanitasi, keselamatan, dan lingkungan kerja.", status: "ACTIVE", schedule: "Rabu, 09:00 - 11:00", location: "Classroom B" },
  { id: "FBS-01", name: "Food & Beverage Service", type: "PRACTICAL", programId: "HTP", instructorId: "INS-003", program: "Hospitality Training Program", instructor: "Siti Rahma", description: "Materi mock pelayanan food and beverage.", status: "ACTIVE", schedule: "Kamis, 13:00 - 15:00", location: "Training Restaurant" },
  { id: "HKS-01", name: "Housekeeping Operations", type: "PRACTICAL", programId: "HKS", instructorId: "INS-004", program: "Housekeeping Training", instructor: "Dewi Lestari", description: "Materi mock operasional housekeeping.", status: "ACTIVE", schedule: "Jumat, 08:00 - 10:00", location: "Practice Room" },
  { id: "BAR-01", name: "Barista Fundamentals", type: "PRACTICAL", programId: "BRT", instructorId: "INS-001", program: "Barista Training", instructor: "Budi Santoso", description: "Materi mock dasar-dasar barista.", status: "COMPLETED", schedule: "Selasa, 13:00 - 15:00", location: "Coffee Lab" },
];

export type BatchStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type EnrollmentStatus = "ACTIVE" | "COMPLETED" | "TRANSFERRED" | "DROPPED";

export type ManagedBatch = {
  id: string;
  name: string;
  programId: string;
  program: string;
  period: string;
  startDate: string;
  endDate: string;
  participantCount: string;
  status: BatchStatus;
};

export const managedBatches: ManagedBatch[] = [
  { id: "BATCH-2026-A", name: "Batch Hospitality 2026-A", programId: "HTP", program: "Hospitality Training Program", period: "Jan 2026 - Jun 2026", startDate: "2026-01-05", endDate: "2026-06-30", participantCount: "32", status: "ACTIVE" },
  { id: "BATCH-2026-B", name: "Batch Hospitality 2026-B", programId: "HTP", program: "Hospitality Training Program", period: "Jul 2026 - Dec 2026", startDate: "2026-07-01", endDate: "2026-12-20", participantCount: "28", status: "PLANNED" },
  { id: "BATCH-2025-B", name: "Batch Hospitality 2025-B", programId: "HTP", program: "Hospitality Training Program", period: "Jul 2025 - Dec 2025", startDate: "2025-07-01", endDate: "2025-12-20", participantCount: "30", status: "COMPLETED" },
  { id: "BATCH-2025-A", name: "Batch Hospitality 2025-A", programId: "HTP", program: "Hospitality Training Program", period: "Jan 2025 - Jun 2025", startDate: "2025-01-05", endDate: "2025-06-30", participantCount: "26", status: "CANCELLED" },
];

export type ManagedEnrollment = {
  id: string;
  studentId: string;
  studentName: string;
  programId: string;
  program: string;
  batchId: string;
  batchName: string;
  status: EnrollmentStatus;
  startDate: string;
  endDate: string;
  previousBatch?: string;
  newBatch?: string;
  timeline: { label: string; detail: string; date: string }[];
};

export const managedEnrollments: ManagedEnrollment[] = [
  {
    id: "ENR-2026-001",
    studentId: "GHS-2026-001",
    studentName: "Andi Pratama",
    programId: "HTP",
    program: "Hospitality Training Program",
    batchId: "BATCH-2026-A",
    batchName: "Batch Hospitality 2026-A",
    status: "ACTIVE",
    startDate: "2026-01-05",
    endDate: "-",
    timeline: [
      { label: "Enrolled", detail: "Enrollment dibuat pada Batch Hospitality 2026-A", date: "2026-01-05" },
      { label: "Training", detail: "Training berjalan", date: "2026-01-20" },
    ],
  },
  {
    id: "ENR-2026-002",
    studentId: "GHS-2026-002",
    studentName: "Siti Rahma",
    programId: "HTP",
    program: "Hospitality Training Program",
    batchId: "BATCH-2026-A",
    batchName: "Batch Hospitality 2026-A",
    status: "ACTIVE",
    startDate: "2026-01-05",
    endDate: "-",
    timeline: [
      { label: "Enrolled", detail: "Enrollment dibuat pada Batch Hospitality 2026-A", date: "2026-01-05" },
      { label: "Training", detail: "Training berjalan", date: "2026-01-20" },
    ],
  },
  {
    id: "ENR-2026-003",
    studentId: "GHS-2026-003",
    studentName: "Budi Santoso",
    programId: "HTP",
    program: "Hospitality Training Program",
    batchId: "BATCH-2026-A",
    batchName: "Batch Hospitality 2026-A",
    status: "COMPLETED",
    startDate: "2026-01-05",
    endDate: "2026-06-20",
    timeline: [
      { label: "Enrolled", detail: "Enrollment dibuat pada Batch Hospitality 2026-A", date: "2026-01-05" },
      { label: "Training", detail: "Training selesai", date: "2026-06-10" },
      { label: "Completed", detail: "Enrollment berstatus COMPLETED", date: "2026-06-20" },
    ],
  },
  {
    id: "ENR-2026-004",
    studentId: "GHS-2026-004",
    studentName: "Dewi Lestari",
    programId: "HTP",
    program: "Hospitality Training Program",
    batchId: "BATCH-2026-B",
    batchName: "Batch Hospitality 2026-B",
    status: "ACTIVE",
    startDate: "2026-07-01",
    endDate: "-",
    timeline: [
      { label: "Enrolled", detail: "Enrollment dibuat pada Batch Hospitality 2026-B", date: "2026-07-01" },
      { label: "Training", detail: "Training berjalan", date: "2026-07-15" },
    ],
  },
  {
    id: "ENR-2026-005",
    studentId: "GHS-2026-005",
    studentName: "Rizky Maulana",
    programId: "HTP",
    program: "Hospitality Training Program",
    batchId: "BATCH-2026-B",
    batchName: "Batch Hospitality 2026-B",
    status: "DROPPED",
    startDate: "2026-07-01",
    endDate: "2026-08-15",
    timeline: [
      { label: "Enrolled", detail: "Enrollment dibuat pada Batch Hospitality 2026-B", date: "2026-07-01" },
      { label: "Dropped", detail: "Enrollment berstatus DROPPED", date: "2026-08-15" },
    ],
  },
  {
    id: "ENR-2025-018",
    studentId: "GHS-2025-014",
    studentName: "Maya Putri",
    programId: "HTP",
    program: "Hospitality Training Program",
    batchId: "BATCH-2025-B",
    batchName: "Batch Hospitality 2025-B",
    status: "COMPLETED",
    startDate: "2025-07-01",
    endDate: "2025-12-20",
    timeline: [
      { label: "Enrolled", detail: "Enrollment dibuat pada Batch Hospitality 2025-B", date: "2025-07-01" },
      { label: "Completed", detail: "Enrollment berstatus COMPLETED", date: "2025-12-20" },
    ],
  },
  {
    id: "ENR-2025-001-A",
    studentId: "GHS-2026-001",
    studentName: "Andi Pratama",
    programId: "HTP",
    program: "Hospitality Training Program",
    batchId: "BATCH-2025-A",
    batchName: "Batch Hospitality 2025-A",
    status: "TRANSFERRED",
    startDate: "2025-01-05",
    endDate: "2025-06-15",
    previousBatch: "Batch Hospitality 2025-A",
    newBatch: "Batch Hospitality 2026-A",
    timeline: [
      { label: "Enrolled", detail: "Enrollment dibuat pada Batch Hospitality 2025-A", date: "2025-01-05" },
      { label: "Transfer", detail: "Dipindahkan ke Batch Hospitality 2026-A", date: "2025-06-15" },
    ],
  },
];

export type ClassStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type ScheduleStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export type ManagedClass = {
  id: string;
  name: string;
  subjectId: string;
  subject: string;
  batchId: string;
  instructorId: string;
  instructor: string;
  schedule: string;
  status: ClassStatus;
  totalParticipants: string;
};

export const managedClasses: ManagedClass[] = [
  { id: "CLS-2026-001", name: "English for Hospitality - A", subjectId: "ENG-01", subject: "English for Hospitality", batchId: "BATCH-2026-A", instructorId: "INS-001", instructor: "Budi Santoso", schedule: "Monday 08:00 - 10:00", status: "SCHEDULED", totalParticipants: "18" },
  { id: "CLS-2026-002", name: "Food Production Practice - A", subjectId: "FP-01", subject: "Food Production Practice", batchId: "BATCH-2026-A", instructorId: "INS-001", instructor: "Budi Santoso", schedule: "Tuesday 10:00 - 13:00", status: "SCHEDULED", totalParticipants: "14" },
  { id: "CLS-2026-003", name: "Sanitation & K3L - A", subjectId: "SAN-01", subject: "Sanitation & K3L", batchId: "BATCH-2026-A", instructorId: "INS-002", instructor: "Andi Pratama", schedule: "Wednesday 09:00 - 11:00", status: "COMPLETED", totalParticipants: "18" },
  { id: "CLS-2026-004", name: "Food & Beverage Service - A", subjectId: "FBS-01", subject: "Food & Beverage Service", batchId: "BATCH-2026-A", instructorId: "INS-003", instructor: "Siti Rahma", schedule: "Thursday 13:00 - 15:00", status: "CANCELLED", totalParticipants: "14" },
  { id: "CLS-2026-005", name: "Housekeeping Operations - B", subjectId: "HKS-01", subject: "Housekeeping Operations", batchId: "BATCH-2026-B", instructorId: "INS-004", instructor: "Dewi Lestari", schedule: "Friday 08:00 - 10:00", status: "SCHEDULED", totalParticipants: "16" },
  { id: "CLS-2026-006", name: "Barista Fundamentals - B", subjectId: "BAR-01", subject: "Barista Fundamentals", batchId: "BATCH-2026-B", instructorId: "INS-001", instructor: "Budi Santoso", schedule: "Monday 13:00 - 15:00", status: "SCHEDULED", totalParticipants: "12" },
];

export type ManagedSchedule = {
  id: string;
  date: string;
  day: string;
  startTime: string;
  endTime: string;
  subject: string;
  subjectId: string;
  classId: string;
  batchId: string;
  instructorId: string;
  instructor: string;
  room: string;
  status: ScheduleStatus;
  participantCount: string;
};

export const managedSchedules: ManagedSchedule[] = [
  { id: "SCH-2026-001", date: "21 September 2026", day: "MONDAY", startTime: "08:00", endTime: "10:00", subject: "English for Hospitality", subjectId: "ENG-01", classId: "CLS-2026-001", batchId: "BATCH-2026-A", instructorId: "INS-001", instructor: "Budi Santoso", room: "Classroom A", status: "SCHEDULED", participantCount: "18" },
  { id: "SCH-2026-002", date: "21 September 2026", day: "MONDAY", startTime: "10:00", endTime: "13:00", subject: "Food Production Practice", subjectId: "FP-01", classId: "CLS-2026-002", batchId: "BATCH-2026-A", instructorId: "INS-001", instructor: "Budi Santoso", room: "Practical Kitchen", status: "SCHEDULED", participantCount: "14" },
  { id: "SCH-2026-003", date: "22 September 2026", day: "TUESDAY", startTime: "09:00", endTime: "11:00", subject: "Sanitation & K3L", subjectId: "SAN-01", classId: "CLS-2026-003", batchId: "BATCH-2026-A", instructorId: "INS-002", instructor: "Andi Pratama", room: "Classroom B", status: "COMPLETED", participantCount: "18" },
  { id: "SCH-2026-004", date: "23 September 2026", day: "WEDNESDAY", startTime: "13:00", endTime: "15:00", subject: "Food & Beverage Service", subjectId: "FBS-01", classId: "CLS-2026-004", batchId: "BATCH-2026-A", instructorId: "INS-003", instructor: "Siti Rahma", room: "Training Restaurant", status: "CANCELLED", participantCount: "14" },
  { id: "SCH-2026-005", date: "24 September 2026", day: "THURSDAY", startTime: "08:00", endTime: "10:00", subject: "Housekeeping Operations", subjectId: "HKS-01", classId: "CLS-2026-005", batchId: "BATCH-2026-B", instructorId: "INS-004", instructor: "Dewi Lestari", room: "Housekeeping Lab", status: "SCHEDULED", participantCount: "16" },
  { id: "SCH-2026-006", date: "25 September 2026", day: "FRIDAY", startTime: "13:00", endTime: "15:00", subject: "Barista Fundamentals", subjectId: "BAR-01", classId: "CLS-2026-006", batchId: "BATCH-2026-B", instructorId: "INS-001", instructor: "Budi Santoso", room: "Cafe / Barista Lab", status: "SCHEDULED", participantCount: "12" },
];

export type AttendanceStatus = "PRESENT" | "LATE" | "EXCUSED" | "ABSENT";

export type ManagedAttendanceRecord = {
  scheduleId: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  lastUpdated: string;
};

export const managedAttendanceRecords: ManagedAttendanceRecord[] = [
  { scheduleId: "SCH-2026-001", studentId: "GHS-2026-001", studentName: "Andi Pratama", status: "PRESENT", lastUpdated: "21 September 2026, 10:05" },
  { scheduleId: "SCH-2026-001", studentId: "GHS-2026-002", studentName: "Siti Rahma", status: "LATE", lastUpdated: "21 September 2026, 10:06" },
  { scheduleId: "SCH-2026-001", studentId: "GHS-2026-003", studentName: "Budi Santoso", status: "EXCUSED", lastUpdated: "21 September 2026, 10:07" },
  { scheduleId: "SCH-2026-001", studentId: "GHS-2026-004", studentName: "Dewi Lestari", status: "ABSENT", lastUpdated: "21 September 2026, 10:08" },
  { scheduleId: "SCH-2026-002", studentId: "GHS-2026-001", studentName: "Andi Pratama", status: "PRESENT", lastUpdated: "21 September 2026, 13:05" },
  { scheduleId: "SCH-2026-002", studentId: "GHS-2026-002", studentName: "Siti Rahma", status: "PRESENT", lastUpdated: "21 September 2026, 13:05" },
  { scheduleId: "SCH-2026-002", studentId: "GHS-2026-003", studentName: "Budi Santoso", status: "PRESENT", lastUpdated: "21 September 2026, 13:06" },
  { scheduleId: "SCH-2026-002", studentId: "GHS-2026-004", studentName: "Dewi Lestari", status: "PRESENT", lastUpdated: "21 September 2026, 13:06" },
];

export type AssessmentType = "ASSIGNMENT" | "PRACTICAL" | "EXAM" | "INTERVIEW" | "OTHER";
export type AssessmentSessionStatus = "OPEN" | "COMPLETED";
export type AssessmentScore = {
  assessmentId: string;
  studentId: string;
  studentName: string;
  score: number | null;
  createdAt: string;
  updatedAt: string;
};
export type ManagedAssessment = {
  id: string;
  name: string;
  type: AssessmentType;
  subject: string;
  subjectId: string;
  classId: string;
  batchId: string;
  instructor: string;
  date: string;
  maximumScore: number;
  status: AssessmentSessionStatus;
};

export const managedAssessments: ManagedAssessment[] = [
  { id: "ASM-2026-001", name: "Mid Assignment", type: "ASSIGNMENT", subject: "English for Hospitality", subjectId: "ENG-01", classId: "CLS-2026-001", batchId: "BATCH-2026-A", instructor: "Budi Santoso", date: "21 September 2026", maximumScore: 100, status: "OPEN" },
  { id: "ASM-2026-002", name: "Food Production Practical", type: "PRACTICAL", subject: "Food Production Practice", subjectId: "FP-01", classId: "CLS-2026-002", batchId: "BATCH-2026-A", instructor: "Budi Santoso", date: "22 September 2026", maximumScore: 100, status: "COMPLETED" },
  { id: "ASM-2026-003", name: "Sanitation Written Exam", type: "EXAM", subject: "Sanitation & K3L", subjectId: "SAN-01", classId: "CLS-2026-003", batchId: "BATCH-2026-A", instructor: "Andi Pratama", date: "23 September 2026", maximumScore: 100, status: "OPEN" },
  { id: "ASM-2026-004", name: "English Interview", type: "INTERVIEW", subject: "English for Hospitality", subjectId: "ENG-01", classId: "CLS-2026-001", batchId: "BATCH-2026-A", instructor: "Budi Santoso", date: "24 September 2026", maximumScore: 100, status: "COMPLETED" },
];

export const managedAssessmentScores: AssessmentScore[] = [
  { assessmentId: "ASM-2026-001", studentId: "GHS-2026-001", studentName: "Andi Pratama", score: 86, createdAt: "21 September 2026", updatedAt: "21 September 2026" },
  { assessmentId: "ASM-2026-001", studentId: "GHS-2026-002", studentName: "Siti Rahma", score: 90, createdAt: "21 September 2026", updatedAt: "21 September 2026" },
  { assessmentId: "ASM-2026-001", studentId: "GHS-2026-003", studentName: "Budi Santoso", score: null, createdAt: "21 September 2026", updatedAt: "21 September 2026" },
  { assessmentId: "ASM-2026-001", studentId: "GHS-2026-004", studentName: "Dewi Lestari", score: 78, createdAt: "21 September 2026", updatedAt: "21 September 2026" },
  { assessmentId: "ASM-2026-002", studentId: "GHS-2026-001", studentName: "Andi Pratama", score: 88, createdAt: "22 September 2026", updatedAt: "22 September 2026" },
  { assessmentId: "ASM-2026-002", studentId: "GHS-2026-002", studentName: "Siti Rahma", score: 84, createdAt: "22 September 2026", updatedAt: "22 September 2026" },
  { assessmentId: "ASM-2026-002", studentId: "GHS-2026-003", studentName: "Budi Santoso", score: 91, createdAt: "22 September 2026", updatedAt: "22 September 2026" },
  { assessmentId: "ASM-2026-002", studentId: "GHS-2026-004", studentName: "Dewi Lestari", score: 87, createdAt: "22 September 2026", updatedAt: "22 September 2026" },
];
