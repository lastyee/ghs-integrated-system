import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { studentCreateSchema } from "@/schemas/student";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const authenticatedUser = await requirePermission("student:read");

    const studentSelect = {
      id: true,
      nim: true,
      nik: true,
      name: true,
      phone: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    } as const;

    const students = await prisma.student.findMany({
      where:
        authenticatedUser.role === "STUDENT"
          ? { userId: authenticatedUser.id }
          : undefined,
      select: {
        ...studentSelect,
      },
      orderBy: {
        name: "asc",
      },
    });

    if (authenticatedUser.role === "STUDENT" && students.length === 0) {
      throw new ForbiddenError();
    }

    return Response.json({ data: students });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read students", error);
    return Response.json({ error: "Unable to load students" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("student:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = studentCreateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const student = await prisma.$transaction(async (transaction) => {
      const createdStudent = await transaction.student.create({
        data: {
          nim: parsed.data.nim,
          nik: parsed.data.nik,
          name: parsed.data.name,
          phone: parsed.data.phone,
          address: parsed.data.address,
        },
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

      await createAuditLog(transaction, authenticatedUser, {
        action: "CREATE",
        entity: "Student",
        entityId: createdStudent.id,
        changes: {
          fields: {
            nim: { after: createdStudent.nim },
            nik: { after: createdStudent.nik },
            name: { after: createdStudent.name },
            phone: { after: createdStudent.phone },
            address: { after: createdStudent.address },
          },
        },
      });

      return createdStudent;
    });

    return Response.json({ data: student }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
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

    console.error("Failed to create student", error);
    return Response.json({ error: "Unable to create student" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    { error: "Method Not Allowed. Historical records are immutable." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}
