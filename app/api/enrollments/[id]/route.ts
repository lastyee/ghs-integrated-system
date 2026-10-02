import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { enrollmentUpdateSchema } from "@/schemas/enrollment";

const prisma = new PrismaClient();

const enrollmentSelect = {
  id: true,
  studentId: true,
  batchId: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("enrollment:read");
    const { id } = await params;

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id,
        deletedAt: null,
        student: { deletedAt: null },
        batch: { deletedAt: null, program: { deletedAt: null } },
      },
      select: {
        ...enrollmentSelect,
        student: {
          select: {
            id: true,
            nim: true,
            name: true,
          },
        },
        batch: {
          select: {
            id: true,
            name: true,
            programId: true,
            program: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!enrollment) {
      return Response.json(
        { error: "Enrollment not found" },
        { status: 404 },
      );
    }

    return Response.json({ data: enrollment });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read enrollment", error);
    return Response.json(
      { error: "Unable to load enrollment" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("enrollment:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = enrollmentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        studentId: true,
        batchId: true,
        status: true,
        notes: true,
      },
    });

    if (!existingEnrollment) {
      return Response.json({ error: "Enrollment not found" }, { status: 404 });
    }

    const data: Prisma.EnrollmentUpdateInput = {};
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
    }
    if (parsed.data.notes !== undefined) {
      data.notes = parsed.data.notes;
    }

    const updated = await prisma.$transaction(async (transaction) => {
      const updatedEnrollment = await transaction.enrollment.update({
        where: { id },
        data,
        select: enrollmentSelect,
      });

      const fields: Record<string, unknown> = {};
      if (existingEnrollment.status !== updatedEnrollment.status) {
        fields.status = {
          before: existingEnrollment.status,
          after: updatedEnrollment.status,
        };
      }
      if (existingEnrollment.notes !== updatedEnrollment.notes) {
        fields.notes = {
          before: existingEnrollment.notes,
          after: updatedEnrollment.notes,
        };
      }

      await createAuditLog(transaction, authenticatedUser, {
        action: "UPDATE",
        entity: "Enrollment",
        entityId: updatedEnrollment.id,
        changes: { fields },
      });

      return updatedEnrollment;
    });

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Enrollment not found" }, { status: 404 });
      }
    }

    console.error("Failed to update enrollment", error);
    return Response.json(
      { error: "Unable to update enrollment" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("enrollment:delete");
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new AuthorizationError(403, "Permission denied");
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid enrollment ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const enrollment = await transaction.enrollment.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!enrollment) return null;

      const deletedAt = new Date();
      await transaction.enrollment.update({
        where: { id: enrollment.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Enrollment",
        entityId: enrollment.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });
      return { id: enrollment.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result) {
      return Response.json({ error: "Enrollment not found" }, { status: 404 });
    }
    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("Failed to soft-delete enrollment", error);
    return Response.json({ error: "Unable to delete enrollment" }, { status: 500 });
  }
}
