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

    const document = await prisma.document.findUnique({
      where: { id },
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

    const existingDocument = await prisma.document.findUnique({
      where: { id },
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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const failureState: {
    stage: "database" | "storage";
    storageCleanupCompleted: boolean;
  } = { stage: "database", storageCleanupCompleted: false };

  try {
    const authenticatedUser = await requirePermission("document:delete");
    if (!["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "PLACEMENT_STAFF"].includes(authenticatedUser.role)) {
      throw new ForbiddenError();
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ message: "Invalid document ID." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "documents" WHERE "id" = ${id} FOR UPDATE
      `;
      if (lockedRows.length === 0) return { kind: "not-found" as const };

      const document = await tx.document.findUnique({
        where: { id },
        select: {
          id: true,
          studentId: true,
          status: true,
          fileName: true,
          storagePath: true,
        },
      });
      if (!document) return { kind: "not-found" as const };
      if (document.status === DocumentStatus.VERIFIED) {
        return { kind: "verified" as const };
      }

      failureState.stage = "storage";
      if (
        process.env.NODE_ENV !== "production" &&
        request.headers.get("x-test-force-storage-failure") === "true"
      ) {
        throw new Error("Simulated storage cleanup failure.");
      }
      const storageResult = await getStorageProvider().delete({
        bucket: DOCUMENTS_BUCKET,
        path: document.storagePath,
      });
      failureState.storageCleanupCompleted = true;

      failureState.stage = "database";
      if (
        process.env.NODE_ENV !== "production" &&
        request.headers.get("x-test-force-db-failure") === "true"
      ) {
        throw new Error("Simulated database deletion failure.");
      }

      await tx.document.delete({ where: { id: document.id } });
      await createAuditLog(tx, authenticatedUser, {
        action: "DOCUMENT_DELETE",
        entity: "Document",
        entityId: document.id,
        changes: {
          status: document.status,
          fileName: document.fileName,
          storagePath: document.storagePath,
          storageOutcome: storageResult.outcome,
          studentId: document.studentId,
        },
      });

      return { kind: "deleted" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ message: "Document not found." }, { status: 404 });
    }
    if (result.kind === "verified") {
      return Response.json(
        { message: "Verified documents cannot be deleted." },
        { status: 409 },
      );
    }
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ message: "Document not found." }, { status: 404 });
    }

    if (failureState.stage === "storage") {
      console.error("DELETE /api/documents/[id]: storage cleanup failed.");
      return Response.json(
        { message: "Storage cleanup failed. The document record was retained; retry deletion." },
        { status: 502 },
      );
    }

    if (failureState.storageCleanupCompleted) {
      console.error("DELETE /api/documents/[id]: database deletion did not complete after storage cleanup.");
      return Response.json(
        { message: "Document deletion did not complete. Its file may already be absent; retry using the same document ID." },
        { status: 503 },
      );
    }

    console.error("DELETE /api/documents/[id]: unexpected database error.");
    return Response.json(
      { message: "Unable to delete document." },
      { status: 500 },
    );
  }
}
