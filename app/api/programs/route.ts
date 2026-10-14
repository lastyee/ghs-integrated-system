import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { programCreateSchema } from "@/schemas/program";

const prisma = new PrismaClient();

const programSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search") || "";

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    await requirePermission("program:read");

    const baseWhere: Prisma.ProgramWhereInput = { deletedAt: null };

    const searchWhere: Prisma.ProgramWhereInput = searchStr
      ? {
          OR: [
            { code: { contains: searchStr, mode: "insensitive" as const } },
            { name: { contains: searchStr, mode: "insensitive" as const } },
            { description: { contains: searchStr, mode: "insensitive" as const } },
          ],
        }
      : {};

    const where: Prisma.ProgramWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const [programs, total] = await prisma.$transaction([
      prisma.program.findMany({
        where,
        skip,
        take: limit,
        select: programSelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      prisma.program.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      data: programs,
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

    console.error("Failed to read programs", error);
    return Response.json({ error: "Unable to load programs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("program:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = programCreateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const program = await prisma.$transaction(async (transaction) => {
      const createdProgram = await transaction.program.create({
        data: {
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description,
        },
        select: programSelect,
      });

      await createAuditLog(transaction, authenticatedUser, {
        action: "CREATE",
        entity: "Program",
        entityId: createdProgram.id,
        changes: {
          fields: {
            code: { after: createdProgram.code },
            name: { after: createdProgram.name },
            description: { after: createdProgram.description },
          },
        },
      });

      return createdProgram;
    });

    return Response.json({ data: program }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Program with this code already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create program", error);
    return Response.json({ error: "Unable to create program" }, { status: 500 });
  }
}
