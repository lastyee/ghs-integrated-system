import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  isValidApplicationTransition,
  updateApplicationSchema,
} from "@/schemas/application";
import { applicationDetailSelect } from "../route";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("application:read");
    const { id } = await params;

    const application = await prisma.application.findUnique({
      where: { id },
      select: applicationDetailSelect,
    });

    if (!application) {
      return Response.json(
        { message: "Application not found." },
        { status: 404 }
      );
    }

    // Student IDOR Protection: Student can only view their own application
    if (authenticatedUser.role === "STUDENT") {
      if (application.student.userId !== authenticatedUser.id) {
        return Response.json(
          { message: "Permission denied." },
          { status: 403 }
        );
      }
    }

    return Response.json(application, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/applications/[id] error:", error);
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
    const authenticatedUser = await requirePermission("application:update");
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = updateApplicationSchema.safeParse(body);
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

    const existing = await prisma.application.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        vacancyId: true,
        status: true,
        notes: true,
        student: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!existing) {
      return Response.json(
        { message: "Application not found." },
        { status: 404 }
      );
    }

    // Role-based transition & authorization checks
    if (authenticatedUser.role === "STUDENT") {
      // 1. Ownership check: Must be the owner of the application
      if (existing.student.userId !== authenticatedUser.id) {
        return Response.json(
          { message: "Permission denied." },
          { status: 403 }
        );
      }

      // 2. Student cannot update notes through this endpoint
      if (data.notes !== undefined) {
        return Response.json(
          { message: "Students are not permitted to modify application notes." },
          { status: 403 }
        );
      }

      // 3. Student can only perform APPLIED -> WITHDRAWN
      if (!data.status) {
        return Response.json(
          { message: "No permitted fields provided for student update." },
          { status: 400 }
        );
      }

      if (data.status !== "WITHDRAWN") {
        return Response.json(
          { message: "Students are not permitted to set this application status." },
          { status: 403 }
        );
      }

      // 4. Withdrawal is only allowed when current status is APPLIED
      if (existing.status !== "APPLIED") {
        return Response.json(
          {
            message: `Cannot withdraw application that is currently in ${existing.status} status.`,
          },
          { status: 409 }
        );
      }
    } else {
      // Staff roles (PLACEMENT_STAFF, ADMIN, SUPER_ADMIN)
      if (data.status !== undefined && data.status !== existing.status) {
        if (!isValidApplicationTransition(existing.status, data.status)) {
          return Response.json(
            {
              message: `Invalid status transition from ${existing.status} to ${data.status}.`,
            },
            { status: 409 }
          );
        }
      }
    }

    const updatedApplication = await prisma.$transaction(async (tx) => {
      const app = await tx.application.update({
        where: { id },
        data: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
        },
        select: applicationDetailSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "UPDATE",
        entity: "Application",
        entityId: app.id,
        changes: {
          before: {
            status: existing.status,
            notes: existing.notes,
          },
          after: {
            status: app.status,
            notes: app.notes,
          },
        },
      });

      return app;
    });

    return Response.json(updatedApplication, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/applications/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Application deletion is not permitted." },
    { status: 405, headers: { Allow: "GET, PATCH" } }
  );
}
