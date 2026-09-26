import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { programUpdateSchema } from "@/schemas/program";

const prisma = new PrismaClient();

const programSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("program:read");
    const { id } = await params;

    const program = await prisma.program.findUnique({
      where: { id },
      select: {
        ...programSelect,
        batches: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { startDate: "asc" },
        },
      },
    });

    if (!program) {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }

    return Response.json({ data: program });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read program", error);
    return Response.json({ error: "Unable to load program" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("program:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = programUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const data: Prisma.ProgramUpdateInput = {};
    if (parsed.data.code !== undefined) {
      data.code = parsed.data.code;
    }
    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      data.description = parsed.data.description;
    }

    const program = await prisma.$transaction(async (transaction) => {
      const previousProgram = await transaction.program.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
        },
      });

      if (!previousProgram) {
        return null;
      }

      if (parsed.data.code && parsed.data.code !== previousProgram.code) {
        const duplicate = await transaction.program.findUnique({
          where: { code: parsed.data.code },
          select: { id: true },
        });
        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError("Program code duplicate", {
            code: "P2002",
            clientVersion: "custom",
            meta: { target: ["code"] },
          });
        }
      }

      const updatedProgram = await transaction.program.update({
        where: { id },
        data,
        select: programSelect,
      });

      const fields: Record<string, unknown> = {};
      for (const field of ["code", "name", "description"] as const) {
        if (previousProgram[field] !== updatedProgram[field]) {
          fields[field] = {
            before: previousProgram[field],
            after: updatedProgram[field],
          };
        }
      }

      await createAuditLog(transaction, authenticatedUser, {
        action: "UPDATE",
        entity: "Program",
        entityId: updatedProgram.id,
        changes: { fields },
      });

      return updatedProgram;
    });

    if (!program) {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }

    return Response.json({ data: program });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Program not found" }, { status: 404 });
      }

      if (error.code === "P2002") {
        return Response.json(
          { error: "Program with this code already exists" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to update program", error);
    return Response.json({ error: "Unable to update program" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "GET, PATCH" } },
  );
}
