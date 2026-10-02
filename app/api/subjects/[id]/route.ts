import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { subjectUpdateSchema } from "@/schemas/subject";

const prisma = new PrismaClient();

const subjectSelect = {
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
    await requirePermission("subject:read");
    const { id } = await params;

    const subject = await prisma.subject.findFirst({
      where: { id, deletedAt: null },
      select: subjectSelect,
    });

    if (!subject) {
      return Response.json({ error: "Subject not found" }, { status: 404 });
    }

    return Response.json({ data: subject });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read subject", error);
    return Response.json({ error: "Unable to load subject" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("subject:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = subjectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const data: Prisma.SubjectUpdateInput = {};
    if (parsed.data.code !== undefined) {
      data.code = parsed.data.code;
    }
    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      data.description = parsed.data.description;
    }

    const subject = await prisma.$transaction(async (transaction) => {
      const previousSubject = await transaction.subject.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
        },
      });

      if (!previousSubject) {
        return null;
      }

      if (parsed.data.code && parsed.data.code !== previousSubject.code) {
        const duplicate = await transaction.subject.findUnique({
          where: { code: parsed.data.code },
          select: { id: true },
        });
        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError("Subject code duplicate", {
            code: "P2002",
            clientVersion: "custom",
            meta: { target: ["code"] },
          });
        }
      }

      const updatedSubject = await transaction.subject.update({
        where: { id },
        data,
        select: subjectSelect,
      });

      const fields: Record<string, unknown> = {};
      for (const field of ["code", "name", "description"] as const) {
        if (previousSubject[field] !== updatedSubject[field]) {
          fields[field] = {
            before: previousSubject[field],
            after: updatedSubject[field],
          };
        }
      }

      await createAuditLog(transaction, authenticatedUser, {
        action: "UPDATE",
        entity: "Subject",
        entityId: updatedSubject.id,
        changes: { fields },
      });

      return updatedSubject;
    });

    if (!subject) {
      return Response.json({ error: "Subject not found" }, { status: 404 });
    }

    return Response.json({ data: subject });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Subject not found" }, { status: 404 });
      }

      if (error.code === "P2002") {
        return Response.json(
          { error: "Subject with this code already exists" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to update subject", error);
    return Response.json({ error: "Unable to update subject" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("subject:delete");
    const { id } = await params;

    const result = await prisma.$transaction(async (transaction) => {
      const subject = await transaction.subject.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!subject) return { kind: "not-found" as const };

      const deletedAt = new Date();
      await transaction.subject.update({
        where: { id: subject.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Subject",
        entityId: subject.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });

      return { kind: "deleted" as const, id: subject.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "not-found") {
      return Response.json({ error: "Subject not found" }, { status: 404 });
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
        return Response.json({ error: "Subject not found" }, { status: 404 });
      }
      if (error.code === "P2003" || error.code === "P2034") {
        const { id } = await params;
        const [programSubjects, schedules, assessments] = await Promise.all([
          prisma.programSubject.count({ where: { subjectId: id } }),
          prisma.schedule.count({ where: { subjectId: id } }),
          prisma.assessment.count({ where: { subjectId: id } }),
        ]);
        return Response.json(
          {
            error: "Subject tidak dapat dihapus karena relasi berubah saat proses berlangsung.",
            dependencies: { programSubjects, schedules, assessments },
          },
          { status: 409 },
        );
      }
    }
    console.error("Failed to delete subject", error);
    return Response.json({ error: "Unable to delete subject" }, { status: 500 });
  }
}
