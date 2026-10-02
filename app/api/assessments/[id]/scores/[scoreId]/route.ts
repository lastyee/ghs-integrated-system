import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireInstructorClassAccess } from "@/lib/instructor-ownership";
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
    const assessment = await prisma.assessment.findFirst({
      where: {
        id,
        deletedAt: null,
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        subject: { deletedAt: null },
      },
      select: { id: true, classId: true },
    });

    if (!assessment) {
      return Response.json(
        { message: "Assessment not found." },
        { status: 404 }
      );
    }

    const score = await prisma.assessmentScore.findFirst({
      where: { id: scoreId, assessmentId: id, deletedAt: null, student: { deletedAt: null } },
      select: scoreDetailSelect,
    });

    if (!score) {
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
    } else if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorClassAccess(authenticatedUser, assessment.classId);
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

    if (
      authenticatedUser.role !== "SUPER_ADMIN" &&
      authenticatedUser.role !== "ADMIN" &&
      authenticatedUser.role !== "INSTRUCTOR"
    ) {
      throw new ForbiddenError();
    }

    const assessment = await prisma.assessment.findFirst({
      where: {
        id,
        deletedAt: null,
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        subject: { deletedAt: null },
      },
      select: { id: true, maxScore: true, classId: true },
    });

    if (!assessment) {
      return Response.json(
        { message: "Assessment not found." },
        { status: 404 }
      );
    }
    if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorClassAccess(authenticatedUser, assessment.classId);
    }

    // Step 66C: Per GHS policy, score correction is NOT locked when assessment status is COMPLETED
    // because finalization/lock policy is currently TBD in official GHS regulations.

    const existingScore = await prisma.assessmentScore.findFirst({
      where: { id: scoreId, assessmentId: id, deletedAt: null, student: { deletedAt: null } },
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

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string; scoreId: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("assessment-score:delete");
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new ForbiddenError();
    }

    const { id, scoreId } = await props.params;
    if (!id.trim() || !scoreId.trim()) {
      return Response.json({ message: "Invalid assessment score ID." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const assessment = await transaction.assessment.findFirst({
        where: {
          id,
          deletedAt: null,
          class: {
            deletedAt: null,
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          },
          subject: { deletedAt: null },
        },
        select: { id: true, classId: true },
      });
      if (!assessment) return { kind: "not-found" as const };

      const score = await transaction.assessmentScore.findFirst({
        where: { id: scoreId, assessmentId: id, deletedAt: null },
        select: { id: true },
      });
      if (!score) return { kind: "not-found" as const };

      const deletedAt = new Date();
      await transaction.assessmentScore.update({
        where: { id: score.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "AssessmentScore",
        entityId: score.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });
      return { kind: "deleted" as const, id: score.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ message: "Assessment score not found." }, { status: 404 });
    }
    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("Failed to soft-delete assessment score", error);
    return Response.json({ message: "Unable to delete assessment score." }, { status: 500 });
  }
}
