import { z } from "zod";
import { InterviewStatus } from "@prisma/client";

export const VALID_INTERVIEW_STATUSES = [
  "PENDING",
  "PASSED",
  "FAILED",
  "RESCHEDULED",
] as const;

export type InterviewStatusValue = (typeof VALID_INTERVIEW_STATUSES)[number];

export const interviewStatusEnum = z.nativeEnum(InterviewStatus);

export const TERMINAL_INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  InterviewStatus.PASSED,
  InterviewStatus.FAILED,
];

export const ACTIVE_INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  InterviewStatus.PENDING,
  InterviewStatus.RESCHEDULED,
];

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  [InterviewStatus.PENDING]: "Dijadwalkan",
  [InterviewStatus.RESCHEDULED]: "Dijadwalkan Ulang",
  [InterviewStatus.PASSED]: "Lolos",
  [InterviewStatus.FAILED]: "Tidak Lolos",
};

export const INTERVIEW_STATUS_BADGES: Record<
  InterviewStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  [InterviewStatus.PENDING]: {
    label: "Dijadwalkan",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  [InterviewStatus.RESCHEDULED]: {
    label: "Dijadwalkan Ulang",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  [InterviewStatus.PASSED]: {
    label: "Lolos",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  [InterviewStatus.FAILED]: {
    label: "Tidak Lolos",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
};

/**
 * Explicit state transition matrix based on PRD:
 * PENDING -> RESCHEDULED, PASSED, FAILED
 * RESCHEDULED -> RESCHEDULED, PASSED, FAILED
 * PASSED -> (none, terminal)
 * FAILED -> (none, terminal)
 */
export const VALID_INTERVIEW_TRANSITIONS: Record<
  InterviewStatus,
  readonly InterviewStatus[]
> = {
  [InterviewStatus.PENDING]: [
    InterviewStatus.RESCHEDULED,
    InterviewStatus.PASSED,
    InterviewStatus.FAILED,
  ],
  [InterviewStatus.RESCHEDULED]: [
    InterviewStatus.RESCHEDULED,
    InterviewStatus.PASSED,
    InterviewStatus.FAILED,
  ],
  [InterviewStatus.PASSED]: [],
  [InterviewStatus.FAILED]: [],
};

export function isValidInterviewTransition(
  current: InterviewStatus,
  next: InterviewStatus
): boolean {
  const allowed = VALID_INTERVIEW_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

export const createInterviewSchema = z.object({
  applicationId: z
    .string()
    .trim()
    .min(1, "Application ID is required."),
  scheduledAt: z
    .string()
    .trim()
    .min(1, "scheduledAt is required.")
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid scheduledAt format, must be a valid ISO date/datetime string.",
    }),
  method: z
    .string()
    .trim()
    .max(100, "Method cannot exceed 100 characters.")
    .nullable()
    .optional(),
  location: z
    .string()
    .trim()
    .max(255, "Location cannot exceed 255 characters.")
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes cannot exceed 2000 characters.")
    .nullable()
    .optional(),
});

export const updateInterviewSchema = z
  .object({
    scheduledAt: z
      .string()
      .trim()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid scheduledAt format, must be a valid ISO date/datetime string.",
      })
      .optional(),
    method: z
      .string()
      .trim()
      .max(100, "Method cannot exceed 100 characters.")
      .nullable()
      .optional(),
    location: z
      .string()
      .trim()
      .max(255, "Location cannot exceed 255 characters.")
      .nullable()
      .optional(),
    notes: z
      .string()
      .trim()
      .max(2000, "Notes cannot exceed 2000 characters.")
      .nullable()
      .optional(),
    status: z
      .enum(["RESCHEDULED"], {
        message:
          "General update only allows status RESCHEDULED. Result evaluation requires interview:result permission.",
      })
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for update."
  );

export const interviewResultSchema = z.object({
  status: z.enum(["PASSED", "FAILED"], {
    message: "Result status must be either PASSED or FAILED.",
  }),
  feedback: z
    .string()
    .trim()
    .max(2000, "Feedback cannot exceed 2000 characters.")
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes cannot exceed 2000 characters.")
    .nullable()
    .optional(),
});

export const interviewQuerySchema = z.object({
  applicationId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  vacancyId: z.string().trim().optional(),
  status: z
    .nativeEnum(InterviewStatus, {
      message: "Invalid status filter.",
    })
    .optional(),
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;
export type InterviewResultInput = z.infer<typeof interviewResultSchema>;
export type InterviewQueryInput = z.infer<typeof interviewQuerySchema>;
