import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { certificateCreateSchema, certificateQuerySchema } from "@/schemas/certificate";

const prisma = new PrismaClient();

export const certificateSelect = {
  id: true,
  studentId: true,
  programId: true,
  batchId: true,
  certificateNumber: true,
  issuedAt: true,
  status: true,
  path: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
    },
  },
  program: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  batch: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const authenticatedUser = await requirePermission("certificate:read");

    const { searchParams } = new URL(request.url);
    const rawQuery = {
      studentId: searchParams.get("studentId") || undefined,
      batchId: searchParams.get("batchId") || undefined,
      status: searchParams.get("status") || undefined,
    };

    const parsedQuery = certificateQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return Response.json({ error: "Invalid query parameters" }, { status: 400 });
    }

    const where: Prisma.CertificateWhereInput = {};

    if (authenticatedUser.role === "STUDENT") {
      // Strictly scoped to own student record; ignore client-provided studentId query param
      where.student = {
        userId: authenticatedUser.id,
      };
    } else {
      if (parsedQuery.data.studentId) {
        where.studentId = parsedQuery.data.studentId;
      }
    }

    if (parsedQuery.data.batchId) {
      where.batchId = parsedQuery.data.batchId;
    }

    if (parsedQuery.data.status) {
      where.status = parsedQuery.data.status;
    }

    const certificates = await prisma.certificate.findMany({
      where,
      select: certificateSelect,
      orderBy: { issuedAt: "desc" },
    });

    return Response.json({ data: certificates });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read certificates", error);
    return Response.json({ error: "Unable to load certificates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("certificate:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = certificateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Validate Student exists
    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
      select: { id: true },
    });
    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    // Validate Program exists
    const program = await prisma.program.findUnique({
      where: { id: parsed.data.programId },
      select: { id: true },
    });
    if (!program) {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }

    // Validate Batch exists
    const batch = await prisma.batch.findUnique({
      where: { id: parsed.data.batchId },
      select: { id: true },
    });
    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    const certificate = await prisma.$transaction(async (tx) => {
      const created = await tx.certificate.create({
        data: {
          studentId: parsed.data.studentId,
          programId: parsed.data.programId,
          batchId: parsed.data.batchId,
          certificateNumber: parsed.data.certificateNumber,
          issuedAt: parsed.data.issuedAt,
          path: parsed.data.path ?? null,
          status: "ACTIVE",
        },
        select: certificateSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "CREATE",
        entity: "Certificate",
        entityId: created.id,
        changes: {
          fields: {
            studentId: { after: created.studentId },
            programId: { after: created.programId },
            batchId: { after: created.batchId },
            certificateNumber: { after: created.certificateNumber },
            issuedAt: { after: created.issuedAt.toISOString() },
            status: { after: created.status },
            path: { after: created.path },
          },
        },
      });

      return created;
    });

    return Response.json({ data: certificate }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Certificate with this certificateNumber already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create certificate", error);
    return Response.json({ error: "Unable to create certificate" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

