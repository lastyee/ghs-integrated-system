import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  createInterviewSchema,
  interviewQuerySchema,
} from "@/schemas/interview";

const prisma = new PrismaClient();

export const interviewListSelect = {
  id: true,
  applicationId: true,
  scheduledAt: true,
  method: true,
  location: true,
  status: true,
  notes: true,
  feedback: true,
  createdAt: true,
  updatedAt: true,
  application: {
    select: {
      id: true,
      status: true,
      studentId: true,
      vacancyId: true,
      student: {
        select: {
          id: true,
          nim: true,
          name: true,
          userId: true,
        },
      },
      vacancy: {
        select: {
          id: true,
          title: true,
          employerId: true,
          employer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} as const;

export const interviewDetailSelect = {
  id: true,
  applicationId: true,
  scheduledAt: true,
  method: true,
  location: true,
  status: true,
  notes: true,
  feedback: true,
  createdAt: true,
  updatedAt: true,
  application: {
    select: {
      id: true,
      status: true,
      notes: true,
      studentId: true,
      vacancyId: true,
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
          employerId: true,
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
    },
  },
} as const;

export function sanitizeInterviewForRole<T extends { feedback?: string | null }>(
  interview: T,
  role: string
): Omit<T, "feedback"> | T {
  if (role === "STUDENT") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { feedback, ...safe } = interview;
    return safe;
  }
  return interview;
}

export async function GET(request: Request) {
  try {
    const authenticatedUser = await requirePermission("interview:read");
    const { searchParams } = new URL(request.url);

    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search")?.trim() || "";

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const rawAppId = searchParams.get("applicationId");
    const rawStudentId = searchParams.get("studentId");
    const rawVacancyId = searchParams.get("vacancyId");
    const rawStatus = searchParams.get("status");

    const queryInput = {
      applicationId: rawAppId && rawAppId !== "ALL" ? rawAppId : undefined,
      studentId: rawStudentId && rawStudentId !== "ALL" ? rawStudentId : undefined,
      vacancyId: rawVacancyId && rawVacancyId !== "ALL" ? rawVacancyId : undefined,
      status: rawStatus && rawStatus !== "ALL" ? rawStatus : undefined,
    };

    const parsedQuery = interviewQuerySchema.safeParse(queryInput);
    if (!parsedQuery.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsedQuery.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      applicationId,
      studentId: queryStudentId,
      vacancyId,
      status,
    } = parsedQuery.data;

    const baseWhere: Prisma.InterviewWhereInput = {
      deletedAt: null,
      application: {
        deletedAt: null,
        student: { deletedAt: null },
        vacancy: { deletedAt: null, employer: { deletedAt: null } },
      },
    };

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found for this user.");
      }

      // If student specifies studentId query param, enforce match with their own id
      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError(
          "Students cannot access interviews of other students."
        );
      }

      baseWhere.application = {
        deletedAt: null,
        studentId: student.id,
        student: { deletedAt: null },
        vacancy: {
          deletedAt: null,
          employer: { deletedAt: null },
          ...(vacancyId ? { id: vacancyId } : {}),
        },
      };

      if (applicationId) {
        baseWhere.applicationId = applicationId;
      }
    } else {
      // Staff roles & Management
      if (applicationId) {
        baseWhere.applicationId = applicationId;
      }
      if (queryStudentId || vacancyId) {
        baseWhere.application = {
          deletedAt: null,
          student: { deletedAt: null },
          ...(queryStudentId ? { studentId: queryStudentId } : {}),
          vacancy: {
            deletedAt: null,
            employer: { deletedAt: null },
            ...(vacancyId ? { id: vacancyId } : {}),
          },
        };
      }
    }

    const statsWhere: Prisma.InterviewWhereInput = {
      deletedAt: null,
      ...baseWhere,
    };

    if (status) {
      baseWhere.status = status;
    }

    const searchWhere: Prisma.InterviewWhereInput = searchStr
      ? {
          OR: [
            { location: { contains: searchStr, mode: "insensitive" as const } },
            { method: { contains: searchStr, mode: "insensitive" as const } },
            { notes: { contains: searchStr, mode: "insensitive" as const } },
            { application: { student: { name: { contains: searchStr, mode: "insensitive" as const } } } },
            { application: { student: { nim: { contains: searchStr, mode: "insensitive" as const } } } },
            { application: { vacancy: { title: { contains: searchStr, mode: "insensitive" as const } } } },
            { application: { vacancy: { employer: { name: { contains: searchStr, mode: "insensitive" as const } } } } },
          ],
        }
      : {};

    const where: Prisma.InterviewWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const [
      interviews,
      total,
      totalStats,
      pendingStats,
      rescheduledStats,
      passedStats,
      failedStats,
    ] = await prisma.$transaction([
      prisma.interview.findMany({
        where,
        skip,
        take: limit,
        select: interviewListSelect,
        orderBy: { scheduledAt: "desc" },
      }),
      prisma.interview.count({ where }),
      prisma.interview.count({ where: statsWhere }),
      prisma.interview.count({ where: { ...statsWhere, status: "PENDING" } }),
      prisma.interview.count({ where: { ...statsWhere, status: "RESCHEDULED" } }),
      prisma.interview.count({ where: { ...statsWhere, status: "PASSED" } }),
      prisma.interview.count({ where: { ...statsWhere, status: "FAILED" } }),
    ]);

    const sanitizedInterviews = interviews.map((iv) =>
      sanitizeInterviewForRole(iv, authenticatedUser.role)
    );

    const totalPages = Math.ceil(total / limit) || 1;

    return Response.json(
      {
        data: sanitizedInterviews,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        stats: {
          total: totalStats,
          pending: pendingStats,
          rescheduled: rescheduledStats,
          passed: passedStats,
          failed: failedStats,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/interviews error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("interview:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = createInterviewSchema.safeParse(body);
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

    // Verify application existence
    const application = await prisma.application.findUnique({
      where: {
        id: data.applicationId,
        deletedAt: null,
        student: { deletedAt: null },
        vacancy: { deletedAt: null, employer: { deletedAt: null } },
      },
      select: {
        id: true,
        status: true,
        studentId: true,
        vacancyId: true,
      },
    });

    if (!application) {
      return Response.json(
        { message: "Application not found." },
        { status: 404 }
      );
    }

    // Terminal status check
    if (application.status === "REJECTED") {
      return Response.json(
        { message: "Cannot schedule interview for a rejected application." },
        { status: 409 }
      );
    }

    if (application.status === "WITHDRAWN") {
      return Response.json(
        { message: "Cannot schedule interview for a withdrawn application." },
        { status: 409 }
      );
    }

    const newInterview = await prisma.$transaction(async (tx) => {
      const created = await tx.interview.create({
        data: {
          applicationId: data.applicationId,
          scheduledAt: new Date(data.scheduledAt),
          method: data.method?.trim() || null,
          location: data.location?.trim() || null,
          notes: data.notes?.trim() || null,
          status: "PENDING",
        },
        select: interviewDetailSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "CREATE",
        entity: "Interview",
        entityId: created.id,
        changes: {
          applicationId: created.applicationId,
          scheduledAt: created.scheduledAt,
          method: created.method,
          location: created.location,
          notes: created.notes,
          status: created.status,
        },
      });

      return created;
    });

    return Response.json(
      sanitizeInterviewForRole(newInterview, authenticatedUser.role),
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("POST /api/interviews error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    {
      message:
        "Method Not Allowed. Interview deletion is not permitted. Historical records must be preserved.",
    },
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
