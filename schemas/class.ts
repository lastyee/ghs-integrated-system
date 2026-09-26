import { z } from "zod";

export const classCreateSchema = z
  .object({
    name: z.string().min(1),
    batchId: z.string().min(1),
    instructorId: z.string().min(1),
  })
  .strict();

export const classUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    batchId: z.string().min(1).optional(),
    instructorId: z.string().min(1).optional(),
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one class field is required",
  });

