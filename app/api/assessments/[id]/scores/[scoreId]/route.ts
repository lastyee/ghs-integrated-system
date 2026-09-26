import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { scoreUpdateSchema } from "@/schemas/assessment";

const prisma = new PrismaClient();

const scoreDetailSelect = {
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
  props: { params: Promise<{ id: string; scoreId: string }> }
) {
  try {
    const { id, scoreId } = await props.params;
    const authenticatedUser = await requirePermission("assessment:read");

    const score = await prisma.assessmentScore.findUnique({
      where: { id: scoreId },
      select: scoreDetailSelect,
    });

    if (!score || score.assessmentId !== id) {
      return Response.json(
        { message: "Score not found for the specified assessment." },
        { status: 404 }
      );
    }

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student || student.id !== score.studentId) {
        throw new ForbiddenError();
      }
    }

    return Response.json(score, { status: 200 });
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
  props: { params: Promise<{ id: string; scoreId: string }> }
) {
  try {
    const { id, scoreId } = await props.params;
    const authenticatedUser = await requirePermission("assessment:update");

    if (authenticatedUser.role !== "SUPER_ADMIN" && authenticatedUser.role !== "ADMIN") {
      throw new ForbiddenError();
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      select: { id: true, maxScore: true },
    });

    if (!assessment) {
      return Response.json(
        { message: "Assessment not found." },
        { status: 404 }
      );
    }

    // Step 66C: Per GHS policy, score correction is NOT locked when assessment status is COMPLETED
    // because finalization/lock policy is currently TBD in official GHS regulations.

    const existingScore = await prisma.assessmentScore.findUnique({
      where: { id: scoreId },
    });

    if (!existingScore) {
      return Response.json(
        { message: "Score not found." },
        { status: 404 }
      );
    }

    // Crucial check: prevent IDOR/cross-assessment corruption
    if (existingScore.assessmentId !== id) {
      return Response.json(
        { message: "Score does not belong to the specified assessment." },
        { status: 400 }
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

    const parsed = scoreUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { score, feedback } = parsed.data;

    // Dynamic validation against assessment maxScore
    if (score < 0 || score > assessment.maxScore) {
      return Response.json(
        {
          message: `Score must be between 0 and ${assessment.maxScore}.`,
          errors: {
            score: [`Score must be between 0 and ${assessment.maxScore}.`],
          },
        },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.assessmentScore.update({
        where: { id: scoreId },
        data: {
          score,
          feedback: feedback !== undefined ? feedback : existingScore.feedback,
        },
        select: scoreDetailSelect,
      });

      await createAuditLog(
        tx,
        authenticatedUser,
        {
          action: "UPDATE",
          entity: "AssessmentScore",
          entityId: scoreId,
          changes: {
            assessmentId: id,
            studentId: existingScore.studentId,
            before: {
              score: existingScore.score,
              feedback: existingScore.feedback,
            },
            after: {
              score: result.score,
              feedback: result.feedback,
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
    { message: "Method Not Allowed. Score deletion is not supported." },
    { status: 405, headers: { Allow: "GET, PATCH" } }
  );
}
