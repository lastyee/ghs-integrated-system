import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { batchUpdateSchema } from "@/schemas/batch";

const prisma = new PrismaClient();

const batchSelect = {
  id: true,
  name: true,
  programId: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      enrollments: {
        where: { deletedAt: null, student: { deletedAt: null } },
      },
      classes: {
        where: {
          deletedAt: null,
          instructor: { deletedAt: null },
        },
      },
      certificates: { where: { status: "ACTIVE" } },
    },
  },
  program: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("batch:read");
    const { id } = await params;

    const batch = await prisma.batch.findFirst({
      where: { id, deletedAt: null, program: { deletedAt: null } },
      select: {
        ...batchSelect,
        enrollments: {
          where: { deletedAt: null, student: { deletedAt: null } },
          select: {
            id: true,
            studentId: true,
            batchId: true,
            status: true,
            notes: true,
            createdAt: true,
            student: {
              select: {
                id: true,
                nim: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    return Response.json({ data: batch });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read batch", error);
    return Response.json({ error: "Unable to load batch" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("batch:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = batchUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const existingBatch = await prisma.batch.findFirst({
      where: { id, deletedAt: null, program: { deletedAt: null } },
      select: {
        id: true,
        name: true,
        programId: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!existingBatch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    if (parsed.data.programId !== undefined) {
      const program = await prisma.program.findUnique({
        where: { id: parsed.data.programId, deletedAt: null },
        select: { id: true },
      });
      if (!program) {
        return Response.json({ error: "Program not found" }, { status: 404 });
      }
    }

    const effectiveStartDate =
      parsed.data.startDate ?? existingBatch.startDate;
    const effectiveEndDate =
      parsed.data.endDate !== undefined
        ? parsed.data.endDate
        : existingBatch.endDate;

    if (
      effectiveEndDate !== null &&
      effectiveStartDate &&
      effectiveEndDate < effectiveStartDate
    ) {
      return Response.json(
        { error: "End date must be greater than or equal to start date" },
        { status: 400 },
      );
    }

    const data: Prisma.BatchUpdateInput = {};
    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
    }
    if (parsed.data.programId !== undefined) {
      data.program = { connect: { id: parsed.data.programId } };
    }
    if (parsed.data.startDate !== undefined) {
      data.startDate = parsed.data.startDate;
    }
    if (parsed.data.endDate !== undefined) {
      data.endDate = parsed.data.endDate;
    }

    const batch = await prisma.$transaction(async (transaction) => {
      const updatedBatch = await transaction.batch.update({
        where: { id },
        data,
        select: batchSelect,
      });

      const fields: Record<string, unknown> = {};
      if (existingBatch.name !== updatedBatch.name) {
        fields.name = { before: existingBatch.name, after: updatedBatch.name };
      }
      if (existingBatch.programId !== updatedBatch.programId) {
        fields.programId = {
          before: existingBatch.programId,
          after: updatedBatch.programId,
        };
      }
      if (
        existingBatch.startDate.toISOString() !==
        updatedBatch.startDate.toISOString()
      ) {
        fields.startDate = {
          before: existingBatch.startDate.toISOString(),
          after: updatedBatch.startDate.toISOString(),
        };
      }
      if (
        (existingBatch.endDate?.toISOString() ?? null) !==
        (updatedBatch.endDate?.toISOString() ?? null)
      ) {
        fields.endDate = {
          before: existingBatch.endDate?.toISOString() ?? null,
          after: updatedBatch.endDate?.toISOString() ?? null,
        };
      }

      await createAuditLog(transaction, authenticatedUser, {
        action: "UPDATE",
        entity: "Batch",
        entityId: updatedBatch.id,
        changes: { fields },
      });

      return updatedBatch;
    });

    return Response.json({ data: batch });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Batch not found" }, { status: 404 });
      }
      if (error.code === "P2003") {
        return Response.json({ error: "Program not found" }, { status: 404 });
      }
    }

    console.error("Failed to update batch", error);
    return Response.json({ error: "Unable to update batch" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("batch:delete");
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new AuthorizationError(403, "Permission denied");
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid batch ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const batch = await transaction.batch.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!batch) return { kind: "not-found" as const };

      const deletedAt = new Date();
      await transaction.batch.update({
        where: { id: batch.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Batch",
        entityId: batch.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });

      return { kind: "deleted" as const, id: batch.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }
    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2003", "P2034"].includes(error.code)
    ) {
      const { id } = await params;
      const batch = await prisma.batch.findUnique({
        where: { id },
        select: {
          id: true,
          _count: {
            select: {
              enrollments: true,
              classes: true,
              certificates: true,
            },
          },
        },
      });
      const [schedules, certificates] = await Promise.all([
        prisma.schedule.count({ where: { class: { batchId: id } } }),
        prisma.certificate.count({ where: { batchId: id } }),
      ]);
      if (
        batch &&
        (
          batch._count.enrollments > 0 ||
          batch._count.classes > 0 ||
          schedules > 0 ||
          certificates > 0
        )
      ) {
        return Response.json(
          {
            error: "Batch cannot be deleted because it has dependent Enrollment, Class, Schedule, or Certificate records.",
            dependencies: {
              enrollments: batch._count.enrollments,
              classes: batch._count.classes,
              schedules,
              certificates,
            },
          },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "Batch changed during deletion. Please retry." },
        { status: 409 },
      );
    }

    console.error("Failed to delete batch", error);
    return Response.json({ error: "Unable to delete batch" }, { status: 500 });
  }
}
