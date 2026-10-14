import { z } from "zod";

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "Nama lengkap wajib diisi"),
    email: z.string().trim().email("Format email tidak valid"),
    password: z.string().min(6, "Password minimal 6 karakter"),
    role: z.enum(
      [
        "SUPER_ADMIN",
        "ADMIN",
        "ACADEMIC_STAFF",
        "INSTRUCTOR",
        "PLACEMENT_STAFF",
        "MANAGEMENT",
      ],
      {
        message: "Peran pengguna tidak valid",
      }
    ),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
