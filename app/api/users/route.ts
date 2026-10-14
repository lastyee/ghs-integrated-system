import { Prisma, PrismaClient } from "@prisma/client";
import {
  requireAuthenticatedUser,
  authorizationErrorResponse,
  AuthorizationError,
  ForbiddenError,
} from "@/lib/authorization";
import { createUserSchema } from "@/schemas/user";
import { hashPassword } from "@/server/auth/password";
import { createAuditLog } from "@/lib/audit-log";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const currentUser = await requireAuthenticatedUser();

    if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "ADMIN") {
      throw new ForbiddenError("Hanya Administrator yang memiliki akses ke data manajemen pengguna.");
    }

    const [users, totalStudents, activatedStudents, unactivatedStudentsList] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          student: {
            select: {
              id: true,
              nim: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.student.count({ where: { deletedAt: null } }),
      prisma.student.count({
        where: { userId: { not: null }, deletedAt: null },
      }),
      prisma.student.findMany({
        where: { userId: null, deletedAt: null },
        select: {
          id: true,
          nim: true,
          name: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const unactivatedStudents = totalStudents - activatedStudents;

    const combinedUsers = [
      ...users.map(u => ({ ...u, isInactiveStudent: false })),
      ...unactivatedStudentsList.map(s => ({
        id: `student-${s.id}`,
        email: "-",
        name: s.name,
        createdAt: s.createdAt,
        role: { id: "student-role", name: "STUDENT" },
        student: { id: s.id, nim: s.nim, name: s.name },
        isInactiveStudent: true,
      }))
    ];

    return Response.json({
      users: combinedUsers,
      currentUserId: currentUser.id,
      currentUserRole: currentUser.role,
      stats: {
        totalUsers: users.length,
        totalStudents,
        activatedStudents,
        unactivatedStudents,
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireAuthenticatedUser();

    if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "ADMIN") {
      throw new ForbiddenError("Hanya Administrator yang memiliki akses untuk membuat akun pengguna.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error: "Validasi gagal",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, email, password, role: requestedRole } = parsed.data;

    // Enforce role creation privilege: only SUPER_ADMIN can create SUPER_ADMIN accounts
    if (requestedRole === "SUPER_ADMIN" && currentUser.role !== "SUPER_ADMIN") {
      throw new ForbiddenError("Hanya SUPER_ADMIN yang berwenang membuat akun dengan peran SUPER_ADMIN.");
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return Response.json(
        { error: "Email sudah digunakan oleh akun lain." },
        { status: 409 }
      );
    }

    // Find requested role
    const roleRecord = await prisma.role.findUnique({
      where: { name: requestedRole },
      select: { id: true, name: true },
    });

    if (!roleRecord) {
      return Response.json(
        { error: `Peran ${requestedRole} tidak ditemukan dalam sistem.` },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.$transaction(async (tx) => {
      // Re-verify under transaction to prevent race conditions
      const freshUser = await tx.user.findFirst({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (freshUser) {
        throw new Error("EMAIL_EXISTS");
      }

      const created = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          roleId: roleRecord.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await createAuditLog(
        tx,
        currentUser,
        {
          action: "CREATE",
          entity: "User",
          entityId: created.id,
          changes: {
            email: { before: null, after: created.email },
            name: { before: null, after: created.name },
            role: { before: null, after: roleRecord.name },
          },
        }
      );

      return created;
    });

    return Response.json(
      {
        success: true,
        message: `Akun pengguna ${newUser.name} (${newUser.role.name}) berhasil dibuat.`,
        user: newUser,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return Response.json(
        { error: "Email sudah digunakan oleh akun lain." },
        { status: 409 }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json(
        { error: "Email sudah digunakan oleh akun lain." },
        { status: 409 }
      );
    }

    console.error("Failed to create user in POST /api/users:", error);
    return Response.json(
      { error: "Terjadi kesalahan internal saat membuat akun pengguna." },
      { status: 500 }
    );
  }
}
