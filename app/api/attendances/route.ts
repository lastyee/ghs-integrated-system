import { AttendanceStatus, AbsenceType, Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
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
    const authenticatedUser = await requirePermission("attendance:read");
    const { searchParams } = new URL(request.url);

    const queryScheduleId = searchParams.get("scheduleId");
    const queryStudentId = searchParams.get("studentId");
    const queryStatus = searchParams.get("status");
    const queryAbsenceType = searchParams.get("absenceType");

    const where: Prisma.AttendanceWhereInput = {};

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError();
      }

      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError();
      }

      where.studentId = student.id;
    } else {
      if (queryStudentId) {
        where.studentId = queryStudentId;
      }
    }

    if (queryScheduleId) {
      where.scheduleId = queryScheduleId;
    }

    if (queryStatus && Object.values(AttendanceStatus).includes(queryStatus as AttendanceStatus)) {
      where.status = queryStatus as AttendanceStatus;
    }

    if (queryAbsenceType && Object.values(AbsenceType).includes(queryAbsenceType as AbsenceType)) {
      where.absenceType = queryAbsenceType as AbsenceType;
    }

    const attendances = await prisma.attendance.findMany({
      where,
      select: attendanceSelect,
      orderBy: [
        { schedule: { date: "asc" } },
        { schedule: { startTime: "asc" } },
        { student: { name: "asc" } },
      ],
    });

    return Response.json({ data: attendances });
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

    if (authenticatedUser.role !== "SUPER_ADMIN" && authenticatedUser.role !== "ADMIN") {
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
      where: { id: parsed.data.scheduleId },
      select: {
        id: true,
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
    { message: "Method Not Allowed. Attendance records are immutable." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}
