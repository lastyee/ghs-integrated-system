import { z } from "zod";

export const attendanceStatusSchema = z.enum(["PRESENT", "LATE", "ABSENT"]);
export const absenceTypeSchema = z.enum(["SICK", "PERMITTED", "UNEXCUSED"]);

export const attendanceCreateSchema = z
  .object({
    scheduleId: z.string().min(1),
    studentId: z.string().min(1),
    status: attendanceStatusSchema,
    absenceType: absenceTypeSchema.nullable().optional(),
    lateMinutes: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.status === "PRESENT") {
      if (data.absenceType != null) {
        context.addIssue({
          code: "custom",
          path: ["absenceType"],
          message: "absenceType must be null when status is PRESENT",
        });
      }

      if (data.lateMinutes != null) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes must be null when status is PRESENT",
        });
      }
    }

    if (data.status === "LATE") {
      if (data.absenceType != null) {
        context.addIssue({
          code: "custom",
          path: ["absenceType"],
          message: "absenceType must be null when status is LATE",
        });
      }

      if (data.lateMinutes == null) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes is required when status is LATE",
        });
      } else if (data.lateMinutes < 1) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes must be greater than or equal to 1",
        });
      }
    }

    if (data.status === "ABSENT") {
      if (data.absenceType == null) {
        context.addIssue({
          code: "custom",
          path: ["absenceType"],
          message: "absenceType is required when status is ABSENT",
        });
      }

      if (data.lateMinutes != null) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes must be null when status is ABSENT",
        });
      }
    }
  });

export const attendanceUpdateSchema = z
  .object({
    status: attendanceStatusSchema.optional(),
    absenceType: absenceTypeSchema.nullable().optional(),
    lateMinutes: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.status === "PRESENT") {
      if (data.absenceType != null) {
        context.addIssue({
          code: "custom",
          path: ["absenceType"],
          message: "absenceType must be null when status is PRESENT",
        });
      }

      if (data.lateMinutes != null) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes must be null when status is PRESENT",
        });
      }
    }

    if (data.status === "LATE") {
      if (data.absenceType != null) {
        context.addIssue({
          code: "custom",
          path: ["absenceType"],
          message: "absenceType must be null when status is LATE",
        });
      }

      if (data.lateMinutes == null) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes is required when status is LATE",
        });
      } else if (data.lateMinutes < 1) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes must be greater than or equal to 1",
        });
      }
    }

    if (data.status === "ABSENT") {
      if (data.absenceType == null) {
        context.addIssue({
          code: "custom",
          path: ["absenceType"],
          message: "absenceType is required when status is ABSENT",
        });
      }

      if (data.lateMinutes != null) {
        context.addIssue({
          code: "custom",
          path: ["lateMinutes"],
          message: "lateMinutes must be null when status is ABSENT",
        });
      }
    }
  });
