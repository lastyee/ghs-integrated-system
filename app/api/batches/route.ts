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
      enrollments: {
        where: { deletedAt: null, student: { deletedAt: null } },
      },
      classes: {
        where: {
          deletedAt: null,
          instructor: { deletedAt: null },
        },
      },
      certificates: { where: { status: "ACTIVE" } },
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search") || "";
    const programId = searchParams.get("programId") || "ALL";

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    await requirePermission("batch:read");

    const baseWhere: Prisma.BatchWhereInput = {
      deletedAt: null,
      program: { deletedAt: null },
    };

    if (programId !== "ALL") {
      baseWhere.programId = programId;
    }

    const searchWhere: Prisma.BatchWhereInput = searchStr
      ? {
          OR: [
            { name: { contains: searchStr, mode: "insensitive" as const } },
            { program: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { program: { code: { contains: searchStr, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const where: Prisma.BatchWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const [batches, total] = await prisma.$transaction([
      prisma.batch.findMany({
        where,
        skip,
        take: limit,
        select: batchSelect,
        orderBy: [{ startDate: "asc" }, { name: "asc" }, { id: "asc" }],
      }),
      prisma.batch.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      data: batches,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
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
      where: { id: parsed.data.programId, deletedAt: null },
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
