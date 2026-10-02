import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { updateVacancySchema } from "@/schemas/vacancy";

const prisma = new PrismaClient();

export const vacancyDetailSelect = {
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
      companyInfo: true,
      address: true,
    },
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("vacancy:read");
    const { id } = await params;

    const vacancy = await prisma.vacancy.findFirst({
      where: { id, deletedAt: null, employer: { is: { deletedAt: null } } },
      select: vacancyDetailSelect,
    });

    if (!vacancy) {
      return Response.json(
        { message: "Vacancy not found." },
        { status: 404 }
      );
    }

    return Response.json(vacancy, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/vacancies/[id] error:", error);
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

    const parsed = updateVacancySchema.safeParse(body);
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

    // Granular authorization:
    // If payload intends to close the vacancy (status === "CLOSED"), require vacancy:close.
    // If payload includes other field updates, require vacancy:update as well.
    const isClosing = data.status === "CLOSED";
    const hasOtherUpdates = Object.keys(data).some((k) => k !== "status");

    let authenticatedUser;
    if (isClosing && !hasOtherUpdates) {
      authenticatedUser = await requirePermission("vacancy:close");
    } else if (isClosing && hasOtherUpdates) {
      await requirePermission("vacancy:update");
      authenticatedUser = await requirePermission("vacancy:close");
    } else {
      authenticatedUser = await requirePermission("vacancy:update");
    }

    const existing = await prisma.vacancy.findFirst({
      where: { id, deletedAt: null, employer: { is: { deletedAt: null } } },
      select: {
        id: true,
        employerId: true,
        title: true,
        description: true,
        requirements: true,
        status: true,
      },
    });

    if (!existing) {
      return Response.json(
        { message: "Vacancy not found." },
        { status: 404 }
      );
    }

    // If changing employerId, verify target employer exists
    if (data.employerId && data.employerId !== existing.employerId) {
      const targetEmployer = await prisma.employer.findUnique({
        where: { id: data.employerId, deletedAt: null },
        select: { id: true },
      });

      if (!targetEmployer) {
        return Response.json(
          { message: "Target employer not found." },
          { status: 404 }
        );
      }
    }

    const updatedVacancy = await prisma.$transaction(async (tx) => {
      const vac = await tx.vacancy.update({
        where: { id },
        data: {
          ...(data.employerId !== undefined && { employerId: data.employerId }),
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.requirements !== undefined && { requirements: data.requirements }),
          ...(data.status !== undefined && { status: data.status }),
        },
        select: vacancyDetailSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: isClosing && !hasOtherUpdates ? "CLOSE" : "UPDATE",
        entity: "Vacancy",
        entityId: vac.id,
        changes: {
          before: {
            employerId: existing.employerId,
            title: existing.title,
            description: existing.description,
            requirements: existing.requirements,
            status: existing.status,
          },
          after: {
            employerId: vac.employerId,
            title: vac.title,
            description: vac.description,
            requirements: vac.requirements,
            status: vac.status,
          },
        },
      });

      return vac;
    });

    return Response.json(updatedVacancy, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/vacancies/[id] error:", error);
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
    const authenticatedUser = await requirePermission("vacancy:delete");
    const { id } = await params;

    const result = await prisma.$transaction(async (transaction) => {
      const vacancy = await transaction.vacancy.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!vacancy) return { kind: "not-found" as const };

      const deletedAt = new Date();
      await transaction.vacancy.update({
        where: { id: vacancy.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Vacancy",
        entityId: vacancy.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });

      return { kind: "deleted" as const, id: vacancy.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ message: "Vacancy not found." }, { status: 404 });
    }
    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ message: "Vacancy not found." }, { status: 404 });
      }
      if (error.code === "P2034") {
        return Response.json(
          { message: "Vacancy changed during deletion. Please retry." },
          { status: 409 },
        );
      }
    }
    console.error("DELETE /api/vacancies/[id] error:", error);
    return Response.json({ message: "Internal server error." }, { status: 500 });
  }
}
