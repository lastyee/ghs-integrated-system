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

export async function GET() {
  try {
    await requirePermission("program:read");

    const programs = await prisma.program.findMany({
      select: programSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return Response.json({ data: programs });
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

