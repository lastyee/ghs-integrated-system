import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requireAuthenticatedUser,
} from "@/lib/authorization";

const prisma = new PrismaClient();

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT", "ACADEMIC_STAFF"];

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser();

    if (!ALLOWED_ROLES.includes(user.role)) {
      throw new ForbiddenError("Access to academic reports is restricted");
    }

    const { searchParams } = new URL(request.url);
    const batchIdParam = searchParams.get("batchId")?.trim() || "";
    const startDateParam = searchParams.get("startDate")?.trim() || "";
    const endDateParam = searchParams.get("endDate")?.trim() || "";

    const activeBatchId = batchIdParam && batchIdParam !== "ALL" ? batchIdParam : null;

    // Validate date inputs
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (startDateParam) {
      startDate = new Date(startDateParam);
      if (isNaN(startDate.getTime())) {
        return Response.json({ error: "Format startDate tidak valid" }, { status: 400 });
      }
    }

    if (endDateParam) {
      endDate = new Date(endDateParam);
      if (isNaN(endDate.getTime())) {
        return Response.json({ error: "Format endDate tidak valid" }, { status: 400 });
      }
    }

    if (startDate && endDate && startDate > endDate) {
      return Response.json(
        { error: "startDate tidak boleh lebih besar dari endDate" },
        { status: 400 },
      );
    }

    // Verify batch existence if specified
    if (activeBatchId) {
      const batchExists = await prisma.batch.findFirst({
        where: { id: activeBatchId, deletedAt: null },
      });
      if (!batchExists) {
        return Response.json({ error: "Batch tidak ditemukan" }, { status: 404 });
      }
    }

    // Common date filter object for query ranges
    const dateRangeFilter =
      startDate || endDate
        ? {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          }
        : undefined;

    // Available batches for filtering
    const availableBatchesPromise = prisma.batch.findMany({
      where: { deletedAt: null, program: { deletedAt: null } },
      select: { id: true, name: true },
      orderBy: { startDate: "asc" },
    });

    // Academic Core Counts
    const totalStudentsPromise = activeBatchId
      ? prisma.student.count({
          where: {
            deletedAt: null,
            enrollments: {
              some: {
                batchId: activeBatchId,
                deletedAt: null,
              },
            },
          },
        })
      : prisma.student.count({ where: { deletedAt: null } });

    const totalBatchesPromise = activeBatchId
      ? 1
      : prisma.batch.count({ where: { deletedAt: null, program: { deletedAt: null } } });

    const totalProgramsPromise = activeBatchId
      ? prisma.program.count({
          where: {
            deletedAt: null,
            batches: {
              some: { id: activeBatchId, deletedAt: null },
            },
          },
        })
      : prisma.program.count({ where: { deletedAt: null } });

    const totalClassesPromise = prisma.class.count({
      where: {
        deletedAt: null,
        ...(activeBatchId ? { batchId: activeBatchId } : {}),
        batch: { deletedAt: null, program: { deletedAt: null } },
        instructor: { deletedAt: null },
      },
    });

    const activeEnrollmentsPromise = prisma.enrollment.count({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        student: { deletedAt: null },
        ...(activeBatchId ? { batchId: activeBatchId } : {}),
        batch: { deletedAt: null, program: { deletedAt: null } },
      },
    });

    const totalEnrollmentsPromise = prisma.enrollment.count({
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        ...(activeBatchId ? { batchId: activeBatchId } : {}),
        batch: { deletedAt: null, program: { deletedAt: null } },
      },
    });

    // Attendance stats
    const attendanceStatsPromise = prisma.attendance.groupBy({
      by: ["status"],
      _count: { status: true },
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        schedule: {
          deletedAt: null,
          ...(dateRangeFilter ? { date: dateRangeFilter } : {}),
          subject: { deletedAt: null },
          instructor: { deletedAt: null },
          class: {
            deletedAt: null,
            ...(activeBatchId ? { batchId: activeBatchId } : {}),
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          },
        },
      },
    });

    // Assessment Score stats
    const scoreStatsPromise = prisma.assessmentScore.aggregate({
      _avg: { score: true },
      _count: { id: true },
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        ...(dateRangeFilter ? { createdAt: dateRangeFilter } : {}),
        assessment: {
          deletedAt: null,
          subject: { deletedAt: null },
          class: {
            deletedAt: null,
            ...(activeBatchId ? { batchId: activeBatchId } : {}),
            batch: { deletedAt: null, program: { deletedAt: null } },
            instructor: { deletedAt: null },
          },
        },
      },
    });

    // Assignment stats
    const assignmentStatsPromise = prisma.assignment.groupBy({
      by: ["status"],
      _count: { status: true },
      where: {
        deletedAt: null,
        ...(dateRangeFilter ? { dueDate: dateRangeFilter } : {}),
        class: {
          deletedAt: null,
          ...(activeBatchId ? { batchId: activeBatchId } : {}),
          batch: { deletedAt: null, program: { deletedAt: null } },
        },
      },
    });

    // Assignment submission stats
    const submissionStatsPromise = prisma.assignmentSubmission.groupBy({
      by: ["status"],
      _count: { status: true },
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        ...(dateRangeFilter ? { submittedAt: dateRangeFilter } : {}),
        assignment: {
          deletedAt: null,
          class: {
            deletedAt: null,
            ...(activeBatchId ? { batchId: activeBatchId } : {}),
            batch: { deletedAt: null, program: { deletedAt: null } },
          },
        },
      },
    });

    const averageSubmissionScorePromise = prisma.assignmentSubmission.aggregate({
      _avg: { score: true },
      _count: { id: true },
      where: {
        deletedAt: null,
        status: "GRADED",
        score: { not: null },
        student: { deletedAt: null },
        ...(dateRangeFilter ? { submittedAt: dateRangeFilter } : {}),
        assignment: {
          deletedAt: null,
          class: {
            deletedAt: null,
            ...(activeBatchId ? { batchId: activeBatchId } : {}),
            batch: { deletedAt: null, program: { deletedAt: null } },
          },
        },
      },
    });

    const [
      availableBatches,
      totalStudents,
      totalBatches,
      totalPrograms,
      totalClasses,
      activeEnrollments,
      totalEnrollments,
      attendanceStats,
      scoreStats,
      assignmentStats,
      submissionStats,
      submissionScoreStats,
    ] = await Promise.all([
      availableBatchesPromise,
      totalStudentsPromise,
      totalBatchesPromise,
      totalProgramsPromise,
      totalClassesPromise,
      activeEnrollmentsPromise,
      totalEnrollmentsPromise,
      attendanceStatsPromise,
      scoreStatsPromise,
      assignmentStatsPromise,
      submissionStatsPromise,
      averageSubmissionScorePromise,
    ]);

    // Process attendance rate
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
        : null;

    const averageAssessmentScore =
      scoreStats._count.id > 0 && scoreStats._avg.score !== null
        ? Math.round(Number(scoreStats._avg.score) * 10) / 10
        : null;

    // Process assignment breakdown
    const assignmentStatusBreakdown = {
      DRAFT: 0,
      PUBLISHED: 0,
      CLOSED: 0,
    };
    let totalAssignments = 0;
    for (const stat of assignmentStats) {
      if (stat.status in assignmentStatusBreakdown) {
        assignmentStatusBreakdown[stat.status as keyof typeof assignmentStatusBreakdown] =
          stat._count.status;
      }
      totalAssignments += stat._count.status;
    }

    // Process submission breakdown
    const submissionStatusBreakdown = {
      SUBMITTED: 0,
      LATE: 0,
      GRADED: 0,
      RESUBMITTED: 0,
    };
    let totalSubmissions = 0;
    for (const stat of submissionStats) {
      if (stat.status in submissionStatusBreakdown) {
        submissionStatusBreakdown[stat.status as keyof typeof submissionStatusBreakdown] =
          stat._count.status;
      }
      totalSubmissions += stat._count.status;
    }

    const averageSubmissionScore =
      submissionScoreStats._avg.score !== null
        ? Math.round(Number(submissionScoreStats._avg.score) * 10) / 10
        : null;

    return Response.json({
      data: {
        totalStudents,
        totalBatches,
        totalPrograms,
        totalClasses,
        activeEnrollments,
        totalEnrollments,
        attendanceRate,
        totalAttendanceRecords,
        averageAssessmentScore,
        totalScoreRecords: scoreStats._count.id,
        assignmentsSummary: {
          totalAssignments,
          statusBreakdown: assignmentStatusBreakdown,
          totalSubmissions,
          submissionStatusBreakdown,
          averageSubmissionScore,
          totalGradedSubmissions: submissionScoreStats._count.id,
        },
        availableBatches,
        appliedFilters: {
          batchId: activeBatchId,
          startDate: startDateParam || null,
          endDate: endDateParam || null,
        },
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
