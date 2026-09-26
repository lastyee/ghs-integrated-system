import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";

export const VALID_APPLICATION_STATUSES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "SELECTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type ApplicationStatusValue = (typeof VALID_APPLICATION_STATUSES)[number];

export const ACTIVE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.APPLIED,
  ApplicationStatus.SCREENING,
  ApplicationStatus.INTERVIEW,
];

export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.SELECTED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.APPLIED]: "Diajukan",
  [ApplicationStatus.SCREENING]: "Screening",
  [ApplicationStatus.INTERVIEW]: "Interview",
  [ApplicationStatus.SELECTED]: "Terpilih",
  [ApplicationStatus.REJECTED]: "Ditolak",
  [ApplicationStatus.WITHDRAWN]: "Ditarik",
};

export const APPLICATION_STATUS_BADGES: Record<
  ApplicationStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  [ApplicationStatus.APPLIED]: {
    label: "Diajukan",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  [ApplicationStatus.SCREENING]: {
    label: "Screening",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  [ApplicationStatus.INTERVIEW]: {
    label: "Interview",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
  },
  [ApplicationStatus.SELECTED]: {
    label: "Terpilih",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  [ApplicationStatus.REJECTED]: {
    label: "Ditolak",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  [ApplicationStatus.WITHDRAWN]: {
    label: "Ditarik",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
};

/**
 * Explicit state transition matrix based on PRD:
 * APPLIED -> SCREENING, WITHDRAWN
 * SCREENING -> INTERVIEW, REJECTED
 * INTERVIEW -> SELECTED, REJECTED
 * SELECTED -> (none, terminal)
 * REJECTED -> (none, terminal)
 * WITHDRAWN -> (none, terminal)
 */
export const VALID_APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  [ApplicationStatus.APPLIED]: [
    ApplicationStatus.SCREENING,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.SCREENING]: [
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.INTERVIEW]: [
    ApplicationStatus.SELECTED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.SELECTED]: [],
  [ApplicationStatus.REJECTED]: [],
  [ApplicationStatus.WITHDRAWN]: [],
};

export function isValidApplicationTransition(
  current: ApplicationStatus,
  next: ApplicationStatus
): boolean {
  const allowed = VALID_APPLICATION_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

export const createApplicationSchema = z.object({
  vacancyId: z
    .string()
    .trim()
    .min(1, "Vacancy ID is required."),
  studentId: z
    .string()
    .trim()
    .min(1, "Student ID cannot be empty.")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes cannot exceed 1000 characters.")
    .nullable()
    .optional(),
});

export const updateApplicationSchema = z
  .object({
    status: z
      .nativeEnum(ApplicationStatus, {
        message: "Invalid application status.",
      })
      .optional(),
    notes: z
      .string()
      .trim()
      .max(1000, "Notes cannot exceed 1000 characters.")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for update."
  );

export const applicationQuerySchema = z.object({
  studentId: z.string().trim().optional(),
  vacancyId: z.string().trim().optional(),
  status: z
    .nativeEnum(ApplicationStatus, {
      message: "Invalid status filter.",
    })
    .optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ApplicationQueryInput = z.infer<typeof applicationQuerySchema>;
