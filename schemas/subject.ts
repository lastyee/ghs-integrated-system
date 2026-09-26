import { z } from "zod";

export const subjectCreateSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
  })
  .strict();

export const subjectUpdateSchema = z
  .object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one subject field is required",
  });

