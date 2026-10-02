import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireLinkedInstructor } from "@/lib/instructor-ownership";
import { scheduleCreateSchema } from "@/schemas/schedule";

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

export async function GET() {
  try {
    const authenticatedUser = await requirePermission("schedule:read");
    const where = {
      deletedAt: null,
      class: {
        deletedAt: null,
        batch: { deletedAt: null, program: { deletedAt: null } },
        instructor: { deletedAt: null },
      },
      subject: { deletedAt: null },
      instructor: { deletedAt: null },
      ...(authenticatedUser.role === "INSTRUCTOR"
        ? { instructorId: (await requireLinkedInstructor(authenticatedUser)).id }
        : {}),
    };

    const schedules = await prisma.schedule.findMany({
      where,
      select: scheduleSelect,
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }],
    });

    return Response.json({ data: schedules });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read schedules", error);
    return Response.json(
      { error: "Unable to load schedules" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("schedule:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = scheduleCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (new Date(parsed.data.endTime) < new Date(parsed.data.startTime)) {
      return Response.json(
        { error: "endTime must not be earlier than startTime" },
        { status: 400 },
      );
    }

    const [classRecord, subject, instructor] = await Promise.all([
      prisma.class.findUnique({
        where: {
          id: parsed.data.classId,
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        select: { id: true },
      }),
      prisma.subject.findUnique({
        where: { id: parsed.data.subjectId, deletedAt: null },
        select: { id: true },
      }),
      prisma.instructor.findUnique({
        where: { id: parsed.data.instructorId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    if (!classRecord) {
      return Response.json({ error: "Class not found" }, { status: 404 });
    }

    if (!subject) {
      return Response.json({ error: "Subject not found" }, { status: 404 });
    }

    if (!instructor) {
      return Response.json({ error: "Instructor not found" }, { status: 404 });
    }

    const schedule = await prisma.$transaction(async (tx) => {
      const created = await tx.schedule.create({
        data: {
          classId: parsed.data.classId,
          subjectId: parsed.data.subjectId,
          instructorId: parsed.data.instructorId,
          date: new Date(parsed.data.date),
          startTime: new Date(parsed.data.startTime),
          endTime: new Date(parsed.data.endTime),
          room: parsed.data.room ?? null,
          dressCode: parsed.data.dressCode ?? null,
          topic: parsed.data.topic ?? null,
        },
        select: scheduleSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "CREATE",
        entity: "Schedule",
        entityId: created.id,
        changes: {
          fields: {
            classId: { after: created.classId },
            subjectId: { after: created.subjectId },
            instructorId: { after: created.instructorId },
            date: { after: created.date.toISOString() },
            startTime: { after: created.startTime.toISOString() },
            endTime: { after: created.endTime.toISOString() },
            room: { after: created.room },
            dressCode: { after: created.dressCode },
            topic: { after: created.topic },
            status: { after: created.status },
          },
        },
      });

      return created;
    });

    return Response.json({ data: schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return Response.json(
        { error: "Class, subject, or instructor not found" },
        { status: 404 },
      );
    }

    console.error("Failed to create schedule", error);
    return Response.json(
      { error: "Unable to create schedule" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Historical records are immutable." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}
