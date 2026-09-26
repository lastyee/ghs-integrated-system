import { PrismaClient } from "@prisma/client";
import {
  AuthenticatedUser,
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  isValidPlacementTransition,
  TERMINAL_PLACEMENT_STATUSES,
  updatePlacementSchema,
  updatePlacementStatusSchema,
} from "@/schemas/placement";
import { placementDetailSelect } from "../route";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("placement:read");
    const { id } = await params;

    const placement = await prisma.placement.findUnique({
      where: { id },
      select: placementDetailSelect,
    });

    if (!placement) {
      return Response.json(
        { message: "Placement not found." },
        { status: 404 }
      );
    }

    // Student IDOR Protection: Student can only view their own placement
    if (authenticatedUser.role === "STUDENT") {
      if (placement.student.userId !== authenticatedUser.id) {
        return Response.json(
          { message: "Permission denied." },
          { status: 403 }
        );
      }
    }

    return Response.json({ data: placement }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/placements/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const isStatusTransition = body.status !== undefined;

    // Check authorization:
    // Operational update requires placement:update
    // Status transition requires placement:update or placement:verify
    let authenticatedUser: AuthenticatedUser;
    if (isStatusTransition) {
      try {
        authenticatedUser = await requirePermission("placement:update");
      } catch (err) {
        if (err instanceof ForbiddenError) {
          authenticatedUser = await requirePermission("placement:verify");
        } else {
          throw err;
        }
      }
    } else {
      authenticatedUser = await requirePermission("placement:update");
    }

    const existing = await prisma.placement.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        position: true,
        startDate: true,
        notes: true,
        studentId: true,
        employerId: true,
        vacancyId: true,
        applicationId: true,
      },
    });

    if (!existing) {
      return Response.json(
        { message: "Placement not found." },
        { status: 404 }
      );
    }

    // Check terminal status (PLACED and CANCELLED cannot be mutated)
    if (TERMINAL_PLACEMENT_STATUSES.includes(existing.status)) {
      return Response.json(
        {
          message: `Cannot update placement that is already in terminal status (${existing.status}).`,
        },
        { status: 409 }
      );
    }

    if (isStatusTransition) {
      const parsed = updatePlacementStatusSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          {
            message: "Validation failed.",
            errors: parsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const nextStatus = parsed.data.status;

      if (!isValidPlacementTransition(existing.status, nextStatus)) {
        return Response.json(
          {
            message: `Invalid status transition from ${existing.status} to ${nextStatus}.`,
          },
          { status: 409 }
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const pl = await tx.placement.update({
          where: { id },
          data: {
            status: nextStatus,
            ...(parsed.data.notes !== undefined && {
              notes: parsed.data.notes?.trim() || null,
            }),
          },
          select: placementDetailSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: "STATUS_CHANGE",
          entity: "Placement",
          entityId: pl.id,
          changes: {
            status: {
              before: existing.status,
              after: pl.status,
            },
            ...(parsed.data.notes !== undefined && {
              notes: {
                before: existing.notes,
                after: pl.notes,
              },
            }),
          },
        });

        return pl;
      });

      return Response.json(
        {
          message: "Placement status updated successfully.",
          data: updated,
        },
        { status: 200 }
      );
    } else {
      // Operational update
      const parsed = updatePlacementSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          {
            message: "Validation failed.",
            errors: parsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const data = parsed.data;

      const updated = await prisma.$transaction(async (tx) => {
        const pl = await tx.placement.update({
          where: { id },
          data: {
            ...(data.position !== undefined && {
              position: data.position.trim(),
            }),
            ...(data.startDate !== undefined && {
              startDate: data.startDate ? new Date(data.startDate) : null,
            }),
            ...(data.notes !== undefined && {
              notes: data.notes?.trim() || null,
            }),
          },
          select: placementDetailSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: "UPDATE",
          entity: "Placement",
          entityId: pl.id,
          changes: {
            ...(data.position !== undefined && {
              position: {
                before: existing.position,
                after: pl.position,
              },
            }),
            ...(data.startDate !== undefined && {
              startDate: {
                before: existing.startDate,
                after: pl.startDate,
              },
            }),
            ...(data.notes !== undefined && {
              notes: {
                before: existing.notes,
                after: pl.notes,
              },
            }),
          },
        });

        return pl;
      });

      return Response.json(
        {
          message: "Placement updated successfully.",
          data: updated,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/placements/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    {
      message:
        "Placements cannot be deleted; historical records must be preserved.",
    },
    { status: 405, headers: { Allow: "GET, PATCH" } }
  );
}
