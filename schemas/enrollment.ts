import { z } from "zod";

export const enrollmentCreateSchema = z
  .object({
    studentId: z.string().min(1),
    batchId: z.string().min(1),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const enrollmentUpdateSchema = z
  .object({
    status: z.enum(["ACTIVE", "COMPLETED", "TRANSFERRED", "DROPPED"]).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one enrollment field is required",
  });

