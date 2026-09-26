import { PrismaClient } from "@prisma/client";
import {
  requireAuthenticatedUser,
  requirePermission,
  authorizationErrorResponse,
  ForbiddenError,
} from "@/lib/authorization";
import { studentProfileUpdateSchema } from "@/schemas/profile";
import { createAuditLog } from "@/lib/audit-log";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    if (user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: user.id },
        include: {
          enrollments: {
            include: {
              batch: {
                include: {
                  program: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!student) {
        return Response.json(
          { error: "Profil mahasiswa belum terhubung dengan akun ini." },
          { status: 404 }
        );
      }

      const activeEnrollment = student.enrollments[0] ?? null;

      return Response.json({
        id: student.id,
        name: student.name,
        nim: student.nim,
        nik: student.nik,
        phone: student.phone,
        address: student.address,
        email: user.email,
        role: user.role,
        enrollment: activeEnrollment
          ? {
              id: activeEnrollment.id,
              batchId: activeEnrollment.batchId,
              batchName: activeEnrollment.batch.name,
              programId: activeEnrollment.batch.program.id,
              programCode: activeEnrollment.batch.program.code,
              programName: activeEnrollment.batch.program.name,
              status: activeEnrollment.status,
            }
          : null,
      });
    }

    // Non-student users (Admin, Instructor, Staff, Management)
    return Response.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requirePermission("student:update");

    if (user.role !== "STUDENT") {
      throw new ForbiddenError("Hanya akun mahasiswa yang dapat memperbarui profil mahasiswa pribadi.");
    }

    const student = await prisma.student.findUnique({
      where: { userId: user.id },
    });

    if (!student) {
      return Response.json(
        { error: "Profil mahasiswa tidak ditemukan untuk akun ini." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = studentProfileUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Validasi gagal",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.student.update({
        where: { id: student.id },
        data: {
          phone: parsed.data.phone !== undefined ? parsed.data.phone : student.phone,
          address: parsed.data.address !== undefined ? parsed.data.address : student.address,
        },
        select: {
          id: true,
          name: true,
          nim: true,
          nik: true,
          phone: true,
          address: true,
        },
      });

      await createAuditLog(
        tx,
        user,
        {
          action: "UPDATE",
          entity: "Student",
          entityId: student.id,
          changes: {
            phone: s.phone,
            address: s.address,
          },
        }
      );

      return s;
    });

    return Response.json({
      success: true,
      message: "Profil berhasil diperbarui.",
      data: {
        ...updated,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
