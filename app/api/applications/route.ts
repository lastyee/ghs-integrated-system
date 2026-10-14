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
    where: { deletedAt: null },
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

    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search")?.trim() || "";

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const rawStudentId = searchParams.get("studentId");
    const rawVacancyId = searchParams.get("vacancyId");
    const rawStatus = searchParams.get("status");

    const queryInput = {
      studentId: rawStudentId && rawStudentId !== "ALL" ? rawStudentId : undefined,
      vacancyId: rawVacancyId && rawVacancyId !== "ALL" ? rawVacancyId : undefined,
      status: rawStatus && rawStatus !== "ALL" ? rawStatus : undefined,
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

    const baseWhere: Prisma.ApplicationWhereInput = {
      deletedAt: null,
      student: { deletedAt: null },
      vacancy: { deletedAt: null, employer: { deletedAt: null } },
    };

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found for this user.");
      }

      // If student specifies studentId, enforce that it matches their own ID
      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError("Students cannot access applications of other students.");
      }

      baseWhere.studentId = student.id;
    } else {
      if (queryStudentId) {
        baseWhere.studentId = queryStudentId;
      }
    }

    if (vacancyId) {
      baseWhere.vacancyId = vacancyId;
    }

    const statsWhere: Prisma.ApplicationWhereInput = {
      ...baseWhere,
    };

    if (status) {
      baseWhere.status = status;
    }

    const searchWhere: Prisma.ApplicationWhereInput = searchStr
      ? {
          OR: [
            { notes: { contains: searchStr, mode: "insensitive" as const } },
            { student: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { student: { nim: { contains: searchStr, mode: "insensitive" as const } } },
            { vacancy: { title: { contains: searchStr, mode: "insensitive" as const } } },
            { vacancy: { employer: { name: { contains: searchStr, mode: "insensitive" as const } } } },
          ],
        }
      : {};

    const where: Prisma.ApplicationWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const [
      applications,
      total,
      totalStats,
      activeStats,
      appliedStats,
      screeningStats,
      interviewStats,
      selectedStats,
      closedStats,
      placementStats,
    ] = await prisma.$transaction([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        select: applicationListSelect,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.application.count({ where }),
      prisma.application.count({ where: statsWhere }),
      prisma.application.count({
        where: {
          ...statsWhere,
          status: { in: ["APPLIED", "SCREENING", "INTERVIEW"] },
        },
      }),
      prisma.application.count({
        where: { ...statsWhere, status: "APPLIED" },
      }),
      prisma.application.count({
        where: { ...statsWhere, status: "SCREENING" },
      }),
      prisma.application.count({
        where: { ...statsWhere, status: "INTERVIEW" },
      }),
      prisma.application.count({
        where: { ...statsWhere, status: "SELECTED" },
      }),
      prisma.application.count({
        where: {
          ...statsWhere,
          status: { in: ["REJECTED", "WITHDRAWN"] },
        },
      }),
      prisma.application.count({
        where: {
          ...statsWhere,
          placement: { isNot: null, is: { deletedAt: null } },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return Response.json(
      {
        data: applications,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        stats: {
          total: totalStats,
          active: activeStats,
          applied: appliedStats,
          screening: screeningStats,
          interview: interviewStats,
          selected: selectedStats,
          closed: closedStats,
          placement: placementStats,
        },
      },
      { status: 200 }
    );
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
      where: { id: data.vacancyId, deletedAt: null, employer: { is: { deletedAt: null } } },
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
        where: { id: data.studentId, deletedAt: null },
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
    { message: "Method Not Allowed. Delete applications by ID." },
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
