import { AttendanceStatus, AbsenceType, Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requireAuthenticatedUser,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  requireInstructorScheduleAccess,
  requireLinkedInstructor,
} from "@/lib/instructor-ownership";
import { attendanceCreateSchema } from "@/schemas/attendance";

const prisma = new PrismaClient();

export const attendanceSelect = {
  id: true,
  scheduleId: true,
  studentId: true,
  status: true,
  absenceType: true,
  lateMinutes: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
      userId: true,
    },
  },
  schedule: {
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      room: true,
      dressCode: true,
      topic: true,
      status: true,
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      class: {
        select: {
          id: true,
          name: true,
          batch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAuthenticatedUser();
    const authenticatedUser =
      sessionUser.role === "STUDENT"
        ? sessionUser
        : await requirePermission("attendance:read");
    const { searchParams } = new URL(request.url);

    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search") || "";
    const queryScheduleId = searchParams.get("scheduleId");
    const queryScheduleIds = searchParams.get("scheduleIds");
    const queryStudentId = searchParams.get("studentId");
    const queryStatus = searchParams.get("status");
    const queryAbsenceType = searchParams.get("absenceType");

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(1000, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const baseWhere: Prisma.AttendanceWhereInput = {
      deletedAt: null,
      student: { deletedAt: null },
      schedule: {
        deletedAt: null,
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        subject: { deletedAt: null },
        instructor: { deletedAt: null },
      },
    };

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError();
      }

      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError();
      }

      baseWhere.studentId = student.id;
      baseWhere.schedule = {
        deletedAt: null,
        class: {
          deletedAt: null,
          batch: {
            deletedAt: null,
            program: { deletedAt: null },
            enrollments: {
              some: {
                studentId: student.id,
                status: "ACTIVE",
                deletedAt: null,
              },
            },
          },
          instructor: { deletedAt: null },
        },
        subject: { deletedAt: null },
        instructor: { deletedAt: null },
      };
    } else if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      if (queryScheduleId) {
        await requireInstructorScheduleAccess(authenticatedUser, queryScheduleId);
      }
      baseWhere.schedule = {
        deletedAt: null,
        instructorId: instructor.id,
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        subject: { deletedAt: null },
        instructor: { deletedAt: null },
      };
    } else {
      if (queryStudentId) {
        baseWhere.studentId = queryStudentId;
      }
    }

    if (queryScheduleId) {
      baseWhere.scheduleId = queryScheduleId;
    } else if (searchParams.has("scheduleIds")) {
      const ids = (queryScheduleIds || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      baseWhere.scheduleId = { in: ids };
    }

    if (queryStatus && Object.values(AttendanceStatus).includes(queryStatus as AttendanceStatus)) {
      baseWhere.status = queryStatus as AttendanceStatus;
    }

    if (queryAbsenceType && Object.values(AbsenceType).includes(queryAbsenceType as AbsenceType)) {
      baseWhere.absenceType = queryAbsenceType as AbsenceType;
    }

    const searchWhere: Prisma.AttendanceWhereInput = searchStr
      ? {
          OR: [
            { student: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { student: { nim: { contains: searchStr, mode: "insensitive" as const } } },
            { schedule: { subject: { name: { contains: searchStr, mode: "insensitive" as const } } } },
            { schedule: { class: { batch: { name: { contains: searchStr, mode: "insensitive" as const } } } } },
          ],
        }
      : {};

    const where = { ...baseWhere, ...searchWhere };

    const globalAttendanceWhere: Prisma.AttendanceWhereInput = {
      deletedAt: null,
      student: { deletedAt: null },
      schedule: baseWhere.schedule,
      ...(authenticatedUser.role === "STUDENT" && baseWhere.studentId
        ? { studentId: baseWhere.studentId }
        : {}),
    };

    const completedSchedulesWhere: Prisma.ScheduleWhereInput = {
      ...baseWhere.schedule,
      attendances: {
        some: {
          deletedAt: null,
          ...(authenticatedUser.role === "STUDENT" && baseWhere.studentId
            ? { studentId: baseWhere.studentId }
            : {}),
        },
      },
    };

    const [attendances, total, totalSchedules, completedSchedules, globalTotalAttendances] =
      await prisma.$transaction([
        prisma.attendance.findMany({
          where,
          skip,
          take: limit,
          select: attendanceSelect,
          orderBy: [
            { schedule: { date: "asc" } },
            { schedule: { startTime: "asc" } },
            { student: { name: "asc" } },
          ],
        }),
        prisma.attendance.count({ where }),
        prisma.schedule.count({ where: baseWhere.schedule }),
        prisma.schedule.count({ where: completedSchedulesWhere }),
        prisma.attendance.count({ where: globalAttendanceWhere }),
      ]);

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      data: attendances,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        totalSchedules,
        completedSchedules,
        openSchedules: Math.max(0, totalSchedules - completedSchedules),
        totalAttendances: globalTotalAttendances,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read attendances", error);
    return Response.json({ error: "Unable to load attendances" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("attendance:create");

    if (
      authenticatedUser.role !== "SUPER_ADMIN" &&
      authenticatedUser.role !== "ADMIN" &&
      authenticatedUser.role !== "INSTRUCTOR"
    ) {
      throw new ForbiddenError();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = attendanceCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const schedule = await prisma.schedule.findUnique({
      where: {
        id: parsed.data.scheduleId,
        deletedAt: null,
        class: { deletedAt: null, batch: { deletedAt: null, program: { deletedAt: null } } },
        subject: { deletedAt: null },
        instructor: { deletedAt: null },
      },
      select: {
        id: true,
        instructorId: true,
        class: {
          select: {
            batchId: true,
          },
        },
      },
    });
    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }
    if (
      authenticatedUser.role === "INSTRUCTOR" &&
      schedule.instructorId !==
        (await requireLinkedInstructor(authenticatedUser)).id
    ) {
      throw new ForbiddenError();
    }

    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
      select: { id: true, deletedAt: true },
    });
    if (!student || student.deletedAt) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: parsed.data.studentId,
        batchId: schedule.class.batchId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!enrollment) {
      return Response.json(
        { error: "Student is not enrolled in the batch for this schedule" },
        { status: 400 },
      );
    }

    const existing = await prisma.attendance.findUnique({
      where: {
        scheduleId_studentId: {
          scheduleId: parsed.data.scheduleId,
          studentId: parsed.data.studentId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return Response.json(
        { error: "Attendance record already exists for this student and schedule" },
        { status: 409 },
      );
    }

    const attendance = await prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          scheduleId: parsed.data.scheduleId,
          studentId: parsed.data.studentId,
          status: parsed.data.status,
          absenceType: parsed.data.absenceType ?? null,
          lateMinutes: parsed.data.lateMinutes ?? null,
          notes: parsed.data.notes ?? null,
        },
        select: attendanceSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "CREATE",
        entity: "Attendance",
        entityId: created.id,
        changes: {
          fields: {
            scheduleId: { after: created.scheduleId },
            studentId: { after: created.studentId },
            status: { after: created.status },
            absenceType: { after: created.absenceType },
            lateMinutes: { after: created.lateMinutes },
            notes: { after: created.notes },
          },
        },
      });

      return created;
    });

    return Response.json({ data: attendance }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json(
        { error: "Attendance record already exists for this student and schedule" },
        { status: 409 },
      );
    }

    console.error("Failed to create attendance", error);
    return Response.json({ error: "Unable to create attendance" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Attendance deletion requires an individual record ID." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}
