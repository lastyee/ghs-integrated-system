import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  isValidInterviewTransition,
  interviewResultSchema,
  updateInterviewSchema,
} from "@/schemas/interview";
import {
  interviewDetailSelect,
  sanitizeInterviewForRole,
} from "../route";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("interview:read");
    const { id } = await params;

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: interviewDetailSelect,
    });

    if (!interview) {
      return Response.json(
        { message: "Interview not found." },
        { status: 404 }
      );
    }

    // Student IDOR Protection: Student can only view their own interview
    if (authenticatedUser.role === "STUDENT") {
      if (interview.application.student.userId !== authenticatedUser.id) {
        return Response.json(
          { message: "Permission denied." },
          { status: 403 }
        );
      }
    }

    return Response.json(
      sanitizeInterviewForRole(interview, authenticatedUser.role),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/interviews/[id] error:", error);
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

    // Determine update type: Result evaluation vs. Operational update
    const isResultUpdate =
      body.status === "PASSED" ||
      body.status === "FAILED" ||
      body.feedback !== undefined;

    if (isResultUpdate) {
      // Result update requires interview:result permission
      const authenticatedUser = await requirePermission("interview:result");

      const parsed = interviewResultSchema.safeParse(body);
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

      const existing = await prisma.interview.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          method: true,
          location: true,
          notes: true,
          feedback: true,
          applicationId: true,
        },
      });

      if (!existing) {
        return Response.json(
          { message: "Interview not found." },
          { status: 404 }
        );
      }

      // Check if interview is in a terminal status
      if (existing.status === "PASSED" || existing.status === "FAILED") {
        return Response.json(
          {
            message: `Cannot change result of an interview that is already in terminal status (${existing.status}).`,
          },
          { status: 409 }
        );
      }

      // Check lifecycle transition
      if (!isValidInterviewTransition(existing.status, data.status)) {
        return Response.json(
          {
            message: `Invalid status transition from ${existing.status} to ${data.status}.`,
          },
          { status: 409 }
        );
      }

      const updatedInterview = await prisma.$transaction(async (tx) => {
        const iv = await tx.interview.update({
          where: { id },
          data: {
            status: data.status,
            ...(data.feedback !== undefined && {
              feedback: data.feedback?.trim() || null,
            }),
            ...(data.notes !== undefined && {
              notes: data.notes?.trim() || null,
            }),
          },
          select: interviewDetailSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: "UPDATE",
          entity: "Interview",
          entityId: iv.id,
          changes: {
            before: {
              status: existing.status,
              feedback: existing.feedback,
              notes: existing.notes,
            },
            after: {
              status: iv.status,
              feedback: iv.feedback,
              notes: iv.notes,
            },
          },
        });

        return iv;
      });

      return Response.json(
        sanitizeInterviewForRole(updatedInterview, authenticatedUser.role),
        { status: 200 }
      );
    } else {
      // Operational update requires interview:update permission
      const authenticatedUser = await requirePermission("interview:update");

      const parsed = updateInterviewSchema.safeParse(body);
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

      const existing = await prisma.interview.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          method: true,
          location: true,
          notes: true,
          feedback: true,
          applicationId: true,
        },
      });

      if (!existing) {
        return Response.json(
          { message: "Interview not found." },
          { status: 404 }
        );
      }

      // Check if interview is in a terminal status
      if (existing.status === "PASSED" || existing.status === "FAILED") {
        return Response.json(
          {
            message: `Cannot update an interview that is already in terminal status (${existing.status}).`,
          },
          { status: 409 }
        );
      }

      if (data.status === "RESCHEDULED") {
        if (!isValidInterviewTransition(existing.status, "RESCHEDULED")) {
          return Response.json(
            {
              message: `Invalid status transition from ${existing.status} to RESCHEDULED.`,
            },
            { status: 409 }
          );
        }
      }

      const updatedInterview = await prisma.$transaction(async (tx) => {
        const iv = await tx.interview.update({
          where: { id },
          data: {
            ...(data.scheduledAt !== undefined && {
              scheduledAt: new Date(data.scheduledAt),
            }),
            ...(data.method !== undefined && {
              method: data.method?.trim() || null,
            }),
            ...(data.location !== undefined && {
              location: data.location?.trim() || null,
            }),
            ...(data.notes !== undefined && {
              notes: data.notes?.trim() || null,
            }),
            ...(data.status !== undefined && {
              status: data.status,
            }),
          },
          select: interviewDetailSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: "UPDATE",
          entity: "Interview",
          entityId: iv.id,
          changes: {
            before: {
              scheduledAt: existing.scheduledAt,
              method: existing.method,
              location: existing.location,
              notes: existing.notes,
              status: existing.status,
            },
            after: {
              scheduledAt: iv.scheduledAt,
              method: iv.method,
              location: iv.location,
              notes: iv.notes,
              status: iv.status,
            },
          },
        });

        return iv;
      });

      return Response.json(
        sanitizeInterviewForRole(updatedInterview, authenticatedUser.role),
        { status: 200 }
      );
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/interviews/[id] error:", error);
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
        "Method Not Allowed. Interview deletion is not permitted. Historical records must be preserved.",
    },
    { status: 405, headers: { Allow: "GET, PATCH" } }
  );
}
