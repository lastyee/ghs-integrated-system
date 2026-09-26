import { z } from "zod";
import { PlacementStatus } from "@prisma/client";

export const VALID_PLACEMENT_STATUSES = [
  "PREPARATION",
  "READY",
  "DEPARTED",
  "PLACED",
  "CANCELLED",
] as const;

export type PlacementStatusValue = (typeof VALID_PLACEMENT_STATUSES)[number];

export const placementStatusEnum = z.nativeEnum(PlacementStatus);

export const TERMINAL_PLACEMENT_STATUSES: readonly PlacementStatus[] = [
  PlacementStatus.PLACED,
  PlacementStatus.CANCELLED,
];

export const ACTIVE_PLACEMENT_STATUSES: readonly PlacementStatus[] = [
  PlacementStatus.PREPARATION,
  PlacementStatus.READY,
  PlacementStatus.DEPARTED,
];

export const PLACEMENT_STATUS_LABELS: Record<PlacementStatus, string> = {
  [PlacementStatus.PREPARATION]: "Persiapan",
  [PlacementStatus.READY]: "Siap Berangkat",
  [PlacementStatus.DEPARTED]: "Berangkat",
  [PlacementStatus.PLACED]: "Ditempatkan",
  [PlacementStatus.CANCELLED]: "Dibatalkan",
};

export const PLACEMENT_STATUS_BADGES: Record<
  PlacementStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  [PlacementStatus.PREPARATION]: {
    label: "Persiapan",
    bg: "bg-[#e7eef5]",
    text: "text-[#123b63]",
    border: "border-slate-200",
  },
  [PlacementStatus.READY]: {
    label: "Siap Berangkat",
    bg: "bg-[#fff6d9]",
    text: "text-[#a57c00]",
    border: "border-amber-200",
  },
  [PlacementStatus.DEPARTED]: {
    label: "Berangkat",
    bg: "bg-[#e8f2f8]",
    text: "text-[#357092]",
    border: "border-sky-200",
  },
  [PlacementStatus.PLACED]: {
    label: "Ditempatkan",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  [PlacementStatus.CANCELLED]: {
    label: "Dibatalkan",
    bg: "bg-[#fbeaea]",
    text: "text-[#c94242]",
    border: "border-rose-200",
  },
};

/**
 * Explicit state transition matrix based on PRD:
 * PREPARATION -> READY, CANCELLED
 * READY -> DEPARTED, CANCELLED
 * DEPARTED -> PLACED
 * PLACED -> (none, terminal)
 * CANCELLED -> (none, terminal)
 */
export const VALID_PLACEMENT_TRANSITIONS: Record<
  PlacementStatus,
  readonly PlacementStatus[]
> = {
  [PlacementStatus.PREPARATION]: [
    PlacementStatus.READY,
    PlacementStatus.CANCELLED,
  ],
  [PlacementStatus.READY]: [
    PlacementStatus.DEPARTED,
    PlacementStatus.CANCELLED,
  ],
  [PlacementStatus.DEPARTED]: [
    PlacementStatus.PLACED,
  ],
  [PlacementStatus.PLACED]: [],
  [PlacementStatus.CANCELLED]: [],
};

export function isValidPlacementTransition(
  current: PlacementStatus,
  next: PlacementStatus
): boolean {
  const allowed = VALID_PLACEMENT_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

export const createPlacementSchema = z.object({
  studentId: z
    .string()
    .trim()
    .min(1, "Student ID is required."),
  employerId: z
    .string()
    .trim()
    .min(1, "Employer ID is required."),
  position: z
    .string()
    .trim()
    .min(1, "Position is required.")
    .max(255, "Position cannot exceed 255 characters."),
  vacancyId: z
    .string()
    .trim()
    .min(1, "Vacancy ID cannot be empty.")
    .nullable()
    .optional(),
  applicationId: z
    .string()
    .trim()
    .min(1, "Application ID cannot be empty.")
    .nullable()
    .optional(),
  startDate: z
    .string()
    .trim()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid startDate format, must be a valid ISO date/datetime string.",
    })
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes cannot exceed 2000 characters.")
    .nullable()
    .optional(),
  status: z
    .enum(["PREPARATION"], {
      message:
        "Initial placement status must always be PREPARATION. Status cannot be set by client on creation.",
    })
    .optional(),
  createdAt: z.never().optional(),
  updatedAt: z.never().optional(),
});

export const updatePlacementSchema = z
  .object({
    position: z
      .string()
      .trim()
      .min(1, "Position cannot be empty.")
      .max(255, "Position cannot exceed 255 characters.")
      .optional(),
    startDate: z
      .string()
      .trim()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid startDate format, must be a valid ISO date/datetime string.",
      })
      .nullable()
      .optional(),
    notes: z
      .string()
      .trim()
      .max(2000, "Notes cannot exceed 2000 characters.")
      .nullable()
      .optional(),
    studentId: z.never().optional(),
    employerId: z.never().optional(),
    applicationId: z.never().optional(),
    vacancyId: z.never().optional(),
    status: z.never().optional(),
    createdAt: z.never().optional(),
    updatedAt: z.never().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for operational update."
  );

export const updatePlacementStatusSchema = z.object({
  status: z.nativeEnum(PlacementStatus, {
    message: "Invalid placement status value.",
  }),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes cannot exceed 2000 characters.")
    .nullable()
    .optional(),
  position: z.never().optional(),
  startDate: z.never().optional(),
  studentId: z.never().optional(),
  employerId: z.never().optional(),
  applicationId: z.never().optional(),
  vacancyId: z.never().optional(),
  createdAt: z.never().optional(),
  updatedAt: z.never().optional(),
});

export const placementQuerySchema = z.object({
  studentId: z.string().trim().optional(),
  employerId: z.string().trim().optional(),
  vacancyId: z.string().trim().optional(),
  applicationId: z.string().trim().optional(),
  status: z
    .nativeEnum(PlacementStatus, {
      message: "Invalid status filter.",
    })
    .optional(),
});

export type CreatePlacementInput = z.infer<typeof createPlacementSchema>;
export type UpdatePlacementInput = z.infer<typeof updatePlacementSchema>;
export type UpdatePlacementStatusInput = z.infer<typeof updatePlacementStatusSchema>;
export type PlacementQueryInput = z.infer<typeof placementQuerySchema>;
