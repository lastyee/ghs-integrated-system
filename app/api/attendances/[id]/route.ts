import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { attendanceUpdateSchema } from "@/schemas/attendance";
import { attendanceSelect } from "../route";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("attendance:read");
    const { id } = await params;

    const attendance = await prisma.attendance.findUnique({
      where: { id },
      select: attendanceSelect,
    });

    if (!attendance) {
      return Response.json({ error: "Attendance not found" }, { status: 404 });
    }

    if (authenticatedUser.role === "STUDENT") {
      if (attendance.student.userId !== authenticatedUser.id) {
        throw new ForbiddenError();
      }
    }

    return Response.json({ data: attendance });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read attendance", error);
    return Response.json({ error: "Unable to load attendance" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("attendance:update");

    if (authenticatedUser.role !== "SUPER_ADMIN" && authenticatedUser.role !== "ADMIN") {
      throw new ForbiddenError();
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = attendanceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const existingAttendance = await prisma.attendance.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        absenceType: true,
        lateMinutes: true,
        notes: true,
      },
    });

    if (!existingAttendance) {
      return Response.json({ error: "Attendance not found" }, { status: 404 });
    }

    const updateData: Prisma.AttendanceUpdateInput = {};
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.absenceType !== undefined) updateData.absenceType = parsed.data.absenceType;
    if (parsed.data.lateMinutes !== undefined) updateData.lateMinutes = parsed.data.lateMinutes;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({
        where: { id },
        data: updateData,
        select: attendanceSelect,
      });

      const fields: Record<string, unknown> = {};
      for (const field of ["status", "absenceType", "lateMinutes", "notes"] as const) {
        if (existingAttendance[field] !== result[field]) {
          fields[field] = {
            before: existingAttendance[field],
            after: result[field],
          };
        }
      }

      if (Object.keys(fields).length > 0) {
        await createAuditLog(tx, authenticatedUser, {
          action: "UPDATE",
          entity: "Attendance",
          entityId: id,
          changes: { fields },
        });
      }

      return result;
    });

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to update attendance", error);
    return Response.json({ error: "Unable to update attendance" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Attendance records are immutable." },
    { status: 405, headers: { Allow: "GET, PATCH" } },
  );
}
