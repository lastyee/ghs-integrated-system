import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { classCreateSchema } from "@/schemas/class";

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

export async function GET() {
  try {
    await requirePermission("class:read");

    const classes = await prisma.class.findMany({
      select: classSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return Response.json({ data: classes });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read classes", error);
    return Response.json({ error: "Unable to load classes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("class:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = classCreateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const batch = await prisma.batch.findUnique({
      where: { id: parsed.data.batchId },
      select: { id: true },
    });

    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    const instructor = await prisma.instructor.findUnique({
      where: { id: parsed.data.instructorId },
      select: { id: true },
    });

    if (!instructor) {
      return Response.json({ error: "Instructor not found" }, { status: 404 });
    }

    const classRecord = await prisma.$transaction(async (transaction) => {
      const createdClass = await transaction.class.create({
        data: {
          name: parsed.data.name,
          batchId: parsed.data.batchId,
          instructorId: parsed.data.instructorId,
        },
        select: {
          id: true,
          name: true,
          batchId: true,
          instructorId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await createAuditLog(transaction, authenticatedUser, {
        action: "CREATE",
        entity: "Class",
        entityId: createdClass.id,
        changes: {
          fields: {
            name: { after: createdClass.name },
            batchId: { after: createdClass.batchId },
            instructorId: { after: createdClass.instructorId },
            status: { after: createdClass.status },
          },
        },
      });

      return createdClass;
    });

    return Response.json({ data: classRecord }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return Response.json(
        { error: "Batch or instructor not found" },
        { status: 404 },
      );
    }

    console.error("Failed to create class", error);
    return Response.json({ error: "Unable to create class" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    { error: "Method Not Allowed. Historical records are immutable." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}
