import { PrismaClient } from "@prisma/client";
import {
  requireAuthenticatedUser,
  authorizationErrorResponse,
  ForbiddenError,
} from "@/lib/authorization";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const currentUser = await requireAuthenticatedUser();

    if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "ADMIN") {
      throw new ForbiddenError("Hanya Administrator yang memiliki akses ke data manajemen pengguna.");
    }

    const [users, totalStudents, activatedStudents] = await Promise.all([
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
    ]);

    const unactivatedStudents = totalStudents - activatedStudents;

    return Response.json({
      users,
      currentUserId: currentUser.id,
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
