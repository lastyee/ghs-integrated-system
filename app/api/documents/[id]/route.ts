import { DocumentStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  DOCUMENTS_BUCKET,
  getStorageProvider,
} from "@/lib/storage";
import { verifyDocumentSchema } from "@/schemas/document";
import { documentSelect } from "@/app/api/documents/route";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("document:read");
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, deletedAt: null, student: { deletedAt: null } },
      select: documentSelect,
    });

    if (!document) {
      return Response.json(
        { message: "Document not found." },
        { status: 404 }
      );
    }

    if (authenticatedUser.role === "STUDENT") {
      if (document.student.userId !== authenticatedUser.id) {
        throw new ForbiddenError();
      }
    }

    // Generate short-lived signed URL for private access
    const storage = getStorageProvider();
    const signedUrl = await storage.createSignedUrl({
      bucket: DOCUMENTS_BUCKET,
      path: document.storagePath,
      expiresIn: 900, // 15 minutes
    });

    return Response.json({ ...document, signedUrl }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/documents/[id] error:", error);
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
    const authenticatedUser = await requirePermission("document:verify");
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

    const parsed = verifyDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const existingDocument = await prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existingDocument) {
      return Response.json(
        { message: "Document not found." },
        { status: 404 }
      );
    }

    if (existingDocument.status !== DocumentStatus.PENDING) {
      return Response.json(
        {
          message: `Cannot verify document with status ${existingDocument.status}. Only PENDING documents can be verified or rejected.`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const isVerified = parsed.data.status === "VERIFIED";

    const updateData = isVerified
      ? {
          status: DocumentStatus.VERIFIED,
          verifiedById: authenticatedUser.id,
          verifiedAt: now,
          rejectionReason: null,
        }
      : {
          status: DocumentStatus.REJECTED,
          verifiedById: authenticatedUser.id,
          verifiedAt: now,
          rejectionReason: parsed.data.rejectionReason!.trim(),
        };

    const updatedDocument = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.update({
        where: { id },
        data: updateData,
        select: documentSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: isVerified ? "VERIFY" : "REJECT",
        entity: "Document",
        entityId: doc.id,
        changes: {
          status: doc.status,
          verifiedById: doc.verifiedById,
          verifiedAt: doc.verifiedAt,
          rejectionReason: doc.rejectionReason,
        },
      });

      return doc;
    });

    return Response.json(updatedDocument, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/documents/[id] error:", error);
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
    const authenticatedUser = await requirePermission("document:delete");
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new ForbiddenError();
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ message: "Invalid document ID." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "documents" WHERE "id" = ${id} AND "deletedAt" IS NULL FOR UPDATE
      `;
      if (lockedRows.length === 0) return { kind: "not-found" as const };

      const document = await tx.document.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!document) return { kind: "not-found" as const };

      const deletedAt = new Date();
      await tx.document.update({
        where: { id: document.id },
        data: { deletedAt },
      });
      await createAuditLog(tx, authenticatedUser, {
        action: "DELETE",
        entity: "Document",
        entityId: document.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });

      return { kind: "deleted" as const, id: document.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ message: "Document not found." }, { status: 404 });
    }
    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ message: "Document not found." }, { status: 404 });
    }

    console.error("DELETE /api/documents/[id] failed:", error);
    return Response.json(
      { message: "Unable to delete document." },
      { status: 500 },
    );
  }
}
