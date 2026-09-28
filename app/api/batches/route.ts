import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { batchCreateSchema } from "@/schemas/batch";

const prisma = new PrismaClient();

const batchSelect = {
  id: true,
  name: true,
  programId: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      enrollments: true,
      classes: true,
      certificates: true,
    },
  },
  program: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} as const;

export async function GET() {
  try {
    await requirePermission("batch:read");

    const batches = await prisma.batch.findMany({
      select: batchSelect,
      orderBy: [{ startDate: "asc" }, { name: "asc" }, { id: "asc" }],
    });

    return Response.json({ data: batches });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read batches", error);
    return Response.json({ error: "Unable to load batches" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("batch:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = batchCreateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const program = await prisma.program.findUnique({
      where: { id: parsed.data.programId },
      select: { id: true },
    });

    if (!program) {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }

    if (parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) {
      return Response.json(
        { error: "End date must be greater than or equal to start date" },
        { status: 400 },
      );
    }

    const batch = await prisma.$transaction(async (transaction) => {
      const createdBatch = await transaction.batch.create({
        data: {
          name: parsed.data.name,
          programId: parsed.data.programId,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
        },
        select: {
          id: true,
          name: true,
          programId: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await createAuditLog(transaction, authenticatedUser, {
        action: "CREATE",
        entity: "Batch",
        entityId: createdBatch.id,
        changes: {
          fields: {
            name: { after: createdBatch.name },
            programId: { after: createdBatch.programId },
            startDate: { after: createdBatch.startDate.toISOString() },
            endDate: { after: createdBatch.endDate?.toISOString() ?? null },
          },
        },
      });

      return createdBatch;
    });

    return Response.json({ data: batch }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }

    console.error("Failed to create batch", error);
    return Response.json({ error: "Unable to create batch" }, { status: 500 });
  }
}
