import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requireAuthenticatedUser,
} from "@/lib/authorization";

const prisma = new PrismaClient();

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT", "ACADEMIC_STAFF"];

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    if (!ALLOWED_ROLES.includes(user.role)) {
      throw new ForbiddenError("Access to attendance reports is restricted");
    }

    const [statusStats, absenceStats, batches] = await Promise.all([
      prisma.attendance.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.attendance.groupBy({
        by: ["absenceType"],
        _count: { absenceType: true },
        where: {
          absenceType: { not: null },
        },
      }),
      prisma.batch.findMany({
        select: {
          id: true,
          name: true,
          classes: {
            select: {
              schedules: {
                select: {
                  attendances: {
                    select: {
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { startDate: "asc" },
      }),
    ]);

    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let totalRecords = 0;

    for (const stat of statusStats) {
      totalRecords += stat._count.status;
      if (stat.status === "PRESENT") {
        presentCount = stat._count.status;
      } else if (stat.status === "LATE") {
        lateCount = stat._count.status;
      } else if (stat.status === "ABSENT") {
        absentCount = stat._count.status;
      }
    }

    let sickCount = 0;
    let permittedCount = 0;
    let unexcusedCount = 0;

    for (const stat of absenceStats) {
      if (stat.absenceType === "SICK") {
        sickCount = stat._count.absenceType;
      } else if (stat.absenceType === "PERMITTED") {
        permittedCount = stat._count.absenceType;
      } else if (stat.absenceType === "UNEXCUSED") {
        unexcusedCount = stat._count.absenceType;
      }
    }

    const overallAttendanceRate =
      totalRecords > 0
        ? Math.round(((presentCount + lateCount) / totalRecords) * 1000) / 10
        : 100;

    const batchRates = batches.map((batch) => {
      let bPresent = 0;
      let bLate = 0;
      let bTotal = 0;

      for (const cls of batch.classes) {
        for (const schedule of cls.schedules) {
          for (const att of schedule.attendances) {
            bTotal += 1;
            if (att.status === "PRESENT") bPresent += 1;
            else if (att.status === "LATE") bLate += 1;
          }
        }
      }

      const rate =
        bTotal > 0 ? Math.round(((bPresent + bLate) / bTotal) * 1000) / 10 : 100;

      return {
        batchId: batch.id,
        batchName: batch.name,
        totalRecords: bTotal,
        attendanceRate: rate,
      };
    });

    return Response.json({
      data: {
        totalRecords,
        presentCount,
        lateCount,
        absentCount,
        absenceBreakdown: {
          sick: sickCount,
          permitted: permittedCount,
          unexcused: unexcusedCount,
        },
        overallAttendanceRate,
        batchRates,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to generate attendance report", error);
    return Response.json({ error: "Unable to generate attendance report" }, { status: 500 });
  }
}
