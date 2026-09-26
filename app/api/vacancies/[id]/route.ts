import { PrismaClient } from "@prisma/client";
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

    const vacancy = await prisma.vacancy.findUnique({
      where: { id },
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

    const existing = await prisma.vacancy.findUnique({
      where: { id },
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
        where: { id: data.employerId },
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

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Vacancy deletion is not permitted." },
    { status: 405, headers: { Allow: "GET, PATCH" } }
  );
}
