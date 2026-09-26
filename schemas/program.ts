import { z } from "zod";

export const programCreateSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
  })
  .strict();

export const programUpdateSchema = z
  .object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one program field is required",
  });

