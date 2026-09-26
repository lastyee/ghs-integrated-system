import { z } from "zod";
import { AssessmentType, AssessmentSessionStatus } from "@prisma/client";

export const assessmentCreateSchema = z.object({
  classId: z.string().trim().min(1, "Class ID is required"),
  subjectId: z.string().trim().min(1, "Subject ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().nullable().optional(),
  type: z.nativeEnum(AssessmentType),
  maxScore: z.number().finite().gt(0, "Maximum score must be greater than 0"),
  status: z.nativeEnum(AssessmentSessionStatus).default(AssessmentSessionStatus.OPEN).optional(),
});

export const assessmentUpdateSchema = z.object({
  classId: z.string().trim().min(1).optional(),
  subjectId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "Assessment name cannot be empty").optional(),
  description: z.string().trim().nullable().optional(),
  type: z.nativeEnum(AssessmentType).optional(),
  maxScore: z.number().finite().gt(0, "Maximum score must be greater than 0").optional(),
  status: z.nativeEnum(AssessmentSessionStatus).optional(),
});

export const scoreCreateSchema = z.object({
  studentId: z.string().trim().min(1, "Student ID is required"),
  score: z.number().finite().min(0, "Score cannot be less than 0"),
  feedback: z.string().trim().nullable().optional(),
});

export const scoreUpdateSchema = z.object({
  score: z.number().finite().min(0, "Score cannot be less than 0"),
  feedback: z.string().trim().nullable().optional(),
});

export function createAssessmentScoreSchema(maxScore: number) {
  return z.object({
    score: z
      .number()
      .finite()
      .min(0, "Score cannot be less than 0")
      .max(maxScore, `Score cannot exceed maximum score of ${maxScore}`),
  });
}