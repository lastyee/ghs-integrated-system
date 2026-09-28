import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";

const prisma = new PrismaClient();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("instructor:delete");
    if (!["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"].includes(authenticatedUser.role)) {
      throw new AuthorizationError(403, "Permission denied");
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid instructor ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const instructor = await transaction.instructor.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          userId: true,
          _count: { select: { classes: true, schedules: true } },
        },
      });

      if (!instructor) return { kind: "not-found" as const };

      const dependencies = {
        classes: instructor._count.classes,
        schedules: instructor._count.schedules,
        linkedUser: instructor.userId !== null,
      };
      if (dependencies.classes > 0 || dependencies.schedules > 0 || dependencies.linkedUser) {
        return { kind: "blocked" as const, dependencies };
      }

      await transaction.instructor.delete({ where: { id } });
      await createAuditLog(transaction, authenticatedUser, {
        action: "INSTRUCTOR_DELETE",
        entity: "Instructor",
        entityId: instructor.id,
        changes: {
          deleted: { name: instructor.name },
          dependencies,
        },
      });

      return { kind: "deleted" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ error: "Instructor not found" }, { status: 404 });
    }
    if (result.kind === "blocked") {
      return Response.json(
        {
          error: "Instructor cannot be deleted because it is linked to Class, Schedule, or User.",
          dependencies: result.dependencies,
        },
        { status: 409 },
      );
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json({ error: "Instructor not found" }, { status: 404 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2003", "P2034"].includes(error.code)
    ) {
      const { id } = await params;
      const instructor = await prisma.instructor.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          _count: { select: { classes: true, schedules: true } },
        },
      });
      if (!instructor) {
        return Response.json({ error: "Instructor not found" }, { status: 404 });
      }
      return Response.json(
        {
          error: "Instructor cannot be deleted because it is linked to Class, Schedule, or User.",
          dependencies: {
            classes: instructor._count.classes,
            schedules: instructor._count.schedules,
            linkedUser: instructor.userId !== null,
          },
        },
        { status: 409 },
      );
    }

    console.error("Failed to delete instructor", error);
    return Response.json({ error: "Unable to delete instructor" }, { status: 500 });
  }
}
