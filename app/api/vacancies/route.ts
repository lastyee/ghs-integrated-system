import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { createVacancySchema, vacancyQuerySchema } from "@/schemas/vacancy";

const prisma = new PrismaClient();

export const vacancySelect = {
  id: true,
  employerId: true,
  title: true,
  description: true,
  requirements: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  employer: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    await requirePermission("vacancy:read");
    const { searchParams } = new URL(request.url);

    const queryInput = {
      employerId: searchParams.get("employerId") || undefined,
      status: searchParams.get("status") || undefined,
    };

    const parsedQuery = vacancyQuerySchema.safeParse(queryInput);
    if (!parsedQuery.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsedQuery.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { employerId, status } = parsedQuery.data;

    const where: Prisma.VacancyWhereInput = {
      deletedAt: null,
      employer: { is: { deletedAt: null } },
    };

    if (employerId) {
      where.employerId = employerId;
    }

    if (status) {
      where.status = status;
    }

    const vacancies = await prisma.vacancy.findMany({
      where,
      select: vacancySelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json(vacancies, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/vacancies error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("vacancy:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = createVacancySchema.safeParse(body);
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

    // Verify target employer exists
    const employer = await prisma.employer.findUnique({
      where: { id: data.employerId, deletedAt: null },
      select: { id: true },
    });

    if (!employer) {
      return Response.json(
        { message: "Employer not found." },
        { status: 404 }
      );
    }

    const vacancy = await prisma.$transaction(async (tx) => {
      const vac = await tx.vacancy.create({
        data: {
          employerId: data.employerId,
          title: data.title,
          description: data.description,
          requirements: data.requirements,
          status: data.status,
        },
        select: vacancySelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "CREATE",
        entity: "Vacancy",
        entityId: vac.id,
        changes: {
          id: vac.id,
          employerId: vac.employerId,
          title: vac.title,
          description: vac.description,
          requirements: vac.requirements,
          status: vac.status,
        },
      });

      return vac;
    });

    return Response.json(vacancy, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("POST /api/vacancies error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Vacancy deletion is not permitted." },
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
