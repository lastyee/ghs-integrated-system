import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";

const prisma = new PrismaClient();
const USER_DELETE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("user:delete");
    if (!USER_DELETE_ROLES.includes(authenticatedUser.role)) {
      throw new ForbiddenError();
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!user) {
        return { kind: "not-found" as const };
      }

      if (user.id === authenticatedUser.id) {
        return { kind: "self-delete" as const };
      }

      const deletedAt = new Date();
      await transaction.user.update({
        where: { id },
        data: { deletedAt },
      });

      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "User",
        entityId: user.id,
        changes: {
          deletedAt: { before: null, after: deletedAt.toISOString() },
        },
      });

      return { kind: "deleted" as const, id: user.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (result.kind === "self-delete") {
      return Response.json(
        { error: "The active administrator account cannot be deleted from the current session." },
        { status: 409 },
      );
    }

    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    console.error("Failed to soft-delete user", error);
    return Response.json({ error: "Unable to delete user" }, { status: 500 });
  }
}
