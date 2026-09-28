import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { updateEmployerSchema } from "@/schemas/employer";

const prisma = new PrismaClient();

export const employerDetailSelect = {
  id: true,
  name: true,
  companyInfo: true,
  address: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  createdAt: true,
  updatedAt: true,
  vacancies: {
    select: {
      id: true,
      title: true,
      description: true,
      requirements: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("employer:read");
    const { id } = await params;

    const employer = await prisma.employer.findUnique({
      where: { id },
      select: employerDetailSelect,
    });

    if (!employer) {
      return Response.json(
        { message: "Employer not found." },
        { status: 404 }
      );
    }

    return Response.json(employer, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/employers/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("employer:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = updateEmployerSchema.safeParse(body);
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

    const existing = await prisma.employer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        companyInfo: true,
        address: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
      },
    });

    if (!existing) {
      return Response.json(
        { message: "Employer not found." },
        { status: 404 }
      );
    }

    // If name is updated, check for duplicate with another employer
    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.employer.findFirst({
        where: {
          id: { not: id },
          name: {
            equals: data.name,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (duplicate) {
        return Response.json(
          { message: `An employer with the name "${data.name}" already exists.` },
          { status: 409 }
        );
      }
    }

    const updatedEmployer = await prisma.$transaction(async (tx) => {
      const emp = await tx.employer.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.companyInfo !== undefined && { companyInfo: data.companyInfo }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.contactName !== undefined && { contactName: data.contactName }),
          ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
          ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
        },
        select: employerDetailSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "UPDATE",
        entity: "Employer",
        entityId: emp.id,
        changes: {
          before: {
            name: existing.name,
            companyInfo: existing.companyInfo,
            address: existing.address,
            contactName: existing.contactName,
            contactEmail: existing.contactEmail,
            contactPhone: existing.contactPhone,
          },
          after: {
            name: emp.name,
            companyInfo: emp.companyInfo,
            address: emp.address,
            contactName: emp.contactName,
            contactEmail: emp.contactEmail,
            contactPhone: emp.contactPhone,
          },
        },
      });

      return emp;
    });

    return Response.json(updatedEmployer, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/employers/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("employer:delete");
    const { id } = await params;

    const result = await prisma.$transaction(async (transaction) => {
      const employer = await transaction.employer.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          _count: { select: { vacancies: true, placements: true } },
        },
      });

      if (!employer) return { kind: "not-found" as const };

      const dependencies = employer._count;
      if (dependencies.vacancies > 0 || dependencies.placements > 0) {
        return { kind: "blocked" as const, employer, dependencies };
      }

      await transaction.employer.delete({ where: { id } });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Employer",
        entityId: employer.id,
        changes: { deleted: { name: employer.name }, dependencies },
      });

      return { kind: "deleted" as const, id: employer.id, name: employer.name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ message: "Employer not found." }, { status: 404 });
    }
    if (result.kind === "blocked") {
      return Response.json(
        {
          message: `Employer "${result.employer.name}" cannot be deleted because it still has dependent records.`,
          dependencies: result.dependencies,
        },
        { status: 409 },
      );
    }

    return Response.json({ data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ message: "Employer not found." }, { status: 404 });
      }
      if (error.code === "P2003" || error.code === "P2034") {
        const { id } = await params;
        const [vacancies, placements] = await Promise.all([
          prisma.vacancy.count({ where: { employerId: id } }),
          prisma.placement.count({ where: { employerId: id } }),
        ]);
        return Response.json(
          {
            message: "Employer cannot be deleted because dependent records changed during the request.",
            dependencies: { vacancies, placements },
          },
          { status: 409 },
        );
      }
    }
    console.error("DELETE /api/employers/[id] error:", error);
    return Response.json({ message: "Internal server error." }, { status: 500 });
  }
}
