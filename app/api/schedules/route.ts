import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requireAuthenticatedUser,
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search") || "";

    const statusFilter = searchParams.get("status") || "ALL";
    const dateFilter = searchParams.get("date") || "ALL";
    const batchFilter = searchParams.get("batch") || "ALL";
    const subjectFilter = searchParams.get("subject") || "ALL";
    const instructorFilter = searchParams.get("instructor") || "ALL";

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const authenticatedUser = await requireAuthenticatedUser();
    if (authenticatedUser.role !== "STUDENT") {
      await requirePermission("schedule:read");
    }

    const baseWhere: Prisma.ScheduleWhereInput = {
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
      ...(authenticatedUser.role === "INSTRUCTOR"
        ? { instructorId: (await requireLinkedInstructor(authenticatedUser)).id }
        : {}),
    };

    if (statusFilter !== "ALL") {
      baseWhere.status = statusFilter as "SCHEDULED" | "COMPLETED" | "CANCELLED";
    }

    if (dateFilter !== "ALL") {
      const d = new Date(dateFilter);
      if (!isNaN(d.getTime())) {
        baseWhere.date = {
          gte: d,
          lt: new Date(d.getTime() + 24 * 60 * 60 * 1000),
        };
      }
    }

    if (batchFilter !== "ALL") {
      baseWhere.class = {
        ...(baseWhere.class as Prisma.ClassWhereInput),
        batch: {
          ...((baseWhere.class as Prisma.ClassWhereInput)?.batch as Prisma.BatchWhereInput),
          name: batchFilter,
        },
      };
    }

    if (subjectFilter !== "ALL") {
      baseWhere.subject = {
        ...(baseWhere.subject as Prisma.SubjectWhereInput),
        name: subjectFilter,
      };
    }

    if (instructorFilter !== "ALL") {
      baseWhere.instructor = {
        ...(baseWhere.instructor as Prisma.InstructorWhereInput),
        name: instructorFilter,
      };
    }

    const searchWhere: Prisma.ScheduleWhereInput = searchStr
      ? {
          OR: [
            { subject: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { instructor: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { class: { batch: { name: { contains: searchStr, mode: "insensitive" as const } } } },
            { room: { contains: searchStr, mode: "insensitive" as const } },
            { dressCode: { contains: searchStr, mode: "insensitive" as const } },
            { topic: { contains: searchStr, mode: "insensitive" as const } },
          ],
        }
      : {};

    const where: Prisma.ScheduleWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const [
      schedules,
      total,
      distinctDatesObj,
      totalSchedules,
      ghi07Count,
      ghi08Count,
      scheduledCount,
      distinctSubjects,
      distinctInstructors,
      distinctClasses,
    ] = await prisma.$transaction([
      prisma.schedule.findMany({
        where,
        skip,
        take: limit,
        select: scheduleSelect,
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }],
      }),
      prisma.schedule.count({ where }),
      prisma.schedule.findMany({
        where: baseWhere,
        select: { date: true },
        distinct: ["date"],
        orderBy: { date: "asc" },
      }),
      prisma.schedule.count({ where: baseWhere }),
      prisma.schedule.count({ where: { ...baseWhere, class: { batch: { name: "GHI-07" } } } }),
      prisma.schedule.count({ where: { ...baseWhere, class: { batch: { name: "GHI-08" } } } }),
      prisma.schedule.count({ where: { ...baseWhere, status: "SCHEDULED" } }),
      prisma.schedule.findMany({
        where: baseWhere,
        select: { subject: { select: { name: true } } },
        distinct: ["subjectId"],
      }),
      prisma.schedule.findMany({
        where: baseWhere,
        select: { instructor: { select: { name: true } } },
        distinct: ["instructorId"],
      }),
      prisma.schedule.findMany({
        where: baseWhere,
        select: { class: { select: { batch: { select: { name: true } } } } },
        distinct: ["classId"],
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const distinctDates = distinctDatesObj.map(d => d.date.toISOString().substring(0, 10));

    const distinctBatchNames = [...new Set(distinctClasses.map(c => c.class?.batch?.name).filter(Boolean) as string[])].sort();
    const distinctSubjectNames = [...new Set(distinctSubjects.map(s => s.subject?.name).filter(Boolean) as string[])].sort();
    const distinctInstructorNames = [...new Set(distinctInstructors.map(i => i.instructor?.name).filter(Boolean) as string[])].sort();

    return Response.json({
      data: schedules,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        totalSchedules,
        ghi07Count,
        ghi08Count,
        scheduledCount,
      },
      filterOptions: {
        dates: distinctDates,
        batches: distinctBatchNames,
        subjects: distinctSubjectNames,
        instructors: distinctInstructorNames,
      }
    });
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
