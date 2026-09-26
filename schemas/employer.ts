import { z } from "zod";

export const createEmployerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Employer name is required.")
    .max(200, "Employer name must be 200 characters or fewer."),
  companyInfo: z
    .string()
    .trim()
    .max(2000, "Company info must be 2000 characters or fewer.")
    .nullable()
    .optional(),
  address: z
    .string()
    .trim()
    .max(500, "Address must be 500 characters or fewer.")
    .nullable()
    .optional(),
  contactName: z
    .string()
    .trim()
    .max(100, "Contact name must be 100 characters or fewer.")
    .nullable()
    .optional(),
  contactEmail: z
    .union([
      z.string().trim().email("Invalid email address format."),
      z.literal("").transform(() => null),
      z.null(),
      z.undefined(),
    ])
    .optional(),
  contactPhone: z
    .string()
    .trim()
    .max(50, "Contact phone must be 50 characters or fewer.")
    .nullable()
    .optional(),
});

export const updateEmployerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Employer name cannot be empty.")
      .max(200, "Employer name must be 200 characters or fewer.")
      .optional(),
    companyInfo: z
      .string()
      .trim()
      .max(2000, "Company info must be 2000 characters or fewer.")
      .nullable()
      .optional(),
    address: z
      .string()
      .trim()
      .max(500, "Address must be 500 characters or fewer.")
      .nullable()
      .optional(),
    contactName: z
      .string()
      .trim()
      .max(100, "Contact name must be 100 characters or fewer.")
      .nullable()
      .optional(),
    contactEmail: z
      .union([
        z.string().trim().email("Invalid email address format."),
        z.literal("").transform(() => null),
        z.null(),
        z.undefined(),
      ])
      .optional(),
    contactPhone: z
      .string()
      .trim()
      .max(50, "Contact phone must be 50 characters or fewer.")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for update."
  );

export const employerQuerySchema = z.object({
  search: z.string().trim().optional(),
  name: z.string().trim().optional(),
});

export type CreateEmployerInput = z.infer<typeof createEmployerSchema>;
export type UpdateEmployerInput = z.infer<typeof updateEmployerSchema>;
