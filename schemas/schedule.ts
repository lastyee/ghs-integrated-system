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
