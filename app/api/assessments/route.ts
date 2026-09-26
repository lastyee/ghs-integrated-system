import { AssessmentType, AssessmentSessionStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { assessmentCreateSchema } from "@/schemas/assessment";

const prisma = new PrismaClient();

export const assessmentSelect = {
  id: true,
  classId: true,
  subjectId: true,
  name: true,
  description: true,
  type: true,
  maxScore: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  class: {
    select: {
      id: true,
      name: true,
      batch: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  subject: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    await requirePermission("assessment:read");
    const { searchParams } = new URL(request.url);

    const queryClassId = searchParams.get("classId");
    const querySubjectId = searchParams.get("subjectId");
    const queryType = searchParams.get("type");
    const queryStatus = searchParams.get("status");

    const where: Prisma.AssessmentWhereInput = {};

    if (queryClassId) {
      where.classId = queryClassId;
    }

    if (querySubjectId) {
      where.subjectId = querySubjectId;
    }

    if (queryType && Object.values(AssessmentType).includes(queryType as AssessmentType)) {
      where.type = queryType as AssessmentType;
    }

    if (queryStatus && Object.values(AssessmentSessionStatus).includes(queryStatus as AssessmentSessionStatus)) {
      where.status = queryStatus as AssessmentSessionStatus;
    }

    const assessments = await prisma.assessment.findMany({
      where,
      select: {
        ...assessmentSelect,
        _count: {
          select: {
            scores: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json(assessments, { status: 200 });
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

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("assessment:create");

    if (authenticatedUser.role !== "SUPER_ADMIN" && authenticatedUser.role !== "ADMIN") {
      throw new ForbiddenError();
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

    const parsed = assessmentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { classId, subjectId, name, description, type, maxScore, status } = parsed.data;

    // Validate Class exists
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });
    if (!classRecord) {
      return Response.json(
        { message: "Class not found." },
        { status: 404 }
      );
    }

    // Validate Subject exists
    const subjectRecord = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!subjectRecord) {
      return Response.json(
        { message: "Subject not found." },
        { status: 404 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const assessment = await tx.assessment.create({
        data: {
          classId,
          subjectId,
          name,
          description: description ?? null,
          type,
          maxScore,
          status: status ?? AssessmentSessionStatus.OPEN,
        },
        select: assessmentSelect,
      });

      await createAuditLog(
        tx,
        authenticatedUser,
        {
          action: "CREATE",
          entity: "Assessment",
          entityId: assessment.id,
          changes: {
            classId: assessment.classId,
            subjectId: assessment.subjectId,
            name: assessment.name,
            type: assessment.type,
            maxScore: assessment.maxScore,
            status: assessment.status,
          },
        }
      );

      return assessment;
    });

    return Response.json(created, { status: 201 });
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
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
