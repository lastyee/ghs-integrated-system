import { z } from "zod";
import { AssignmentStatus } from "@prisma/client";

export const assignmentCreateSchema = z.object({
  classId: z.string().trim().min(1, "Class ID is required"),
  subjectId: z.string().trim().min(1, "Subject ID is required"),
  scheduleId: z.string().trim().min(1).nullable().optional(),
  instructorId: z.string().trim().min(1).optional(),
  title: z
    .string()
    .trim()
    .min(1, "Judul tugas wajib diisi")
    .max(255, "Judul tugas maksimal 255 karakter"),
  description: z.string().trim().nullable().optional(),
  dueDate: z
    .string()
    .trim()
    .min(1, "Tenggat pengumpulan wajib diisi")
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Format tanggal tenggat tidak valid",
    }),
  allowLateSubmission: z.boolean().default(false).optional(),
  maxScore: z
    .number()
    .finite()
    .gt(0, "Nilai maksimum harus lebih besar dari 0")
    .max(1000, "Nilai maksimum tidak boleh melebihi 1000")
    .default(100)
    .optional(),
  status: z
    .nativeEnum(AssignmentStatus)
    .default(AssignmentStatus.PUBLISHED)
    .optional(),
});

export const assignmentUpdateSchema = z.object({
  classId: z.string().trim().min(1).optional(),
  subjectId: z.string().trim().min(1).optional(),
  scheduleId: z.string().trim().min(1).nullable().optional(),
  instructorId: z.string().trim().min(1).optional(),
  title: z
    .string()
    .trim()
    .min(1, "Judul tugas tidak boleh kosong")
    .max(255, "Judul tugas maksimal 255 karakter")
    .optional(),
  description: z.string().trim().nullable().optional(),
  dueDate: z
    .string()
    .trim()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Format tanggal tenggat tidak valid",
    })
    .optional(),
  allowLateSubmission: z.boolean().optional(),
  maxScore: z
    .number()
    .finite()
    .gt(0, "Nilai maksimum harus lebih besar dari 0")
    .max(1000, "Nilai maksimum tidak boleh melebihi 1000")
    .optional(),
  status: z.nativeEnum(AssignmentStatus).optional(),
});

export const submissionCreateSchema = z.object({
  content: z
    .string()
    .trim()
    .max(5000, "Catatan pengantar maksimal 5000 karakter")
    .nullable()
    .optional(),
});

export const submissionGradeSchema = z.object({
  score: z
    .number()
    .finite()
    .min(0, "Nilai tidak boleh kurang dari 0"),
  feedback: z
    .string()
    .trim()
    .max(5000, "Umpan balik maksimal 5000 karakter")
    .nullable()
    .optional(),
});

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;
export type SubmissionCreateInput = z.infer<typeof submissionCreateSchema>;
export type SubmissionGradeInput = z.infer<typeof submissionGradeSchema>;
