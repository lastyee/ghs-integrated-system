import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { assessmentUpdateSchema } from "@/schemas/assessment";
import { assessmentSelect } from "@/app/api/assessments/route";

const prisma = new PrismaClient();

const scoreIncludeSelect = {
  id: true,
  assessmentId: true,
  studentId: true,
  score: true,
  feedback: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
    },
  },
} as const;

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const authenticatedUser = await requirePermission("assessment:read");

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      select: assessmentSelect,
    });

    if (!assessment) {
      return Response.json(
        { message: "Assessment not found." },
        { status: 404 }
      );
    }

    let scores;
    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError();
      }

      scores = await prisma.assessmentScore.findMany({
        where: {
          assessmentId: id,
          studentId: student.id,
        },
        select: scoreIncludeSelect,
      });
    } else {
      scores = await prisma.assessmentScore.findMany({
        where: { assessmentId: id },
        select: scoreIncludeSelect,
        orderBy: {
          student: {
            name: "asc",
          },
        },
      });
    }

    return Response.json(
      {
        ...assessment,
        scores,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const authenticatedUser = await requirePermission("assessment:update");

    if (authenticatedUser.role !== "SUPER_ADMIN" && authenticatedUser.role !== "ADMIN") {
      throw new ForbiddenError();
    }

    const existing = await prisma.assessment.findUnique({
      where: { id },
    });

    if (!existing) {
      return Response.json(
        { message: "Assessment not found." },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = assessmentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.classId) {
      const classRecord = await prisma.class.findUnique({
        where: { id: data.classId },
        select: { id: true },
      });
      if (!classRecord) {
        return Response.json(
          { message: "Class not found." },
          { status: 404 }
        );
      }
    }

    if (data.subjectId) {
      const subjectRecord = await prisma.subject.findUnique({
        where: { id: data.subjectId },
        select: { id: true },
      });
      if (!subjectRecord) {
        return Response.json(
          { message: "Subject not found." },
          { status: 404 }
        );
      }
    }

    // Step 66C: Max score data integrity hardening.
    // maxScore cannot be lowered below any existing student score for this assessment.
    if (data.maxScore !== undefined) {
      const maxScoreAggregate = await prisma.assessmentScore.aggregate({
        where: { assessmentId: id },
        _max: { score: true },
      });
      const highestScore = maxScoreAggregate._max.score;
      if (highestScore !== null && highestScore !== undefined && data.maxScore < highestScore) {
        return Response.json(
          {
            message: "Maximum score cannot be lower than an existing score.",
            errors: {
              maxScore: [`Maximum score cannot be lower than an existing score of ${highestScore}.`],
            },
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.assessment.update({
        where: { id },
        data: {
          classId: data.classId ?? undefined,
          subjectId: data.subjectId ?? undefined,
          name: data.name ?? undefined,
          description: data.description !== undefined ? data.description : undefined,
          type: data.type ?? undefined,
          maxScore: data.maxScore ?? undefined,
          status: data.status ?? undefined,
        },
        select: assessmentSelect,
      });

      await createAuditLog(
        tx,
        authenticatedUser,
        {
          action: "UPDATE",
          entity: "Assessment",
          entityId: id,
          changes: {
            before: {
              classId: existing.classId,
              subjectId: existing.subjectId,
              name: existing.name,
              description: existing.description,
              type: existing.type,
              maxScore: existing.maxScore,
              status: existing.status,
            },
            after: {
              classId: result.classId,
              subjectId: result.subjectId,
              name: result.name,
              description: result.description,
              type: result.type,
              maxScore: result.maxScore,
              status: result.status,
            },
          },
        }
      );

      return result;
    });

    return Response.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Assessment deletion is not supported." },
    { status: 405, headers: { Allow: "GET, PATCH" } }
  );
}
