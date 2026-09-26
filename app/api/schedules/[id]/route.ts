import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";

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
    await requirePermission("schedule:read");
    const { id } = await params;

    const schedule = await prisma.schedule.findUnique({
      where: { id },
      select: scheduleSelect,
    });

    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
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

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Historical records are immutable." },
    { status: 405, headers: { Allow: "GET" } },
  );
}
