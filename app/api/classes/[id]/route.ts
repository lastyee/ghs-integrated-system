import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireInstructorClassAccess } from "@/lib/instructor-ownership";
import { classUpdateSchema } from "@/schemas/class";

const prisma = new PrismaClient();

const classSelect = {
  id: true,
  name: true,
  batchId: true,
  instructorId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  batch: {
    select: {
      id: true,
      name: true,
      programId: true,
      startDate: true,
      endDate: true,
    },
  },
  instructor: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("class:read");
    const { id } = await params;

    const classRecord = await prisma.class.findFirst({
      where: {
        id,
        deletedAt: null,
        batch: { deletedAt: null, program: { deletedAt: null } },
        instructor: { deletedAt: null },
      },
      select: {
        ...classSelect,
        schedules: {
          where: { deletedAt: null, subject: { deletedAt: null }, instructor: { deletedAt: null } },
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            room: true,
            topic: true,
            status: true,
            subject: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        },
      },
    });

    if (!classRecord) {
      return Response.json({ error: "Class not found" }, { status: 404 });
    }

    if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorClassAccess(authenticatedUser, id);
    }

    return Response.json({ data: classRecord });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read class", error);
    return Response.json({ error: "Unable to load class" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("class:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = classUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const existingClass = await prisma.class.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        batchId: true,
        instructorId: true,
        status: true,
      },
    });

    if (!existingClass) {
      return Response.json({ error: "Class not found" }, { status: 404 });
    }

    if (parsed.data.batchId !== undefined) {
      const batch = await prisma.batch.findUnique({
        where: { id: parsed.data.batchId, deletedAt: null, program: { deletedAt: null } },
        select: { id: true },
      });
      if (!batch) {
        return Response.json({ error: "Batch not found" }, { status: 404 });
      }
    }

    if (parsed.data.instructorId !== undefined) {
      const instructor = await prisma.instructor.findUnique({
        where: { id: parsed.data.instructorId, deletedAt: null },
        select: { id: true },
      });
      if (!instructor) {
        return Response.json({ error: "Instructor not found" }, { status: 404 });
      }
    }

    const data: Prisma.ClassUpdateInput = {};
    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
    }
    if (parsed.data.batchId !== undefined) {
      data.batch = { connect: { id: parsed.data.batchId } };
    }
    if (parsed.data.instructorId !== undefined) {
      data.instructor = { connect: { id: parsed.data.instructorId } };
    }
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
    }

    const updated = await prisma.$transaction(async (transaction) => {
      const updatedClass = await transaction.class.update({
        where: { id },
        data,
        select: classSelect,
      });

      const fields: Record<string, unknown> = {};
      if (existingClass.name !== updatedClass.name) {
        fields.name = { before: existingClass.name, after: updatedClass.name };
      }
      if (existingClass.batchId !== updatedClass.batchId) {
        fields.batchId = {
          before: existingClass.batchId,
          after: updatedClass.batchId,
        };
      }
      if (existingClass.instructorId !== updatedClass.instructorId) {
        fields.instructorId = {
          before: existingClass.instructorId,
          after: updatedClass.instructorId,
        };
      }
      if (existingClass.status !== updatedClass.status) {
        fields.status = {
          before: existingClass.status,
          after: updatedClass.status,
        };
      }

      await createAuditLog(transaction, authenticatedUser, {
        action: "UPDATE",
        entity: "Class",
        entityId: updatedClass.id,
        changes: { fields },
      });

      return updatedClass;
    });

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Class not found" }, { status: 404 });
      }
      if (error.code === "P2003") {
        return Response.json({ error: "Related record not found" }, { status: 404 });
      }
    }

    console.error("Failed to update class", error);
    return Response.json({ error: "Unable to update class" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("class:delete");
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new AuthorizationError(403, "Permission denied");
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid class ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const classRecord = await transaction.class.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!classRecord) return null;

      const deletedAt = new Date();
      await transaction.class.update({
        where: { id: classRecord.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Class",
        entityId: classRecord.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });
      return { id: classRecord.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result) {
      return Response.json({ error: "Class not found" }, { status: 404 });
    }
    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("Failed to soft-delete class", error);
    return Response.json({ error: "Unable to delete class" }, { status: 500 });
  }
}
