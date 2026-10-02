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

    const program = await prisma.program.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...programSelect,
        batches: {
          where: { deletedAt: null },
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
      const previousProgram = await transaction.program.findFirst({
        where: { id, deletedAt: null },
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("program:delete");
    const { id } = await params;

    const result = await prisma.$transaction(async (transaction) => {
      const program = await transaction.program.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!program) return { kind: "not-found" as const };

      const deletedAt = new Date();
      await transaction.program.update({
        where: { id: program.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Program",
        entityId: program.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });

      return { kind: "deleted" as const, id: program.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }

    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Program not found" }, { status: 404 });
      }
      if (error.code === "P2003" || error.code === "P2034") {
        const { id } = await params;
        const [batches, certificates, subjects] = await Promise.all([
          prisma.batch.count({ where: { programId: id } }),
          prisma.certificate.count({ where: { programId: id } }),
          prisma.programSubject.count({ where: { programId: id } }),
        ]);
        return Response.json(
          {
            error: "Program tidak dapat dihapus karena relasi berubah saat proses berlangsung.",
            dependencies: { batches, certificates, programSubjects: subjects },
          },
          { status: 409 },
        );
      }
    }
    console.error("Failed to delete program", error);
    return Response.json({ error: "Unable to delete program" }, { status: 500 });
  }
}
