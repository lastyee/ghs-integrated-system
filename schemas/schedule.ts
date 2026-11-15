import { z } from "zod";

const scheduleDateTimeSchema = z.string().datetime({ offset: true });

export const scheduleCreateSchema = z
  .object({
    classId: z.string(),
    subjectId: z.string(),
    instructorId: z.string(),
    date: scheduleDateTimeSchema,
    startTime: scheduleDateTimeSchema,
    endTime: scheduleDateTimeSchema,
    room: z.string().nullable().optional(),
    dressCode: z.string().nullable().optional(),
    topic: z.string().nullable().optional(),
  })
  .strict();

export const scheduleUpdateSchema = scheduleCreateSchema
  .extend({
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  })
  .partial()
  .strict();

/**
 * Normalizes ISO datetime strings to a consistent UTC Date representation
 * of the local wall-clock time in Indonesia (Asia/Jakarta).
 *
 * Prevents timezone offset skew where e.g. 10:00 becomes 15:00 or 03:00.
 */
export function normalizeScheduleDateTime(isoString: string): Date {
  const clean = isoString.trim();
  const dateMatch = clean.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    return new Date(`${dateMatch[1]}T00:00:00.000Z`);
  }

  const match = clean.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)/);
  if (match) {
    const datePart = match[1];
    let timePart = match[2];
    if (timePart.length === 5) timePart = `${timePart}:00.000Z`;
    else if (timePart.length === 8) timePart = `${timePart}.000Z`;
    else if (!timePart.endsWith("Z")) timePart = `${timePart}Z`;
    return new Date(`${datePart}T${timePart}`);
  }

  return new Date(clean);
}
