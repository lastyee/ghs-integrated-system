import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { createEmployerSchema } from "@/schemas/employer";

const prisma = new PrismaClient();

export const employerSelect = {
  id: true,
  name: true,
  companyInfo: true,
  address: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      vacancies: { where: { deletedAt: null } },
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    await requirePermission("employer:read");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || searchParams.get("name");

    const where: Prisma.EmployerWhereInput = { deletedAt: null };

    if (search && search.trim()) {
      where.name = {
        contains: search.trim(),
        mode: "insensitive",
      };
    }

    const employers = await prisma.employer.findMany({
      where,
      select: employerSelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json(employers, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/employers error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("employer:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = createEmployerSchema.safeParse(body);
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

    // Application-level duplicate guard on employer name
    const existing = await prisma.employer.findFirst({
      where: {
        deletedAt: null,
        name: {
          equals: data.name,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existing) {
      return Response.json(
        { message: `An employer with the name "${data.name}" already exists.` },
        { status: 409 }
      );
    }

    const employer = await prisma.$transaction(async (tx) => {
      const emp = await tx.employer.create({
        data: {
          name: data.name,
          companyInfo: data.companyInfo ?? null,
          address: data.address ?? null,
          contactName: data.contactName ?? null,
          contactEmail: data.contactEmail ?? null,
          contactPhone: data.contactPhone ?? null,
        },
        select: employerSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "CREATE",
        entity: "Employer",
        entityId: emp.id,
        changes: {
          id: emp.id,
          name: emp.name,
          companyInfo: emp.companyInfo,
          address: emp.address,
          contactName: emp.contactName,
          contactEmail: emp.contactEmail,
          contactPhone: emp.contactPhone,
        },
      });

      return emp;
    });

    return Response.json(employer, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("POST /api/employers error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Employer deletion is not permitted." },
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
