import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireStudentOwnership } from "@/lib/student-ownership";
import { studentUpdateSchema } from "@/schemas/student";

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
    }

    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        nim: true,
        nik: true,
        name: true,
        phone: true,
        address: true,
        createdAt: true,
        updatedAt: true,
        enrollments: {
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

    const parsed = studentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const data: Prisma.StudentUpdateInput = {};

    if (parsed.data.nim !== undefined) {
      data.nim = parsed.data.nim;
    }

    if (parsed.data.nik !== undefined) {
      data.nik = parsed.data.nik;
    }

    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
    }

    if (parsed.data.phone !== undefined) {
      data.phone = parsed.data.phone;
    }

    if (parsed.data.address !== undefined) {
      data.address = parsed.data.address;
    }

    const student = await prisma.$transaction(async (transaction) => {
      const previousStudent = await transaction.student.findUnique({
        where: { id },
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

export async function DELETE() {
  return Response.json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "GET, PATCH" } },
  );
}

