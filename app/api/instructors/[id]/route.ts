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
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new AuthorizationError(403, "Permission denied");
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid instructor ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const instructor = await transaction.instructor.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!instructor) return { kind: "not-found" as const };

      const deletedAt = new Date();
      await transaction.instructor.update({
        where: { id: instructor.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Instructor",
        entityId: instructor.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });

      return { kind: "deleted" as const, id: instructor.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ error: "Instructor not found" }, { status: 404 });
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
      return Response.json({ error: "Instructor not found" }, { status: 404 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      const { id } = await params;
      const instructor = await prisma.instructor.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      if (!instructor) {
        return Response.json({ error: "Instructor not found" }, { status: 404 });
      }
      return Response.json(
        { error: "Instructor changed during deletion. Please retry." },
        { status: 409 },
      );
    }

    console.error("Failed to delete instructor", error);
    return Response.json({ error: "Unable to delete instructor" }, { status: 500 });
  }
}
