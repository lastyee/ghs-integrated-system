import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  requireInstructorClassAccess,
  requireLinkedInstructor,
} from "@/lib/instructor-ownership";
import { scoreCreateSchema } from "@/schemas/assessment";

const prisma = new PrismaClient();

const scoreSelect = {
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
    if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorClassAccess(authenticatedUser, assessment.classId);
    }

    const { searchParams } = new URL(request.url);
    const queryStudentId = searchParams.get("studentId");

    const where: Prisma.AssessmentScoreWhereInput = {
      assessmentId: id,
      deletedAt: null,
      student: { deletedAt: null },
    };

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError();
      }

      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError();
      }

      where.studentId = student.id;
    } else {
      if (queryStudentId) {
        where.studentId = queryStudentId;
      }
    }

    if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      where.assessment = {
        deletedAt: null,
        class: { instructorId: instructor.id, deletedAt: null },
      };
    }

    const scores = await prisma.assessmentScore.findMany({
      where,
      select: scoreSelect,
      orderBy: {
        student: {
          name: "asc",
        },
      },
    });

    return Response.json(scores, { status: 200 });
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

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
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
      select: {
        id: true,
        classId: true,
        maxScore: true,
        class: {
          select: {
            batchId: true,
          },
        },
      },
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

    // Step 66C: Per GHS policy, score entry is NOT locked when assessment status is COMPLETED
    // because finalization/lock policy is currently TBD in official GHS regulations.

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = scoreCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { studentId, score, feedback } = parsed.data;

    // Dynamic maxScore validation against assessment.maxScore
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

    // Validate student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, deletedAt: true },
    });

    if (!student || student.deletedAt) {
      return Response.json(
        { message: "Student not found." },
        { status: 404 }
      );
    }

    // Relational consistency: Student must be enrolled in the batch for this assessment's class
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
        batchId: assessment.class.batchId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!enrollment) {
      return Response.json(
        { message: "Student is not enrolled in the batch for this assessment's class." },
        { status: 400 }
      );
    }

    // Check duplicate
    const existingScore = await prisma.assessmentScore.findUnique({
      where: {
        assessmentId_studentId: {
          assessmentId: id,
          studentId,
        },
      },
    });

    if (existingScore) {
      return Response.json(
        { message: "Score already exists for this student on this assessment." },
        { status: 409 }
      );
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const result = await tx.assessmentScore.create({
          data: {
            assessmentId: id,
            studentId,
            score,
            feedback: feedback ?? null,
          },
          select: scoreSelect,
        });

        await createAuditLog(
          tx,
          authenticatedUser,
          {
            action: "CREATE",
            entity: "AssessmentScore",
            entityId: result.id,
            changes: {
              assessmentId: id,
              studentId,
              score,
              feedback,
            },
          }
        );

        return result;
      });

      return Response.json(created, { status: 201 });
    } catch (dbError) {
      if (
        dbError instanceof Prisma.PrismaClientKnownRequestError &&
        dbError.code === "P2002"
      ) {
        return Response.json(
          { message: "Score already exists for this student on this assessment." },
          { status: 409 }
        );
      }
      throw dbError;
    }
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
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
