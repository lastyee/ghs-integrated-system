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
      throw new ForbiddenError("Access to academic reports is restricted");
    }

    const [
      totalStudents,
      totalBatches,
      totalPrograms,
      totalClasses,
      attendanceStats,
      scoreStats,
    ] = await Promise.all([
      prisma.student.count({ where: { deletedAt: null } }),
      prisma.batch.count({ where: { deletedAt: null, program: { deletedAt: null } } }),
      prisma.program.count({ where: { deletedAt: null } }),
      prisma.class.count({
        where: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
      }),
      prisma.attendance.groupBy({
        by: ["status"],
        _count: { status: true },
        where: {
          deletedAt: null,
          student: { deletedAt: null },
          schedule: {
            deletedAt: null,
            subject: { deletedAt: null },
            instructor: { deletedAt: null },
            class: {
              deletedAt: null,
              batch: { deletedAt: null, program: { deletedAt: null } },
              instructor: { deletedAt: null },
            },
          },
        },
      }),
      prisma.assessmentScore.aggregate({
        _avg: { score: true },
        _count: { id: true },
        where: {
          deletedAt: null,
          student: { deletedAt: null },
          assessment: {
            deletedAt: null,
            subject: { deletedAt: null },
            class: {
              deletedAt: null,
              batch: { deletedAt: null, program: { deletedAt: null } },
              instructor: { deletedAt: null },
            },
          },
        },
      }),
    ]);

    let presentCount = 0;
    let lateCount = 0;
    let totalAttendanceRecords = 0;

    for (const stat of attendanceStats) {
      totalAttendanceRecords += stat._count.status;
      if (stat.status === "PRESENT") {
        presentCount += stat._count.status;
      } else if (stat.status === "LATE") {
        lateCount += stat._count.status;
      }
    }

    const attendanceRate =
      totalAttendanceRecords > 0
        ? Math.round(((presentCount + lateCount) / totalAttendanceRecords) * 1000) / 10
        : 100;

    const averageAssessmentScore =
      scoreStats._avg.score !== null
        ? Math.round(Number(scoreStats._avg.score) * 10) / 10
        : 0;

    return Response.json({
      data: {
        totalStudents,
        totalBatches,
        totalPrograms,
        totalClasses,
        attendanceRate,
        averageAssessmentScore,
        totalScoreRecords: scoreStats._count.id,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to generate academic report", error);
    return Response.json({ error: "Unable to generate academic report" }, { status: 500 });
  }
}
