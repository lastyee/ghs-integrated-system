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
  generateStoragePath,
  getStorageProvider,
  MockStorageProvider,
  sanitizeFileName,
} from "@/lib/storage";
import {
  documentTypeSchema,
  validateFileConstraints,
  validateFileSignature,
} from "@/schemas/document";

const prisma = new PrismaClient();

export const documentSelect = {
  id: true,
  studentId: true,
  type: true,
  storagePath: true,
  fileName: true,
  fileSize: true,
  fileType: true,
  status: true,
  verifiedById: true,
  verifiedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
      userId: true,
    },
  },
  verifiedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const authenticatedUser = await requirePermission("document:read");
    const { searchParams } = new URL(request.url);

    // Test-only endpoint to inspect MockStorageProvider status in non-production
    if (
      process.env.NODE_ENV !== "production" &&
      searchParams.get("testStorageStatus") === "true"
    ) {
      const storage = getStorageProvider();
      if (storage instanceof MockStorageProvider) {
        return Response.json(
          {
            count: storage.getObjectCount(),
            keys: storage.getKeys(),
            uploadHistory: storage.getUploadHistory(),
            deleteHistory: storage.getDeleteHistory(),
          },
          { status: 200 }
        );
      }
    }

    const queryStudentId = searchParams.get("studentId");
    const queryStatus = searchParams.get("status");
    const queryType = searchParams.get("type");

    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      student: { deletedAt: null },
    };

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError();
      }

      // If student queries studentId, enforce it must match own student ID
      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError();
      }

      where.studentId = student.id;
    } else {
      if (queryStudentId) {
        where.studentId = queryStudentId;
      }
    }

    if (
      queryStatus &&
      Object.values(DocumentStatus).includes(queryStatus as DocumentStatus)
    ) {
      where.status = queryStatus as DocumentStatus;
    }

    if (queryType && queryType.trim()) {
      where.type = queryType.trim();
    }

    const documents = await prisma.document.findMany({
      where,
      select: documentSelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json(documents, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/documents error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("document:create");

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json(
        { message: "Invalid form data in request body." },
        { status: 400 }
      );
    }

    // 1. Validate type
    const rawType = formData.get("type");
    if (typeof rawType !== "string" || !rawType.trim()) {
      return Response.json(
        { message: "Document type is required." },
        { status: 400 }
      );
    }
    const parsedType = documentTypeSchema.safeParse(rawType);
    if (!parsedType.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsedType.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }
    const documentType = parsedType.data;

    // 2. Validate file metadata (size, declared MIME, extension)
    const file = formData.get("file");
    if (!file || typeof file === "string" || typeof (file as Blob).size !== "number") {
      return Response.json(
        { message: "File is required." },
        { status: 400 }
      );
    }
    const fileBlob = file as File;
    const fileValidation = validateFileConstraints({
      name: fileBlob.name,
      size: fileBlob.size,
      type: fileBlob.type,
    });
    if (!fileValidation.valid) {
      return Response.json(
        { message: fileValidation.error || "File validation failed." },
        { status: 400 }
      );
    }
    const safeExt = fileValidation.extension!;
    const safeFileName = sanitizeFileName(fileBlob.name);

    // 3. Read binary buffer and validate magic-byte / file signature
    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
    const signatureValidation = validateFileSignature(
      fileBuffer,
      safeExt,
      fileBlob.type
    );
    if (!signatureValidation.valid) {
      return Response.json(
        { message: signatureValidation.error || "Invalid file signature." },
        { status: 400 }
      );
    }

    // 4. Determine and authorize target student
    let targetStudentId: string;
    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });
      if (!student) {
        throw new ForbiddenError();
      }

      const requestedStudentId = formData.get("studentId");
      if (
        typeof requestedStudentId === "string" &&
        requestedStudentId.trim() &&
        requestedStudentId.trim() !== student.id
      ) {
        throw new ForbiddenError("Cannot upload document for another student.");
      }
      targetStudentId = student.id;
    } else {
      // Admin / Super Admin
      const requestedStudentId = formData.get("studentId");
      if (typeof requestedStudentId !== "string" || !requestedStudentId.trim()) {
        return Response.json(
          { message: "Student ID is required." },
          { status: 400 }
        );
      }
      const student = await prisma.student.findUnique({
        where: { id: requestedStudentId.trim() },
        select: { id: true },
      });
      if (!student) {
        return Response.json(
          { message: "Student not found." },
          { status: 404 }
        );
      }
      targetStudentId = student.id;
    }

    // 5. Generate deterministic, server-controlled document ID & storage path
    const documentId = `doc_${crypto.randomUUID().replace(/-/g, "")}`;
    const storagePath = generateStoragePath(targetStudentId, documentId, safeExt);

    // 6. Upload object to storage provider
    const storage = getStorageProvider();

    await storage.upload({
      bucket: DOCUMENTS_BUCKET,
      path: storagePath,
      file: fileBuffer,
      contentType: fileBlob.type,
    });

    // 7. Insert database record and create audit log in transaction
    let documentRecord;
    try {
      documentRecord = await prisma.$transaction(async (tx) => {
        // Controlled test failure injection (strictly non-production only)
        if (
          process.env.NODE_ENV !== "production" &&
          request.headers.get("x-test-force-db-failure") === "true"
        ) {
          throw new Error("Simulated database failure for compensation test.");
        }

        const doc = await tx.document.create({
          data: {
            id: documentId,
            studentId: targetStudentId,
            type: documentType,
            storagePath,
            fileName: safeFileName,
            fileSize: fileBlob.size,
            fileType: fileBlob.type,
            status: DocumentStatus.PENDING,
          },
          select: documentSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: "UPLOAD",
          entity: "Document",
          entityId: doc.id,
          changes: {
            documentId: doc.id,
            studentId: doc.studentId,
            type: doc.type,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            fileType: doc.fileType,
            status: doc.status,
          },
        });

        return doc;
      });
    } catch (dbError) {
      // Clean up uploaded storage object if database insertion fails (compensation)
      try {
        await storage.delete({ bucket: DOCUMENTS_BUCKET, path: storagePath });
      } catch (cleanupError) {
        console.error("Storage cleanup failed after DB error:", cleanupError);
      }
      throw dbError;
    }

    return Response.json(documentRecord, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("POST /api/documents error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Document deletion is not permitted." },
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
