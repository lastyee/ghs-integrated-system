import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  ACTIVE_APPLICATION_STATUSES,
  applicationQuerySchema,
  createApplicationSchema,
} from "@/schemas/application";

const prisma = new PrismaClient();

class BusinessConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessConflictError";
  }
}

export const applicationListSelect = {
  id: true,
  studentId: true,
  vacancyId: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
    },
  },
  vacancy: {
    select: {
      id: true,
      title: true,
      status: true,
      employer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} as const;

export const applicationDetailSelect = {
  id: true,
  studentId: true,
  vacancyId: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
      phone: true,
      address: true,
      userId: true,
    },
  },
  vacancy: {
    select: {
      id: true,
      title: true,
      description: true,
      requirements: true,
      status: true,
      employer: {
        select: {
          id: true,
          name: true,
          companyInfo: true,
          address: true,
        },
      },
    },
  },
  interviews: {
    select: {
      id: true,
      scheduledAt: true,
      method: true,
      location: true,
      status: true,
      notes: true,
      feedback: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      scheduledAt: "desc" as const,
    },
  },
  placement: {
    select: {
      id: true,
      position: true,
      startDate: true,
      status: true,
      notes: true,
      employer: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const authenticatedUser = await requirePermission("application:read");
    const { searchParams } = new URL(request.url);

    const queryInput = {
      studentId: searchParams.get("studentId") || undefined,
      vacancyId: searchParams.get("vacancyId") || undefined,
      status: searchParams.get("status") || undefined,
    };

    const parsedQuery = applicationQuerySchema.safeParse(queryInput);
    if (!parsedQuery.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsedQuery.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { studentId: queryStudentId, vacancyId, status } = parsedQuery.data;

    const where: Prisma.ApplicationWhereInput = {};

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found for this user.");
      }

      // If student specifies studentId, enforce that it matches their own ID
      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError("Students cannot access applications of other students.");
      }

      where.studentId = student.id;
    } else {
      if (queryStudentId) {
        where.studentId = queryStudentId;
      }
    }

    if (vacancyId) {
      where.vacancyId = vacancyId;
    }

    if (status) {
      where.status = status;
    }

    const applications = await prisma.application.findMany({
      where,
      select: applicationListSelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json(applications, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/applications error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("application:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = createApplicationSchema.safeParse(body);
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

    // Validate that Vacancy exists and is OPEN
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: data.vacancyId },
      select: { id: true, status: true, title: true },
    });

    if (!vacancy) {
      return Response.json(
        { message: "Vacancy not found." },
        { status: 404 }
      );
    }

    if (vacancy.status !== "OPEN") {
      return Response.json(
        { message: "Cannot apply to a closed vacancy." },
        { status: 409 }
      );
    }

    // Resolve studentId securely based on role
    let resolvedStudentId: string;

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student) {
        return Response.json(
          { message: "Student profile not found for this user." },
          { status: 403 }
        );
      }

      resolvedStudentId = student.id;
    } else {
      // Staff / Admin roles creating on behalf of a student
      if (!data.studentId) {
        return Response.json(
          { message: "Student ID is required for staff application creation." },
          { status: 400 }
        );
      }

      const targetStudent = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: { id: true },
      });

      if (!targetStudent) {
        return Response.json(
          { message: "Student not found." },
          { status: 404 }
        );
      }

      resolvedStudentId = targetStudent.id;
    }

    // Execute duplicate check & creation within transaction
    try {
      const newApplication = await prisma.$transaction(async (tx) => {
        // Concurrency-safe duplicate check: check existing application for this student & vacancy
        const existing = await tx.application.findFirst({
          where: {
            studentId: resolvedStudentId,
            vacancyId: data.vacancyId,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (existing) {
          if (ACTIVE_APPLICATION_STATUSES.includes(existing.status)) {
            throw new BusinessConflictError(
              "An active application already exists for this vacancy."
            );
          } else {
            throw new BusinessConflictError(
              `An application already exists for this vacancy with status ${existing.status}. Re-application policy is pending confirmation.`
            );
          }
        }

        const created = await tx.application.create({
          data: {
            studentId: resolvedStudentId,
            vacancyId: data.vacancyId,
            status: "APPLIED",
            notes: data.notes?.trim() || null,
          },
          select: applicationDetailSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: "CREATE",
          entity: "Application",
          entityId: created.id,
          changes: {
            studentId: created.studentId,
            vacancyId: created.vacancyId,
            status: created.status,
            notes: created.notes,
          },
        });

        return created;
      });

      return Response.json(newApplication, { status: 201 });
    } catch (txError) {
      if (txError instanceof BusinessConflictError) {
        return Response.json(
          { message: txError.message },
          { status: 409 }
        );
      }
      throw txError;
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("POST /api/applications error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Application deletion is not permitted." },
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
