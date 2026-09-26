import { z } from "zod";

export const activateStudentSchema = z
  .object({
    nim: z.string().trim().min(1, "NIM wajib diisi"),
    name: z.string().trim().min(1, "Nama wajib diisi"),
    nik: z.string().trim().optional(),
    email: z.string().trim().email("Format email tidak valid"),
    password: z.string().min(6, "Password minimal 6 karakter"),
  })
  .strict();

export type ActivateStudentInput = z.infer<typeof activateStudentSchema>;
