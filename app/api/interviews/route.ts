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

    const queryInput = {
      applicationId: searchParams.get("applicationId") || undefined,
      studentId: searchParams.get("studentId") || undefined,
      vacancyId: searchParams.get("vacancyId") || undefined,
      status: searchParams.get("status") || undefined,
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

    const where: Prisma.InterviewWhereInput = { deletedAt: null };

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

      where.application = {
        studentId: student.id,
        ...(vacancyId && { vacancyId }),
      };

      if (applicationId) {
        where.applicationId = applicationId;
      }
    } else {
      // Staff roles & Management
      if (applicationId) {
        where.applicationId = applicationId;
      }
      if (queryStudentId || vacancyId) {
        where.application = {
          ...(queryStudentId && { studentId: queryStudentId }),
          ...(vacancyId && { vacancyId }),
        };
      }
    }

    if (status) {
      where.status = status;
    }

    const interviews = await prisma.interview.findMany({
      where: {
        AND: [
          where,
          {
            application: {
              deletedAt: null,
              student: { deletedAt: null },
              vacancy: { deletedAt: null, employer: { deletedAt: null } },
            },
          },
        ],
      },
      select: interviewListSelect,
      orderBy: { scheduledAt: "desc" },
    });

    const sanitizedInterviews = interviews.map((iv) =>
      sanitizeInterviewForRole(iv, authenticatedUser.role)
    );

    return Response.json(sanitizedInterviews, { status: 200 });
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
