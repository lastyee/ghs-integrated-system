import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireLinkedInstructor } from "@/lib/instructor-ownership";
import { studentCreateSchema } from "@/schemas/student";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search") || "";

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const authenticatedUser = await requirePermission("student:read");
    const baseWhere =
      authenticatedUser.role === "STUDENT"
        ? { userId: authenticatedUser.id, deletedAt: null }
        : authenticatedUser.role === "INSTRUCTOR"
          ? {
              deletedAt: null,
              enrollments: {
                some: {
                  deletedAt: null,
                  batch: {
                    deletedAt: null,
                    classes: {
                      some: {
                        deletedAt: null,
                        instructorId: (await requireLinkedInstructor(authenticatedUser)).id,
                      },
                    },
                  },
                },
              },
            }
          : { deletedAt: null };

    const searchWhere = searchStr
      ? {
          OR: [
            { name: { contains: searchStr, mode: "insensitive" as const } },
            { nim: { contains: searchStr, mode: "insensitive" as const } },
            { nik: { contains: searchStr, mode: "insensitive" as const } },
            { phone: { contains: searchStr, mode: "insensitive" as const } },
            { address: { contains: searchStr, mode: "insensitive" as const } },
          ],
        }
      : {};

    const where: Prisma.StudentWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const studentSelect = {
      id: true,
      nim: true,
      nik: true,
      name: true,
      phone: true,
      address: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    } as const;

    const [students, total] = await prisma.$transaction([
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        select: {
          ...studentSelect,
        },
        orderBy: {
          name: "asc",
        },
      }),
      prisma.student.count({ where }),
    ]);

    if (authenticatedUser.role === "STUDENT" && total === 0) {
      throw new ForbiddenError();
    }

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      data: students,
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
          status: true,
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
