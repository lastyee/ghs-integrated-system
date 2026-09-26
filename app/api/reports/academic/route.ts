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
      prisma.batch.count(),
      prisma.program.count(),
      prisma.class.count(),
      prisma.attendance.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.assessmentScore.aggregate({
        _avg: { score: true },
        _count: { id: true },
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
