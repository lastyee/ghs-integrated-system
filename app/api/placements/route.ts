import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  createPlacementSchema,
  placementQuerySchema,
} from "@/schemas/placement";

const prisma = new PrismaClient();

export const placementDetailSelect = {
  id: true,
  applicationId: true,
  studentId: true,
  employerId: true,
  vacancyId: true,
  position: true,
  startDate: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
      phone: true,
      address: true,
      userId: true,
    },
  },
  employer: {
    select: {
      id: true,
      name: true,
      companyInfo: true,
      address: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
    },
  },
  vacancy: {
    select: {
      id: true,
      title: true,
      description: true,
      requirements: true,
      status: true,
      employerId: true,
    },
  },
  application: {
    select: {
      id: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const authenticatedUser = await requirePermission("placement:read");
    const { searchParams } = new URL(request.url);

    const queryInput = {
      studentId: searchParams.get("studentId") || undefined,
      employerId: searchParams.get("employerId") || undefined,
      vacancyId: searchParams.get("vacancyId") || undefined,
      applicationId: searchParams.get("applicationId") || undefined,
      status: searchParams.get("status") || undefined,
    };

    const parsedQuery = placementQuerySchema.safeParse(queryInput);
    if (!parsedQuery.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsedQuery.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      studentId: queryStudentId,
      employerId,
      vacancyId,
      applicationId,
      status,
    } = parsedQuery.data;

    const where: Prisma.PlacementWhereInput = {};

    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found for this user.");
      }

      if (queryStudentId && queryStudentId !== student.id) {
        throw new ForbiddenError(
          "Students cannot access placements of other students."
        );
      }

      where.studentId = student.id;

      if (employerId) where.employerId = employerId;
      if (vacancyId) where.vacancyId = vacancyId;
      if (applicationId) where.applicationId = applicationId;
      if (status) where.status = status;
    } else {
      // Staff roles & Management
      if (queryStudentId) where.studentId = queryStudentId;
      if (employerId) where.employerId = employerId;
      if (vacancyId) where.vacancyId = vacancyId;
      if (applicationId) where.applicationId = applicationId;
      if (status) where.status = status;
    }

    const placements = await prisma.placement.findMany({
      where,
      select: placementDetailSelect,
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ data: placements }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/placements error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("placement:create");

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = createPlacementSchema.safeParse(body);
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

    // 1. Student must exist
    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
      select: { id: true },
    });
    if (!student) {
      return Response.json(
        { message: "Student not found." },
        { status: 404 }
      );
    }

    // 2. Employer must exist
    const employer = await prisma.employer.findUnique({
      where: { id: data.employerId },
      select: { id: true },
    });
    if (!employer) {
      return Response.json(
        { message: "Employer not found." },
        { status: 404 }
      );
    }

    // 3. Vacancy if provided must exist
    if (data.vacancyId) {
      const vacancy = await prisma.vacancy.findUnique({
        where: { id: data.vacancyId },
        select: { id: true },
      });
      if (!vacancy) {
        return Response.json(
          { message: "Vacancy not found." },
          { status: 404 }
        );
      }
    }

    // 4. Application if provided must exist
    if (data.applicationId) {
      const application = await prisma.application.findUnique({
        where: { id: data.applicationId },
        select: {
          id: true,
          studentId: true,
          placement: { select: { id: true } },
        },
      });

      if (!application) {
        return Response.json(
          { message: "Application not found." },
          { status: 404 }
        );
      }

      // 5. If applicationId provided: application.studentId must match data.studentId
      if (application.studentId !== data.studentId) {
        return Response.json(
          {
            message:
              "Cross-student linkage detected: application does not belong to the specified student.",
          },
          { status: 400 }
        );
      }

      // 6. If applicationId already has a Placement -> 409 Conflict
      if (application.placement) {
        return Response.json(
          {
            message:
              "Application already has an associated placement record.",
          },
          { status: 409 }
        );
      }
    }

    // Execute in transaction with audit log
    const newPlacement = await prisma.$transaction(async (tx) => {
      const created = await tx.placement.create({
        data: {
          studentId: data.studentId,
          employerId: data.employerId,
          position: data.position.trim(),
          vacancyId: data.vacancyId || null,
          applicationId: data.applicationId || null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          notes: data.notes?.trim() || null,
          status: "PREPARATION",
        },
        select: placementDetailSelect,
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "CREATE",
        entity: "Placement",
        entityId: created.id,
        changes: {
          studentId: created.studentId,
          employerId: created.employerId,
          vacancyId: created.vacancyId,
          applicationId: created.applicationId,
          position: created.position,
          startDate: created.startDate,
          status: created.status,
          notes: created.notes,
        },
      });

      return created;
    });

    return Response.json(
      { message: "Placement created successfully.", data: newPlacement },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        {
          message:
            "Application already has an associated placement record.",
        },
        { status: 409 }
      );
    }
    console.error("POST /api/placements error:", error);
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
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
