import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireLinkedInstructor } from "@/lib/instructor-ownership";
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search") || "";
    const statusStr = searchParams.get("status") || "ALL";
    const batchIdStr = searchParams.get("batchId") || "ALL";

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const authenticatedUser = await requirePermission("class:read");
    const baseWhere: Prisma.ClassWhereInput =
      authenticatedUser.role === "INSTRUCTOR"
        ? {
            deletedAt: null,
            instructorId: (await requireLinkedInstructor(authenticatedUser)).id,
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          }
        : {
            deletedAt: null,
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          };

    if (statusStr !== "ALL") {
      baseWhere.status = statusStr as "SCHEDULED" | "COMPLETED" | "CANCELLED";
    }

    if (batchIdStr !== "ALL") {
      baseWhere.batchId = batchIdStr;
    }

    const searchWhere: Prisma.ClassWhereInput = searchStr
      ? {
          OR: [
            { name: { contains: searchStr, mode: "insensitive" as const } },
            { batch: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { instructor: { name: { contains: searchStr, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const where: Prisma.ClassWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const [classes, total, totalClasses, scheduled, completed, cancelled] = await prisma.$transaction([
      prisma.class.findMany({
        where,
        skip,
        take: limit,
        select: classSelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      prisma.class.count({ where }),
      prisma.class.count({ where: baseWhere }),
      prisma.class.count({ where: { ...baseWhere, status: "SCHEDULED" } }),
      prisma.class.count({ where: { ...baseWhere, status: "COMPLETED" } }),
      prisma.class.count({ where: { ...baseWhere, status: "CANCELLED" } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      data: classes,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        total: totalClasses,
        scheduled,
        completed,
        cancelled,
      },
    });
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
      where: { id: parsed.data.batchId, deletedAt: null, program: { deletedAt: null } },
      select: { id: true },
    });

    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    const instructor = await prisma.instructor.findUnique({
      where: { id: parsed.data.instructorId, deletedAt: null },
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
