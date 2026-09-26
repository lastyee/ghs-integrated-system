import { z } from "zod";

export const VACANCY_STATUSES = ["OPEN", "CLOSED"] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

export const createVacancySchema = z.object({
  employerId: z
    .string()
    .trim()
    .min(1, "Employer ID is required."),
  title: z
    .string()
    .trim()
    .min(1, "Vacancy title is required.")
    .max(200, "Vacancy title must be 200 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(1, "Vacancy description is required."),
  requirements: z
    .string()
    .trim()
    .min(1, "Vacancy requirements are required."),
  status: z
    .enum(VACANCY_STATUSES, {
      message: "Status must be either OPEN or CLOSED.",
    })
    .default("OPEN"),
});

export const updateVacancySchema = z
  .object({
    employerId: z
      .string()
      .trim()
      .min(1, "Employer ID cannot be empty.")
      .optional(),
    title: z
      .string()
      .trim()
      .min(1, "Vacancy title cannot be empty.")
      .max(200, "Vacancy title must be 200 characters or fewer.")
      .optional(),
    description: z
      .string()
      .trim()
      .min(1, "Vacancy description cannot be empty.")
      .optional(),
    requirements: z
      .string()
      .trim()
      .min(1, "Vacancy requirements cannot be empty.")
      .optional(),
    status: z
      .enum(VACANCY_STATUSES, {
        message: "Status must be either OPEN or CLOSED.",
      })
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for update."
  );

export const vacancyQuerySchema = z.object({
  employerId: z.string().trim().optional(),
  status: z
    .enum(VACANCY_STATUSES, {
      message: "Status filter must be either OPEN or CLOSED.",
    })
    .optional(),
});

export type CreateVacancyInput = z.infer<typeof createVacancySchema>;
export type UpdateVacancyInput = z.infer<typeof updateVacancySchema>;
export type VacancyQueryInput = z.infer<typeof vacancyQuerySchema>;
