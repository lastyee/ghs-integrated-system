import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requireAuthenticatedUser,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireInstructorScheduleAccess } from "@/lib/instructor-ownership";
import { scheduleUpdateSchema } from "@/schemas/schedule";

const prisma = new PrismaClient();

const scheduleSelect = {
  id: true,
  classId: true,
  subjectId: true,
  instructorId: true,
  date: true,
  startTime: true,
  endTime: true,
  room: true,
  dressCode: true,
  topic: true,
  status: true,
  createdAt: true,
  updatedAt: true,
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
  subject: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  instructor: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requireAuthenticatedUser();
    if (authenticatedUser.role !== "STUDENT") {
      await requirePermission("schedule:read");
    }
    const { id } = await params;

    const schedule = await prisma.schedule.findFirst({
      where: {
        id,
        deletedAt: null,
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        subject: { deletedAt: null },
        instructor: { deletedAt: null },
        ...(authenticatedUser.role === "STUDENT"
          ? {
              class: {
                is: {
                  deletedAt: null,
                  batch: {
                    is: {
                      deletedAt: null,
                      program: { deletedAt: null },
                      enrollments: {
                        some: {
                          student: {
                            userId: authenticatedUser.id,
                            deletedAt: null,
                          },
                          status: "ACTIVE",
                          deletedAt: null,
                        },
                      },
                    },
                  },
                  instructor: { deletedAt: null },
                },
              },
            }
          : {}),
      },
      select: scheduleSelect,
    });

    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorScheduleAccess(authenticatedUser, id);
    }

    return Response.json({ data: schedule });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read schedule", error);
    return Response.json(
      { error: "Unable to load schedule" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("schedule:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = scheduleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const existingSchedule = await prisma.schedule.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        classId: true,
        subjectId: true,
        instructorId: true,
        date: true,
        startTime: true,
        endTime: true,
        room: true,
        dressCode: true,
        topic: true,
        status: true,
      },
    });

    if (!existingSchedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (parsed.data.classId !== undefined) {
      const classRecord = await prisma.class.findUnique({
        where: {
          id: parsed.data.classId,
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!classRecord) {
        return Response.json({ error: "Class not found" }, { status: 404 });
      }
    }

    if (parsed.data.subjectId !== undefined) {
      const subject = await prisma.subject.findUnique({
        where: { id: parsed.data.subjectId, deletedAt: null },
        select: { id: true },
      });
      if (!subject) {
        return Response.json({ error: "Subject not found" }, { status: 404 });
      }
    }

    if (parsed.data.instructorId !== undefined) {
      const instructor = await prisma.instructor.findUnique({
        where: { id: parsed.data.instructorId, deletedAt: null },
        select: { id: true },
      });
      if (!instructor) {
        return Response.json({ error: "Instructor not found" }, { status: 404 });
      }
    }

    const effectiveStartTime = parsed.data.startTime ? new Date(parsed.data.startTime) : existingSchedule.startTime;
    const effectiveEndTime = parsed.data.endTime ? new Date(parsed.data.endTime) : existingSchedule.endTime;

    if (effectiveEndTime < effectiveStartTime) {
      return Response.json(
        { error: "endTime must not be earlier than startTime" },
        { status: 400 },
      );
    }

    const data: Prisma.ScheduleUpdateInput = {};
    if (parsed.data.classId !== undefined) {
      data.class = { connect: { id: parsed.data.classId } };
    }
    if (parsed.data.subjectId !== undefined) {
      data.subject = { connect: { id: parsed.data.subjectId } };
    }
    if (parsed.data.instructorId !== undefined) {
      data.instructor = { connect: { id: parsed.data.instructorId } };
    }
    if (parsed.data.date !== undefined) {
      data.date = new Date(parsed.data.date);
    }
    if (parsed.data.startTime !== undefined) {
      data.startTime = new Date(parsed.data.startTime);
    }
    if (parsed.data.endTime !== undefined) {
      data.endTime = new Date(parsed.data.endTime);
    }
    if (parsed.data.room !== undefined) {
      data.room = parsed.data.room;
    }
    if (parsed.data.dressCode !== undefined) {
      data.dressCode = parsed.data.dressCode;
    }
    if (parsed.data.topic !== undefined) {
      data.topic = parsed.data.topic;
    }
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
    }

    const updated = await prisma.$transaction(async (transaction) => {
      const updatedSchedule = await transaction.schedule.update({
        where: { id },
        data,
        select: scheduleSelect,
      });

      const fields: Record<string, unknown> = {};
      if (existingSchedule.classId !== updatedSchedule.classId) {
        fields.classId = { before: existingSchedule.classId, after: updatedSchedule.classId };
      }
      if (existingSchedule.subjectId !== updatedSchedule.subjectId) {
        fields.subjectId = { before: existingSchedule.subjectId, after: updatedSchedule.subjectId };
      }
      if (existingSchedule.instructorId !== updatedSchedule.instructorId) {
        fields.instructorId = { before: existingSchedule.instructorId, after: updatedSchedule.instructorId };
      }
      if (existingSchedule.date.toISOString() !== updatedSchedule.date.toISOString()) {
        fields.date = { before: existingSchedule.date.toISOString(), after: updatedSchedule.date.toISOString() };
      }
      if (existingSchedule.startTime.toISOString() !== updatedSchedule.startTime.toISOString()) {
        fields.startTime = { before: existingSchedule.startTime.toISOString(), after: updatedSchedule.startTime.toISOString() };
      }
      if (existingSchedule.endTime.toISOString() !== updatedSchedule.endTime.toISOString()) {
        fields.endTime = { before: existingSchedule.endTime.toISOString(), after: updatedSchedule.endTime.toISOString() };
      }
      if (existingSchedule.room !== updatedSchedule.room) {
        fields.room = { before: existingSchedule.room, after: updatedSchedule.room };
      }
      if (existingSchedule.dressCode !== updatedSchedule.dressCode) {
        fields.dressCode = { before: existingSchedule.dressCode, after: updatedSchedule.dressCode };
      }
      if (existingSchedule.topic !== updatedSchedule.topic) {
        fields.topic = { before: existingSchedule.topic, after: updatedSchedule.topic };
      }
      if (existingSchedule.status !== updatedSchedule.status) {
        fields.status = { before: existingSchedule.status, after: updatedSchedule.status };
      }

      await createAuditLog(transaction, authenticatedUser, {
        action: "UPDATE",
        entity: "Schedule",
        entityId: updatedSchedule.id,
        changes: { fields },
      });

      return updatedSchedule;
    });

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return Response.json({ error: "Schedule not found" }, { status: 404 });
      }
      if (error.code === "P2003") {
        return Response.json({ error: "Related record not found" }, { status: 404 });
      }
    }

    console.error("Failed to update schedule", error);
    return Response.json({ error: "Unable to update schedule" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("schedule:delete");
    if (!["SUPER_ADMIN", "ADMIN"].includes(authenticatedUser.role)) {
      throw new ForbiddenError();
    }

    const { id } = await params;
    if (!id.trim()) {
      return Response.json({ error: "Invalid schedule ID" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const schedule = await transaction.schedule.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!schedule) return null;

      const deletedAt = new Date();
      await transaction.schedule.update({
        where: { id: schedule.id },
        data: { deletedAt },
      });
      await createAuditLog(transaction, authenticatedUser, {
        action: "DELETE",
        entity: "Schedule",
        entityId: schedule.id,
        changes: { deletedAt: { before: null, after: deletedAt.toISOString() } },
      });
      return { id: schedule.id, deletedAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }
    return Response.json({
      data: { id: result.id, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("Failed to soft-delete schedule", error);
    return Response.json({ error: "Unable to delete schedule" }, { status: 500 });
  }
}
