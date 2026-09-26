import { z } from "zod";

const batchDateSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" || value instanceof Date) {
      return new Date(value);
    }

    return value;
  },
  z.date(),
);

export const batchCreateSchema = z
  .object({
    name: z.string().min(1),
    programId: z.string().min(1),
    startDate: batchDateSchema,
    endDate: batchDateSchema.nullable().optional(),
  })
  .strict();

export const batchUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    programId: z.string().min(1).optional(),
    startDate: batchDateSchema.optional(),
    endDate: batchDateSchema.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one batch field is required",
  });

