import { z } from "zod";

const certificateDateSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" || value instanceof Date) {
      return new Date(value);
    }
    return value;
  },
  z.date(),
);

export const certificateCreateSchema = z
  .object({
    studentId: z.string().trim().min(1, "studentId is required"),
    programId: z.string().trim().min(1, "programId is required"),
    batchId: z.string().trim().min(1, "batchId is required"),
    certificateNumber: z.string().trim().min(1, "certificateNumber is required"),
    issuedAt: certificateDateSchema,
    path: z.string().trim().nullable().optional(),
  })
  .strict();

export const certificateRevokeSchema = z
  .object({
    reason: z.string().trim().nullable().optional(),
  })
  .strict();

export const certificateQuerySchema = z
  .object({
    studentId: z.string().trim().optional(),
    batchId: z.string().trim().optional(),
    status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  })
  .strict();

export type CertificateCreateInput = z.infer<typeof certificateCreateSchema>;
export type CertificateRevokeInput = z.infer<typeof certificateRevokeSchema>;
export type CertificateQueryInput = z.infer<typeof certificateQuerySchema>;
