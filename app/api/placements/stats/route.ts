import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const authenticatedUser = await requirePermission("placement:read");

    const baseWhere: Prisma.PlacementWhereInput = {
      deletedAt: null,
      student: { deletedAt: null },
      employer: { deletedAt: null },
      AND: [
        {
          OR: [
            { vacancyId: null },
            { vacancy: { deletedAt: null, employer: { deletedAt: null } } },
          ],
        },
        {
          OR: [
            { applicationId: null },
            {
              application: {
                deletedAt: null,
                student: { deletedAt: null },
                vacancy: { deletedAt: null, employer: { deletedAt: null } },
              },
            },
          ],
        },
      ],
    };

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found for this user.");
      }

      baseWhere.studentId = student.id;
    }

    const groupedStats = await prisma.placement.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { status: true },
    });

    const byStatus = {
      PREPARATION: 0,
      READY: 0,
      DEPARTED: 0,
      PLACED: 0,
      CANCELLED: 0,
    };

    let total = 0;
    for (const item of groupedStats) {
      if (item.status in byStatus) {
        byStatus[item.status as keyof typeof byStatus] = item._count.status;
      }
      total += item._count.status;
    }

    const active =
      byStatus.PREPARATION +
      byStatus.READY +
      byStatus.DEPARTED +
      byStatus.PLACED;

    return Response.json(
      {
        data: {
          total,
          active,
          byStatus,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/placements/stats error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
