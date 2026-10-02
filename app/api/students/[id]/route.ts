import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireStudentOwnership } from "@/lib/student-ownership";
import { requireInstructorStudentAccess } from "@/lib/instructor-ownership";
import { studentUpdateSchema } from "@/schemas/student";
import { studentProfileUpdateSchema } from "@/schemas/profile";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("student:read");
    const { id } = await params;

    if (authenticatedUser.role === "STUDENT") {
      await requireStudentOwnership(id);
    } else if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorStudentAccess(authenticatedUser, id);
    }

    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        nim: true,
        nik: true,
        name: true,
        phone: true,
        address: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        enrollments: {
          where: {
            deletedAt: null,
            batch: { deletedAt: null, program: { deletedAt: null } },
          },
          select: {
            id: true,
            status: true,
            notes: true,
            createdAt: true,
            batch: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
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
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    return Response.json({ data: student });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read student", error);
    return Response.json({ error: "Unable to load student" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("student:update");
    const { id } = await params;

    if (authenticatedUser.role === "STUDENT") {
      await requireStudentOwnership(id);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    let data: Prisma.StudentUpdateInput;
    if (authenticatedUser.role === "STUDENT") {
      const parsed = studentProfileUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          {
            error: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
          },
          { status: 400 },
        );
      }
      data = {
        phone: parsed.data.phone,
        address: parsed.data.address,
      };
    } else {
      const parsed = studentUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          {
            error: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
          },
          { status: 400 },
        );
      }
      data = {
        nim: parsed.data.nim,
        nik: parsed.data.nik,
        name: parsed.data.name,
        phone: parsed.data.phone,
        address: parsed.data.address,
      };
    }

    const student = await prisma.$transaction(async (transaction) => {
      const previousStudent = await transaction.student.findFirst({
        where: { id, deletedAt: null },
        select: {
          nim: true,
          nik: true,
          name: true,
          phone: true,
          address: true,
        },
      });

      if (!previousStudent) {
        return null;
      }

      const updatedStudent = await transaction.student.update({
        where: { id },
        data,
        select: {
          id: true,
          nim: true,
          nik: true,
          name: true,
          phone: true,
          address: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const fields: Record<string, unknown> = {};
      for (const field of ["nim", "nik", "name", "phone", "address"] as const) {
        if (previousStudent[field] !== updatedStudent[field]) {
          fields[field] = {
            before: previousStudent[field],
            after: updatedStudent[field],
          };
        }
      }

      await createAuditLog(transaction, authenticatedUser, {
        action: "UPDATE",
        entity: "Student",
        entityId: updatedStudent.id,
        changes: { fields },
      });

      return updatedStudent;
    });

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    return Response.json({ data: student });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Student not found" }, { status: 404 });
      }

      if (error.code === "P2002") {
        const target = Array.isArray(error.meta?.target)
          ? (error.meta?.target as string[]).join(", ")
          : String(error.meta?.target ?? "");
        if (target.includes("nim")) {
          return Response.json(
            { error: "Student with this NIM already exists" },
            { status: 409 },
          );
        }
        return Response.json(
          { error: "Student with this NIK already exists" },
          { status: 409 },
        );
      }
    }

    console.error("Failed to update student", error);
    return Response.json({ error: "Unable to update student" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("student:delete");
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new AuthorizationError(403, "Permission denied");
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid student ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const student = await transaction.student.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!student) return null;

      const deletedAt = new Date();
      const updated = await transaction.student.update({
        where: { id: student.id },
        data: { deletedAt },
        select: { id: true },
      });

      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Student",
        entityId: updated.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });

      return { id: updated.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("Failed to soft-delete student", error);
    return Response.json({ error: "Unable to delete student" }, { status: 500 });
  }
}
