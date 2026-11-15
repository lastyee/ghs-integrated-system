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
      throw new ForbiddenError("Access to attendance reports is restricted");
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

    // Schedule stats
    const scheduleStatsPromise = prisma.schedule.groupBy({
      by: ["status"],
      _count: { status: true },
      where: {
        deletedAt: null,
        ...(dateRangeFilter ? { date: dateRangeFilter } : {}),
        class: {
          deletedAt: null,
          ...(activeBatchId ? { batchId: activeBatchId } : {}),
          batch: { deletedAt: null, program: { deletedAt: null } },
        },
      },
    });

    // Attendance status stats
    const statusStatsPromise = prisma.attendance.groupBy({
      by: ["status"],
      _count: { status: true },
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        schedule: {
          deletedAt: null,
          ...(dateRangeFilter ? { date: dateRangeFilter } : {}),
          class: {
            deletedAt: null,
            ...(activeBatchId ? { batchId: activeBatchId } : {}),
            batch: { deletedAt: null, program: { deletedAt: null } },
          },
          subject: { deletedAt: null },
          instructor: { deletedAt: null },
        },
      },
    });

    // Absence type breakdown
    const absenceStatsPromise = prisma.attendance.groupBy({
      by: ["absenceType"],
      _count: { absenceType: true },
      where: {
        deletedAt: null,
        student: { deletedAt: null },
        schedule: {
          deletedAt: null,
          ...(dateRangeFilter ? { date: dateRangeFilter } : {}),
          class: {
            deletedAt: null,
            ...(activeBatchId ? { batchId: activeBatchId } : {}),
            batch: { deletedAt: null, program: { deletedAt: null } },
          },
          subject: { deletedAt: null },
          instructor: { deletedAt: null },
        },
        absenceType: { not: null },
      },
    });

    // Batches with their attendances
    const batchesPromise = prisma.batch.findMany({
      where: {
        deletedAt: null,
        program: { deletedAt: null },
        ...(activeBatchId ? { id: activeBatchId } : {}),
      },
      select: {
        id: true,
        name: true,
        classes: {
          where: { deletedAt: null, instructor: { deletedAt: null } },
          select: {
            schedules: {
              where: {
                deletedAt: null,
                subject: { deletedAt: null },
                instructor: { deletedAt: null },
                ...(dateRangeFilter ? { date: dateRangeFilter } : {}),
              },
              select: {
                attendances: {
                  where: { deletedAt: null, student: { deletedAt: null } },
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
    });

    const [availableBatches, scheduleStats, statusStats, absenceStats, batches] =
      await Promise.all([
        availableBatchesPromise,
        scheduleStatsPromise,
        statusStatsPromise,
        absenceStatsPromise,
        batchesPromise,
      ]);

    // Process Schedule stats
    const scheduleStatusBreakdown = {
      SCHEDULED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    let totalSchedules = 0;
    for (const stat of scheduleStats) {
      if (stat.status in scheduleStatusBreakdown) {
        scheduleStatusBreakdown[stat.status as keyof typeof scheduleStatusBreakdown] =
          stat._count.status;
      }
      totalSchedules += stat._count.status;
    }

    // Process Attendance stats
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
        : null;

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
        bTotal > 0 ? Math.round(((bPresent + bLate) / bTotal) * 1000) / 10 : null;

      return {
        batchId: batch.id,
        batchName: batch.name,
        totalRecords: bTotal,
        attendanceRate: rate,
      };
    });

    return Response.json({
      data: {
        totalSchedules,
        scheduleStatusBreakdown,
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

    console.error("Failed to generate attendance report", error);
    return Response.json({ error: "Unable to generate attendance report" }, { status: 500 });
  }
}
