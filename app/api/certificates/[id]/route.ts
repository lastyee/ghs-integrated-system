import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { certificateRevokeSchema } from "@/schemas/certificate";
import { certificateSelect } from "../route";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("certificate:read");
    const { id } = await params;

    const certificate = await prisma.certificate.findFirst({
      where: {
        id,
        deletedAt: null,
        student: { deletedAt: null },
        program: { deletedAt: null },
        batch: { deletedAt: null },
      },
      select: certificateSelect,
    });

    if (!certificate) {
      return Response.json({ error: "Certificate not found" }, { status: 404 });
    }

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { id: certificate.studentId },
        select: { userId: true },
      });

      if (!student || student.userId !== authenticatedUser.id) {
        throw new ForbiddenError("Access to this certificate is denied");
      }
    }

    return Response.json({ data: certificate });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read certificate", error);
    return Response.json({ error: "Unable to load certificate" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("certificate:revoke");
    const { id } = await params;

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Body can be empty for simple revoke
      body = {};
    }

    const parsed = certificateRevokeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const existing = await prisma.certificate.findFirst({
      where: {
        id,
        deletedAt: null,
        student: { deletedAt: null },
        program: { deletedAt: null },
        batch: { deletedAt: null },
      },
      select: certificateSelect,
    });

    if (!existing) {
      return Response.json({ error: "Certificate not found" }, { status: 404 });
    }

    if (existing.status === "REVOKED") {
      // Safe idempotent response
      return Response.json({ data: existing });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const certificate = await tx.certificate.update({
        where: { id },
        data: {
          status: "REVOKED",
        },
        select: certificateSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "REVOKE",
        entity: "Certificate",
        entityId: certificate.id,
        changes: {
          fields: {
            status: {
              before: "ACTIVE",
              after: "REVOKED",
            },
          },
          reason: parsed.data.reason ?? null,
        },
      });

      return certificate;
    });

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json({ error: "Certificate not found" }, { status: 404 });
    }

    console.error("Failed to revoke certificate", error);
    return Response.json({ error: "Unable to revoke certificate" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("certificate:delete");
    const { id } = await params;

    const deleted = await prisma.$transaction(async (tx) => {
      const active = await tx.certificate.findFirst({
        where: {
          id,
          deletedAt: null,
          student: { deletedAt: null },
          program: { deletedAt: null },
          batch: { deletedAt: null },
        },
        select: { id: true, status: true },
      });

      if (!active) return null;

      const deletedAt = new Date();
      const result = await tx.certificate.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt },
      });
      if (result.count !== 1) return null;

      await createAuditLog(tx, authenticatedUser, {
        action: "DELETE",
        entity: "Certificate",
        entityId: active.id,
        changes: {
          fields: {
            deletedAt: {
              before: null,
              after: deletedAt.toISOString(),
            },
          },
        },
      });

      return { id: active.id, status: active.status, deletedAt };
    });

    if (!deleted) {
      return Response.json({ error: "Certificate not found" }, { status: 404 });
    }

    return Response.json({ data: deleted }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to soft delete certificate", error);
    return Response.json({ error: "Unable to delete certificate" }, { status: 500 });
  }
}
