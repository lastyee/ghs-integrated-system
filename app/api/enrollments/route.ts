import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { enrollmentCreateSchema } from "@/schemas/enrollment";

const prisma = new PrismaClient();

const enrollmentSelect = {
  id: true,
  studentId: true,
  batchId: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  try {
    await requirePermission("enrollment:read");

    const enrollments = await prisma.enrollment.findMany({
      select: {
        ...enrollmentSelect,
        student: {
          select: {
            id: true,
            nim: true,
            name: true,
          },
        },
        batch: {
          select: {
            id: true,
            name: true,
            programId: true,
            program: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json({ data: enrollments });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read enrollments", error);
    return Response.json(
      { error: "Unable to load enrollments" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("enrollment:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = enrollmentCreateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
      select: { id: true, deletedAt: true },
    });

    if (!student || student.deletedAt) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    const batch = await prisma.batch.findUnique({
      where: { id: parsed.data.batchId },
      select: { id: true },
    });

    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    const enrollment = await prisma.$transaction(async (transaction) => {
      const createdEnrollment = await transaction.enrollment.create({
        data: {
          studentId: parsed.data.studentId,
          batchId: parsed.data.batchId,
          notes: parsed.data.notes,
        },
        select: enrollmentSelect,
      });

      await createAuditLog(transaction, authenticatedUser, {
        action: "CREATE",
        entity: "Enrollment",
        entityId: createdEnrollment.id,
        changes: {
          fields: {
            studentId: { after: createdEnrollment.studentId },
            batchId: { after: createdEnrollment.batchId },
            status: { after: createdEnrollment.status },
            notes: { after: createdEnrollment.notes },
          },
        },
      });

      return createdEnrollment;
    });

    return Response.json({ data: enrollment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return Response.json(
        { error: "Student or batch not found" },
        { status: 404 },
      );
    }

    console.error("Failed to create enrollment", error);
    return Response.json(
      { error: "Unable to create enrollment" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  return Response.json(
    { error: "Method Not Allowed. Historical records are immutable." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}
