import { z } from "zod";

export const studentCreateSchema = z
  .object({
    nim: z.string().min(1),
    nik: z.string().nullable().optional(),
    name: z.string().min(1),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
  })
  .strict();

export const studentUpdateSchema = z
  .object({
    nim: z.string().min(1).optional(),
    nik: z.string().nullable().optional(),
    name: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one student field is required",
  });
